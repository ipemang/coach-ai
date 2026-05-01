"""COA-95: Athlete file uploads — upload, list, delete, coach view.

Endpoints (athlete-facing):
  POST   /api/v1/athlete/files              — athlete uploads a file
  GET    /api/v1/athlete/files              — athlete lists their own files
  DELETE /api/v1/athlete/files/{file_id}    — athlete deletes a file

Endpoints (coach-facing):
  GET    /api/v1/coach/athletes/{athlete_id}/files   — coach views an athlete's files

Files are stored in Supabase Storage bucket 'athlete-files' at path:
  {athlete_id}/{file_uuid}/{original_filename}

Text/PDF files are automatically ingested into athlete_file_chunks (pgvector)
so the AI coaching context includes uploaded athlete data.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from app.core.security import AuthenticatedPrincipal, require_roles, resolve_athlete_scope, resolve_coach_scope

logger = logging.getLogger(__name__)

router = APIRouter(tags=["athlete-files"])

_ALLOWED_TYPES = {"pdf", "txt", "md", "markdown", "csv"}
_MAX_BYTES = 50 * 1024 * 1024  # 50 MB


# ── Response models ───────────────────────────────────────────────────────────

class AthleteFileOut(BaseModel):
    id: str
    original_filename: str
    file_type: str
    category: Optional[str]
    description: Optional[str]
    document_type: Optional[str]   # COA-66: dexa | blood_work | doctor_notes | training_plan | race_results | other
    uploaded_by: Optional[str]     # COA-66: athlete | coach
    ai_accessible: bool
    status: str
    size_bytes: Optional[int]
    chunk_count: Optional[int]
    created_at: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _ext(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def _ingest_athlete_file(
    supabase,
    file_id: str,
    file_bytes: bytes,
    file_type: str,
    athlete_id: str,
    coach_id: str,
) -> int:
    """Synchronous ingestion — run via run_in_threadpool.
    Reuses the same extract/chunk/embed pipeline as coach documents,
    but stores results in athlete_file_chunks.
    """
    from app.services.document_ingest import _extract_text, _chunk_text
    from app.services.llm_client import LLMClient, LLMClientError, LLMResponse
    from app.services.usage_logger import UsageLogger

    def _set_status(status: str) -> None:
        try:
            supabase.table("athlete_files").update({
                "status": status,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", file_id).execute()
        except Exception as exc:
            logger.warning("[athlete_ingest] Failed to set status=%s for file=%s: %s", status, file_id[:8], exc)

    try:
        text = _extract_text(file_bytes, file_type)
        if not text.strip():
            _set_status("failed")
            return 0

        chunks = _chunk_text(text)
        if not chunks:
            _set_status("failed")
            return 0

        logger.info("[athlete_ingest] file=%s — %d chars → %d chunks", file_id[:8], len(text), len(chunks))

        llm = LLMClient()
        try:
            embed_resp = llm.embed(chunks)
            embeddings = embed_resp.embeddings
            UsageLogger.log_sync(
                supabase=supabase,
                response=LLMResponse(
                    content="",
                    input_tokens=embed_resp.total_tokens,
                    output_tokens=0,
                    model=embed_resp.model,
                    latency_ms=0,
                ),
                event_type="athlete_file_embed",
                coach_id=coach_id,
                athlete_id=athlete_id,
                endpoint="/api/v1/athlete/files",
                metadata={"file_id": file_id, "chunk_count": len(chunks)},
            )
        except LLMClientError as exc:
            _set_status("failed")
            raise RuntimeError(f"Embedding failed: {exc}") from exc

        if len(embeddings) != len(chunks):
            _set_status("failed")
            raise RuntimeError(f"Embedding count mismatch: {len(embeddings)} vs {len(chunks)}")

        rows = [
            {
                "file_id": file_id,
                "athlete_id": athlete_id,
                "coach_id": coach_id,
                "chunk_index": i,
                "content": chunk,
                "embedding": embedding,
            }
            for i, (chunk, embedding) in enumerate(zip(chunks, embeddings))
        ]
        for batch_start in range(0, len(rows), 50):
            supabase.table("athlete_file_chunks").insert(
                rows[batch_start: batch_start + 50]
            ).execute()

        supabase.table("athlete_files").update({
            "status": "processed",
            "chunk_count": len(chunks),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", file_id).execute()

        logger.info("[athlete_ingest] file=%s processed — %d chunks stored", file_id[:8], len(chunks))
        return len(chunks)

    except RuntimeError:
        raise
    except Exception as exc:
        logger.error("[athlete_ingest] Failed for file=%s: %s", file_id[:8], exc)
        _set_status("failed")
        raise RuntimeError(f"Ingestion failed: {exc}") from exc


# ── Athlete: upload a file ────────────────────────────────────────────────────

@router.post(
    "/api/v1/athlete/files",
    response_model=AthleteFileOut,
    summary="Athlete uploads a personal file (COA-95)",
)
async def upload_athlete_file(
    request: Request,
    file: UploadFile = File(...),
    category: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete", "authenticated")),
):
    """Upload a file to the athlete's personal knowledge base.

    Allowed types: pdf, txt, md, csv (max 50 MB).
    Text-extractable files are automatically chunked and embedded for AI coaching context.
    The file is stored under athlete-files/{athlete_id}/{uuid}/{filename} in Supabase Storage.
    """
    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    athlete_id, coach_id = resolve_athlete_scope(principal)

    file_ext = _ext(file.filename or "unnamed")
    if file_ext not in _ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '.{file_ext}'. Allowed: pdf, txt, md, csv",
        )

    file_bytes = await file.read()
    if len(file_bytes) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 50 MB limit")
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    file_id = str(uuid.uuid4())
    original_filename = file.filename or f"upload.{file_ext}"
    storage_path = f"{athlete_id}/{file_id}/{original_filename}"

    # Upload to Supabase Storage
    try:
        supabase.storage.from_("athlete-files").upload(
            path=storage_path,
            file=file_bytes,
            file_options={"content-type": file.content_type or "application/octet-stream"},
        )
    except Exception as exc:
        logger.error("[athlete_files] Storage upload failed for athlete=%s: %s", athlete_id[:8], exc)
        raise HTTPException(status_code=500, detail="File storage failed")

    file_url = f"athlete-files/{storage_path}"

    # Insert metadata row
    file_row = {
        "id": file_id,
        "athlete_id": athlete_id,
        "coach_id": coach_id,
        "filename": f"{file_id}.{file_ext}",
        "original_filename": original_filename,
        "file_url": file_url,
        "file_type": file_ext,
        "category": category,
        "description": description,
        "ai_accessible": True,
        "status": "pending",
        "size_bytes": len(file_bytes),
    }
    try:
        result = supabase.table("athlete_files").insert(file_row).execute()
        row = result.data[0] if result.data else file_row
    except Exception as exc:
        logger.error("[athlete_files] DB insert failed: %s", exc)
        raise HTTPException(status_code=500, detail="Database insert failed")

    # Append file upload note to memory_summary immediately (before ingestion)
    try:
        cat_label = category or "general"
        mem_note = f"\n\n[Document uploaded: {original_filename} (category: {cat_label}, size: {len(file_bytes) // 1024} KB)]"
        athlete_row = supabase.table("athletes").select("memory_summary").eq("id", athlete_id).single().execute()
        current_mem = (athlete_row.data.get("memory_summary") or "") if athlete_row.data else ""
        supabase.table("athletes").update({"memory_summary": current_mem + mem_note}).eq("id", athlete_id).execute()
    except Exception as mem_exc:
        logger.warning("[athlete_files] Could not update memory_summary for athlete=%s: %s", athlete_id[:8], mem_exc)

    # Trigger ingestion asynchronously (only for text-extractable types)
    if file_ext in {"pdf", "txt", "md", "markdown"}:
        async def _ingest_bg():
            try:
                count = await run_in_threadpool(
                    _ingest_athlete_file, supabase, file_id, file_bytes, file_ext, athlete_id, coach_id
                )
                logger.info("[athlete_files] Ingestion complete: file=%s chunks=%d", file_id[:8], count)
            except Exception as exc:
                logger.error("[athlete_files] Background ingestion failed for file=%s: %s", file_id[:8], exc)

        asyncio.ensure_future(_ingest_bg())
    else:
        # CSV and unknown types: mark processed immediately (no embedding)
        try:
            supabase.table("athlete_files").update({"status": "processed"}).eq("id", file_id).execute()
            row["status"] = "processed"
        except Exception:
            pass

    return AthleteFileOut(
        id=row["id"],
        original_filename=row["original_filename"],
        file_type=row["file_type"],
        category=row.get("category"),
        description=row.get("description"),
        document_type=row.get("document_type"),
        uploaded_by=row.get("uploaded_by", "athlete"),
        ai_accessible=row.get("ai_accessible", True),
        status=row.get("status", "pending"),
        size_bytes=row.get("size_bytes"),
        chunk_count=row.get("chunk_count"),
        created_at=str(row.get("created_at") or datetime.now(timezone.utc).isoformat()),
    )


# ── Athlete: list their own files ─────────────────────────────────────────────

@router.get(
    "/api/v1/athlete/files",
    response_model=list[AthleteFileOut],
    summary="List athlete's own files (COA-95)",
)
async def list_athlete_files(
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete", "authenticated")),
):
    """Return all files uploaded by the authenticated athlete, newest first."""
    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    athlete_id, _ = resolve_athlete_scope(principal)

    try:
        result = supabase.table("athlete_files").select("*").eq(
            "athlete_id", athlete_id
        ).order("created_at", desc=True).execute()
        rows = result.data or []
    except Exception as exc:
        logger.error("[athlete_files] list failed for athlete=%s: %s", athlete_id[:8], exc)
        raise HTTPException(status_code=500, detail="Failed to list files")

    return [
        AthleteFileOut(
            id=r["id"],
            original_filename=r["original_filename"],
            file_type=r["file_type"],
            category=r.get("category"),
            description=r.get("description"),
            document_type=r.get("document_type"),
            uploaded_by=r.get("uploaded_by", "athlete"),
            ai_accessible=r.get("ai_accessible", True),
            status=r.get("status", "pending"),
            size_bytes=r.get("size_bytes"),
            chunk_count=r.get("chunk_count"),
            created_at=str(r.get("created_at") or ""),
        )
        for r in rows
    ]


# ── Athlete: delete a file ────────────────────────────────────────────────────

@router.delete(
    "/api/v1/athlete/files/{file_id}",
    summary="Athlete deletes one of their files (COA-95)",
)
async def delete_athlete_file(
    file_id: str,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete", "authenticated")),
):
    """Delete a file and its embedding chunks. Removes the object from Supabase Storage."""
    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    athlete_id, _ = resolve_athlete_scope(principal)

    # Verify ownership
    try:
        row = supabase.table("athlete_files").select("id, file_url").eq(
            "id", file_id
        ).eq("athlete_id", athlete_id).single().execute()
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")

    if not row.data:
        raise HTTPException(status_code=404, detail="File not found")

    file_url = row.data.get("file_url", "")

    # Delete embedding chunks (cascade would handle this, but let's be explicit)
    try:
        supabase.table("athlete_file_chunks").delete().eq("file_id", file_id).execute()
    except Exception:
        pass

    # Delete metadata row
    try:
        supabase.table("athlete_files").delete().eq("id", file_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to delete file record") from exc

    # Delete from storage (non-fatal — orphaned objects are cleaned up by scheduled task)
    storage_path = file_url.removeprefix("athlete-files/") if file_url.startswith("athlete-files/") else file_url
    try:
        supabase.storage.from_("athlete-files").remove([storage_path])
    except Exception:
        logger.warning("[athlete_files] Could not remove storage object %s — continuing", storage_path)

    logger.info("[athlete_files] Deleted file %s for athlete %s", file_id[:8], athlete_id[:8])
    return {"deleted": True, "file_id": file_id}


# ── Coach: view an athlete's files ───────────────────────────────────────────

@router.get(
    "/api/v1/coach/athletes/{athlete_id}/files",
    response_model=list[AthleteFileOut],
    summary="Coach views an athlete's uploaded files (COA-95)",
)
async def coach_list_athlete_files(
    athlete_id: str,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach", "admin")),
):
    """Coach-facing endpoint. Returns all files uploaded by a specific athlete.
    Scoped to the authenticated coach — cannot access another coach's athletes.
    """
    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    scope = resolve_coach_scope(principal)

    # Verify the athlete belongs to this coach
    try:
        check = supabase.table("athletes").select("id").eq(
            "id", athlete_id
        ).eq("coach_id", scope.coach_id).single().execute()
        if not check.data:
            raise HTTPException(status_code=404, detail="Athlete not found")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Athlete not found") from exc

    try:
        result = supabase.table("athlete_files").select("*").eq(
            "athlete_id", athlete_id
        ).order("created_at", desc=True).execute()
        rows = result.data or []
    except Exception as exc:
        logger.error("[athlete_files] coach list failed for athlete=%s: %s", athlete_id[:8], exc)
        raise HTTPException(status_code=500, detail="Failed to list files")

    return [
        AthleteFileOut(
            id=r["id"],
            original_filename=r["original_filename"],
            file_type=r["file_type"],
            category=r.get("category"),
            description=r.get("description"),
            document_type=r.get("document_type"),
            uploaded_by=r.get("uploaded_by", "athlete"),
            ai_accessible=r.get("ai_accessible", True),
            status=r.get("status", "pending"),
            size_bytes=r.get("size_bytes"),
            chunk_count=r.get("chunk_count"),
            created_at=str(r.get("created_at") or ""),
        )
        for r in rows
    ]


# ── COA-66: Coach uploads a file on behalf of an athlete ─────────────────────

class CoachFileToggleRequest(BaseModel):
    ai_accessible: Optional[bool] = None
    document_type: Optional[str] = None


@router.post(
    "/api/v1/coach/athletes/{athlete_id}/files",
    response_model=AthleteFileOut,
    summary="Coach uploads a document for an athlete (COA-66)",
)
async def coach_upload_athlete_file(
    athlete_id: str,
    request: Request,
    file: UploadFile = File(...),
    document_type: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    ai_accessible: bool = Form(True),
    principal: AuthenticatedPrincipal = Depends(require_roles("coach", "admin")),
):
    """Coach uploads a health document on behalf of an athlete."""
    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    scope = resolve_coach_scope(principal)

    try:
        check = supabase.table("athletes").select("id").eq(
            "id", athlete_id
        ).eq("coach_id", scope.coach_id).single().execute()
        if not check.data:
            raise HTTPException(status_code=404, detail="Athlete not found")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Athlete not found") from exc

    file_ext = _ext(file.filename or "unnamed")
    if file_ext not in _ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '.{file_ext}'. Allowed: pdf, txt, md, csv",
        )

    file_bytes = await file.read()
    if len(file_bytes) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 50 MB limit")
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    file_id = str(uuid.uuid4())
    original_filename = file.filename or f"upload.{file_ext}"
    storage_path = f"{athlete_id}/{file_id}/{original_filename}"

    try:
        supabase.storage.from_("athlete-files").upload(
            path=storage_path,
            file=file_bytes,
            file_options={"content-type": file.content_type or "application/octet-stream"},
        )
    except Exception as exc:
        logger.error("[coa66] Storage upload failed for athlete=%s: %s", athlete_id[:8], exc)
        raise HTTPException(status_code=500, detail="File storage failed")

    file_row = {
        "id": file_id,
        "athlete_id": athlete_id,
        "coach_id": str(scope.coach_id),
        "filename": f"{file_id}.{file_ext}",
        "original_filename": original_filename,
        "file_url": f"athlete-files/{storage_path}",
        "file_type": file_ext,
        "category": document_type or "general",
        "document_type": document_type,
        "description": description,
        "ai_accessible": ai_accessible,
        "uploaded_by": "coach",
        "status": "pending",
        "size_bytes": len(file_bytes),
    }
    try:
        result = supabase.table("athlete_files").insert(file_row).execute()
        row = result.data[0] if result.data else file_row
    except Exception as exc:
        logger.error("[coa66] DB insert failed: %s", exc)
        raise HTTPException(status_code=500, detail="Database insert failed")

    if ai_accessible and file_ext in {"pdf", "txt", "md", "markdown"}:
        async def _ingest_bg():
            try:
                count = await run_in_threadpool(
                    _ingest_athlete_file, supabase, file_id, file_bytes, file_ext,
                    athlete_id, str(scope.coach_id),
                )
                logger.info("[coa66] Coach upload ingestion: file=%s chunks=%d", file_id[:8], count)
            except Exception as exc:
                logger.error("[coa66] Background ingestion failed: %s", exc)
        asyncio.ensure_future(_ingest_bg())
    else:
        try:
            supabase.table("athlete_files").update({"status": "processed"}).eq("id", file_id).execute()
            row["status"] = "processed"
        except Exception:
            pass

    logger.info("[coa66] Coach=%s uploaded file=%s for athlete=%s",
                str(scope.coach_id)[:8], file_id[:8], athlete_id[:8])
    return AthleteFileOut(
        id=row["id"],
        original_filename=row["original_filename"],
        file_type=row["file_type"],
        category=row.get("category"),
        description=row.get("description"),
        document_type=row.get("document_type"),
        uploaded_by=row.get("uploaded_by", "coach"),
        ai_accessible=row.get("ai_accessible", True),
        status=row.get("status", "pending"),
        size_bytes=row.get("size_bytes"),
        chunk_count=row.get("chunk_count"),
        created_at=str(row.get("created_at") or datetime.now(timezone.utc).isoformat()),
    )


# ── COA-66: Coach toggles AI access or updates document_type ─────────────────

@router.patch(
    "/api/v1/coach/athletes/{athlete_id}/files/{file_id}",
    response_model=AthleteFileOut,
    summary="Coach toggles AI access or sets document type (COA-66)",
)
async def coach_patch_athlete_file(
    athlete_id: str,
    file_id: str,
    body: CoachFileToggleRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach", "admin")),
):
    """Toggle ai_accessible and/or set document_type on an athlete's file."""
    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    scope = resolve_coach_scope(principal)

    try:
        row = supabase.table("athlete_files").select("*").eq(
            "id", file_id
        ).eq("athlete_id", athlete_id).single().execute()
        if not row.data:
            raise HTTPException(status_code=404, detail="File not found")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        check = supabase.table("athletes").select("id").eq(
            "id", athlete_id
        ).eq("coach_id", scope.coach_id).single().execute()
        if not check.data:
            raise HTTPException(status_code=403, detail="Access denied")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=403, detail="Access denied")

    update: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if body.ai_accessible is not None:
        update["ai_accessible"] = body.ai_accessible
    if body.document_type is not None:
        update["document_type"] = body.document_type
        update["category"] = body.document_type

    if len(update) == 1:
        r = row.data
    else:
        try:
            result = supabase.table("athlete_files").update(update).eq("id", file_id).execute()
            r = result.data[0] if result.data else {**row.data, **update}
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    logger.info("[coa66] Coach=%s patched file=%s ai_accessible=%s",
                str(scope.coach_id)[:8], file_id[:8], update.get("ai_accessible"))
    return AthleteFileOut(
        id=r["id"],
        original_filename=r["original_filename"],
        file_type=r["file_type"],
        category=r.get("category"),
        description=r.get("description"),
        document_type=r.get("document_type"),
        uploaded_by=r.get("uploaded_by", "athlete"),
        ai_accessible=r.get("ai_accessible", True),
        status=r.get("status", "pending"),
        size_bytes=r.get("size_bytes"),
        chunk_count=r.get("chunk_count"),
        created_at=str(r.get("created_at") or ""),
    )


