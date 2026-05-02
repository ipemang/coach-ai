"""COA-85/86: Coach Knowledge Base API — document upload, management, and athlete notes.

Endpoints:
  POST   /api/v1/coach/documents                        — upload + ingest
  GET    /api/v1/coach/documents                        — list documents
  PATCH  /api/v1/coach/documents/{id}                   — toggle ai_accessible / set category
  DELETE /api/v1/coach/documents/{id}                   — delete doc + chunks + storage file

  POST   /api/v1/coach/athletes/{athlete_id}/notes      — create athlete note
  GET    /api/v1/coach/athletes/{athlete_id}/notes      — list athlete notes
  DELETE /api/v1/coach/athletes/{athlete_id}/notes/{note_id} — delete note
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from app.core.security import AuthenticatedPrincipal, require_roles, resolve_coach_scope

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/coach", tags=["knowledge-base"])

_ALLOWED_TYPES = {"pdf", "txt", "md", "markdown"}
_MAX_BYTES = 50 * 1024 * 1024  # 50 MB


# ── Response models ───────────────────────────────────────────────────────────

class DocumentOut(BaseModel):
    id: str
    filename: str
    original_filename: str
    file_type: str
    category: Optional[str]
    ai_accessible: bool
    status: str
    size_bytes: Optional[int]
    chunk_count: Optional[int]
    created_at: str


class DocumentPatchRequest(BaseModel):
    ai_accessible: Optional[bool] = None
    category: Optional[Literal["methodology", "nutrition", "workout_prescription", "race_strategy", "other"]] = None


class AthleteNoteIn(BaseModel):
    note_text: str
    note_type: Literal["general", "injury", "performance", "goal", "nutrition"] = "general"


class AthleteNoteOut(BaseModel):
    id: str
    note_type: str
    note_text: str
    created_at: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_coach_id(principal: AuthenticatedPrincipal) -> str:
    scope = resolve_coach_scope(principal)
    if not scope.coach_id:
        raise HTTPException(status_code=403, detail="Coach ID not resolved")
    return scope.coach_id


def _supabase(request: Request):
    return request.app.state.supabase_client


def _ext(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


# ── Document endpoints ────────────────────────────────────────────────────────

@router.post("/documents", response_model=DocumentOut)
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    category: Optional[str] = Form(None),
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """Upload a coaching document (PDF/TXT/MD) and trigger async ingestion."""
    coach_id = _get_coach_id(principal)
    supabase = _supabase(request)

    file_ext = _ext(file.filename or "")
    if file_ext not in _ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type '.{file_ext}'. Allowed: pdf, txt, md")

    file_bytes = await file.read()
    if len(file_bytes) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 50 MB limit")
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    document_id = str(uuid.uuid4())
    storage_path = f"{coach_id}/{document_id}/{file.filename}"

    # Upload to Supabase Storage
    try:
        supabase.storage.from_("coach-documents").upload(
            path=storage_path,
            file=file_bytes,
            file_options={"content-type": file.content_type or "application/octet-stream"},
        )
    except Exception as exc:
        logger.error("[kb] Storage upload failed for coach=%s: %s", coach_id[:8], exc)
        raise HTTPException(status_code=500, detail="File storage failed")

    file_url = f"coach-documents/{storage_path}"

    # Insert document row
    doc_row = {
        "id": document_id,
        "coach_id": coach_id,
        "filename": f"{document_id}.{file_ext}",
        "original_filename": file.filename,
        "file_url": file_url,
        "file_type": file_ext,
        "category": category,
        "ai_accessible": False,
        "status": "pending",
        "size_bytes": len(file_bytes),
    }
    try:
        result = supabase.table("coach_documents").insert(doc_row).execute()
        row = result.data[0] if result.data else doc_row
    except Exception as exc:
        logger.error("[kb] DB insert failed: %s", exc)
        raise HTTPException(status_code=500, detail="Database insert failed")

    # Trigger ingestion asynchronously
    async def _ingest_bg():
        from app.services.document_ingest import DocumentIngestService
        try:
            svc = DocumentIngestService(supabase)
            count = await run_in_threadpool(svc.ingest, document_id, file_bytes, file_ext, coach_id)
            logger.info("[kb] Ingestion complete: document=%s chunks=%d", document_id[:8], count)
        except Exception as exc:
            logger.error("[kb] Background ingestion failed for document=%s: %s", document_id[:8], exc)

    import asyncio
    asyncio.ensure_future(_ingest_bg())

    return DocumentOut(
        id=row["id"],
        filename=row["filename"],
        original_filename=row["original_filename"],
        file_type=row["file_type"],
        category=row.get("category"),
        ai_accessible=row.get("ai_accessible", False),
        status=row.get("status", "pending"),
        size_bytes=row.get("size_bytes"),
        chunk_count=row.get("chunk_count"),
        created_at=str(row.get("created_at") or datetime.now(timezone.utc).isoformat()),
    )


@router.get("/documents", response_model=list[DocumentOut])
async def list_documents(
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    coach_id = _get_coach_id(principal)
    supabase = _supabase(request)
    try:
        result = supabase.table("coach_documents").select("*").eq(
            "coach_id", coach_id
        ).order("created_at", desc=True).execute()
        rows = result.data or []
    except Exception as exc:
        logger.error("[kb] list_documents failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to list documents")

    return [
        DocumentOut(
            id=r["id"],
            filename=r["filename"],
            original_filename=r["original_filename"],
            file_type=r["file_type"],
            category=r.get("category"),
            ai_accessible=r.get("ai_accessible", False),
            status=r.get("status", "pending"),
            size_bytes=r.get("size_bytes"),
            chunk_count=r.get("chunk_count"),
            created_at=str(r.get("created_at") or ""),
        )
        for r in rows
    ]


@router.patch("/documents/{document_id}", response_model=DocumentOut)
async def patch_document(
    document_id: str,
    body: DocumentPatchRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """Toggle ai_accessible and/or update category."""
    coach_id = _get_coach_id(principal)
    supabase = _supabase(request)

    updates: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if body.ai_accessible is not None:
        updates["ai_accessible"] = body.ai_accessible
    if body.category is not None:
        updates["category"] = body.category

    try:
        result = supabase.table("coach_documents").update(updates).eq(
            "id", document_id
        ).eq("coach_id", coach_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Document not found")
        row = result.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("[kb] patch_document failed: %s", exc)
        raise HTTPException(status_code=500, detail="Update failed")

    return DocumentOut(
        id=row["id"],
        filename=row["filename"],
        original_filename=row["original_filename"],
        file_type=row["file_type"],
        category=row.get("category"),
        ai_accessible=row.get("ai_accessible", False),
        status=row.get("status", "pending"),
        size_bytes=row.get("size_bytes"),
        chunk_count=row.get("chunk_count"),
        created_at=str(row.get("created_at") or ""),
    )


@router.post("/documents/{document_id}/reingest", response_model=DocumentOut, status_code=202)
async def reingest_document(
    document_id: str,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """COA-90: Delete chunks and re-embed an existing document from its stored file.

    Useful after categorisation changes or failed ingestion. The stored file in
    Supabase Storage is not re-uploaded — chunks are rebuilt from the existing bytes.
    Returns 202 Accepted immediately; re-ingestion runs in the background.
    """
    coach_id = _get_coach_id(principal)
    supabase = _supabase(request)

    # Verify ownership + fetch metadata
    try:
        result = supabase.table("coach_documents").select("*").eq(
            "id", document_id
        ).eq("coach_id", coach_id).limit(1).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Document not found")
        doc = result.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    file_url = doc.get("file_url") or ""
    file_type = doc.get("file_type") or "txt"
    if not file_url:
        raise HTTPException(status_code=422, detail="Document has no stored file — cannot reingest")

    # Download stored file from Supabase Storage
    storage_path = file_url.replace("coach-documents/", "", 1)
    try:
        file_bytes = supabase.storage.from_("coach-documents").download(storage_path)
    except Exception as exc:
        logger.error("[kb] Storage download failed for reingest document=%s: %s", document_id[:8], exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve stored file")

    if not file_bytes:
        raise HTTPException(status_code=422, detail="Stored file is empty — cannot reingest")

    # Delete existing chunks (chunks cascade from coach_documents but we delete explicitly
    # so the new ingest starts from a clean slate even before the status update lands)
    try:
        supabase.table("coach_document_chunks").delete().eq("document_id", document_id).execute()
    except Exception as exc:
        logger.warning("[kb] Failed to delete existing chunks for document=%s: %s", document_id[:8], exc)

    # Reset status → pending so the UI shows the re-ingestion is in progress
    try:
        supabase.table("coach_documents").update({
            "status": "pending",
            "chunk_count": None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", document_id).execute()
    except Exception as exc:
        logger.warning("[kb] Failed to reset document status for document=%s: %s", document_id[:8], exc)

    # Trigger background re-ingestion
    async def _reingest_bg() -> None:
        from app.services.document_ingest import DocumentIngestService
        try:
            svc = DocumentIngestService(supabase)
            count = await run_in_threadpool(svc.ingest, document_id, file_bytes, file_type, coach_id)
            logger.info("[kb] Re-ingestion complete: document=%s chunks=%d", document_id[:8], count)
        except Exception as exc:
            logger.error("[kb] Background re-ingestion failed for document=%s: %s", document_id[:8], exc)

    import asyncio as _asyncio
    _asyncio.ensure_future(_reingest_bg())

    logger.info("[COA-90] Triggered re-ingestion for document=%s coach=%s", document_id[:8], coach_id[:8])
    return DocumentOut(
        id=doc["id"],
        filename=doc["filename"],
        original_filename=doc["original_filename"],
        file_type=doc["file_type"],
        category=doc.get("category"),
        ai_accessible=doc.get("ai_accessible", False),
        status="pending",
        size_bytes=doc.get("size_bytes"),
        chunk_count=None,
        created_at=str(doc.get("created_at") or ""),
    )


@router.delete("/documents/{document_id}", status_code=204)
async def delete_document(
    document_id: str,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """Delete document, all chunks, and the storage file."""
    coach_id = _get_coach_id(principal)
    supabase = _supabase(request)

    # Fetch to confirm ownership + get storage path
    try:
        result = supabase.table("coach_documents").select(
            "file_url, coach_id"
        ).eq("id", document_id).eq("coach_id", coach_id).limit(1).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Document not found")
        file_url = result.data[0].get("file_url") or ""
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    # Delete storage file (non-fatal if missing)
    if file_url:
        storage_path = file_url.replace("coach-documents/", "", 1)
        try:
            supabase.storage.from_("coach-documents").remove([storage_path])
        except Exception as exc:
            logger.warning("[kb] Storage delete failed (non-fatal): %s", exc)

    # Delete DB row — chunks cascade automatically
    try:
        supabase.table("coach_documents").delete().eq("id", document_id).eq("coach_id", coach_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ── Athlete notes endpoints ───────────────────────────────────────────────────

@router.post("/athletes/{athlete_id}/notes", response_model=AthleteNoteOut, status_code=201)
async def create_athlete_note(
    athlete_id: str,
    body: AthleteNoteIn,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    coach_id = _get_coach_id(principal)
    supabase = _supabase(request)
    try:
        result = supabase.table("coach_athlete_notes").insert({
            "coach_id": coach_id,
            "athlete_id": athlete_id,
            "note_text": body.note_text.strip(),
            "note_type": body.note_type,
        }).execute()
        row = result.data[0]
    except Exception as exc:
        logger.error("[kb] create_athlete_note failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to create note")

    return AthleteNoteOut(
        id=row["id"],
        note_type=row["note_type"],
        note_text=row["note_text"],
        created_at=str(row.get("created_at") or ""),
    )


@router.get("/athletes/{athlete_id}/notes", response_model=list[AthleteNoteOut])
async def list_athlete_notes(
    athlete_id: str,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    coach_id = _get_coach_id(principal)
    supabase = _supabase(request)
    try:
        result = supabase.table("coach_athlete_notes").select("*").eq(
            "coach_id", coach_id
        ).eq("athlete_id", athlete_id).order("created_at", desc=True).execute()
        rows = result.data or []
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return [
        AthleteNoteOut(id=r["id"], note_type=r["note_type"], note_text=r["note_text"], created_at=str(r.get("created_at") or ""))
        for r in rows
    ]


@router.delete("/athletes/{athlete_id}/notes/{note_id}", status_code=204)
async def delete_athlete_note(
    athlete_id: str,
    note_id: str,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    coach_id = _get_coach_id(principal)
    supabase = _supabase(request)
    try:
        supabase.table("coach_athlete_notes").delete().eq(
            "id", note_id
        ).eq("coach_id", coach_id).eq("athlete_id", athlete_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
