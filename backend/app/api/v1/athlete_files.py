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
            ai_accessible=r.get("ai_accessible", True),
            status=r.get("status", "pending"),
            size_bytes=r.get("size_bytes"),
            chunk_count=r.get("chunk_count"),
            created_at=str(r.get("created_at") or ""),
        )
        for r in rows
    ]