# ── COA-66: Coach deletes one of an athlete's files ───────────────────────────

@router.delete(
    "/api/v1/coach/athletes/{athlete_id}/files/{file_id}",
    summary="Coach deletes an athlete's document (COA-66)",
)
async def coach_delete_athlete_file(
    athlete_id: str,
    file_id: str,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach", "admin")),
):
    """Delete a document from an athlete's vault. Removes storage object and embedding chunks."""
    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    scope = resolve_coach_scope(principal)

    try:
        row = supabase.table("athlete_files").select("id, file_url").eq(
            "id", file_id
        ).eq("athlete_id", athlete_id).single().execute()
        if not row.data:
            raise HTTPException(status_code=404, detail="File not found")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        check = supabase.table("athletes").select("id").eq(
            "id", athlete_id
        ).eq("coach_id", scope.coach_id).single().execute()
        if not check.data:
            raise HTTPException(status_code=403, detail="Access denied")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=403, detail="Access denied")

    file_url = row.data.get("file_url", "")

    try:
        supabase.table("athlete_file_chunks").delete().eq("file_id", file_id).execute()
    except Exception:
        pass

    try:
        supabase.table("athlete_files").delete().eq("id", file_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to delete file record") from exc

    storage_path = file_url.removeprefix("athlete-files/") if file_url.startswith("athlete-files/") else file_url
    try:
        supabase.storage.from_("athlete-files").remove([storage_path])
    except Exception:
        logger.warning("[coa66] Could not remove storage object %s", storage_path)

    logger.info("[coa66] Coach=%s deleted file=%s for athlete=%s",
                str(scope.coach_id)[:8], file_id[:8], athlete_id[:8])
    return {"deleted": True, "file_id": file_id}


# ── COA-66: Short-lived signed URL for document preview ──────────────────────

@router.get(
    "/api/v1/coach/athletes/{athlete_id}/files/{file_id}/url",
    summary="Get a signed download URL for an athlete's document (COA-66)",
)
async def coach_get_signed_url(
    athlete_id: str,
    file_id: str,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach", "admin")),
):
    """Returns a signed URL valid for 15 minutes. Never exposes raw storage paths."""
    supabase = getattr(request.app.state, "supabase_client", None)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not available")

    scope = resolve_coach_scope(principal)

    try:
        row = supabase.table("athlete_files").select("file_url").eq(
            "id", file_id
        ).eq("athlete_id", athlete_id).single().execute()
        if not row.data:
            raise HTTPException(status_code=404, detail="File not found")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        check = supabase.table("athletes").select("id").eq(
            "id", athlete_id
        ).eq("coach_id", scope.coach_id).single().execute()
        if not check.data:
            raise HTTPException(status_code=403, detail="Access denied")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=403, detail="Access denied")

    file_url = row.data.get("file_url", "")
    storage_path = file_url.removeprefix("athlete-files/") if file_url.startswith("athlete-files/") else file_url

    try:
        result = supabase.storage.from_("athlete-files").create_signed_url(storage_path, 900)
        signed_url = result.get("signedURL") or result.get("signed_url") or result.get("signedUrl")
        if not signed_url:
            raise ValueError(f"No signed URL in storage response: {result}")
    except Exception as exc:
        logger.error("[coa66] Signed URL generation failed for file=%s: %s", file_id[:8], exc)
        raise HTTPException(status_code=500, detail="Could not generate download URL") from exc

    return {"url": signed_url, "expires_in_seconds": 900}
