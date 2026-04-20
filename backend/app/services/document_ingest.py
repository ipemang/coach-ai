"""COA-86: Document ingestion pipeline — extract → chunk → embed → store.

Processes PDF, TXT, and MD files uploaded to the coach knowledge base.
Stores 500-char chunks with 100-char overlap as 1536-dim OpenAI embeddings
in coach_document_chunks (pgvector).

Called after a coach uploads a file. Runs synchronously (wrapped in
run_in_threadpool by the API endpoint).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.services.llm_client import LLMClient, LLMClientError

logger = logging.getLogger(__name__)

_CHUNK_SIZE = 500
_CHUNK_OVERLAP = 100
_EMBED_BATCH = 100


def _extract_text(file_bytes: bytes, file_type: str) -> str:
    """Extract plain text from file bytes. Supports pdf, txt, md."""
    ft = file_type.lower().strip(".")
    if ft == "pdf":
        try:
            import pypdf
            import io
            reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            pages = [page.extract_text() or "" for page in reader.pages]
            return "\n\n".join(p.strip() for p in pages if p.strip())
        except ImportError:
            raise RuntimeError("pypdf not installed — add 'pypdf' to requirements.txt")
    elif ft in ("txt", "md", "markdown"):
        return file_bytes.decode("utf-8", errors="replace")
    else:
        # Best-effort UTF-8 decode for unknown types
        return file_bytes.decode("utf-8", errors="replace")


def _chunk_text(text: str) -> list[str]:
    """Split text into overlapping fixed-size chunks."""
    text = text.strip()
    if not text:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = start + _CHUNK_SIZE
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = end - _CHUNK_OVERLAP
    return chunks


class DocumentIngestService:
    def __init__(self, supabase: Any, llm: LLMClient | None = None) -> None:
        self._db = supabase
        self._llm = llm or LLMClient()

    def ingest(
        self,
        document_id: str,
        file_bytes: bytes,
        file_type: str,
        coach_id: str,
    ) -> int:
        """Full ingestion pipeline. Returns chunk count on success.

        Side-effects:
          - Inserts rows into coach_document_chunks
          - Updates coach_documents.status + chunk_count

        Raises RuntimeError on unrecoverable failure (after marking status=failed).
        """
        try:
            return self._run(document_id, file_bytes, file_type, coach_id)
        except Exception as exc:
            logger.error("[ingest] Failed for document=%s: %s", document_id[:8], exc)
            self._set_status(document_id, "failed")
            raise RuntimeError(f"Ingestion failed: {exc}") from exc

    def _run(self, document_id: str, file_bytes: bytes, file_type: str, coach_id: str) -> int:
        # 1. Extract
        text = _extract_text(file_bytes, file_type)
        if not text.strip():
            logger.warning("[ingest] No text extracted from document=%s", document_id[:8])
            self._set_status(document_id, "failed")
            return 0

        # 2. Chunk
        chunks = _chunk_text(text)
        if not chunks:
            self._set_status(document_id, "failed")
            return 0

        logger.info("[ingest] document=%s — %d chars → %d chunks", document_id[:8], len(text), len(chunks))

        # 3. Embed (batched)
        try:
            embeddings = self._llm.embed(chunks)
        except LLMClientError as exc:
            raise RuntimeError(f"Embedding failed: {exc}") from exc

        if len(embeddings) != len(chunks):
            raise RuntimeError(f"Embedding count mismatch: {len(embeddings)} vs {len(chunks)} chunks")

        # 4. Bulk insert chunks
        rows = [
            {
                "document_id": document_id,
                "coach_id": coach_id,
                "chunk_index": i,
                "content": chunk,
                "embedding": embedding,
            }
            for i, (chunk, embedding) in enumerate(zip(chunks, embeddings))
        ]
        # Insert in batches of 50 to avoid payload size limits
        for batch_start in range(0, len(rows), 50):
            self._db.table("coach_document_chunks").insert(
                rows[batch_start : batch_start + 50]
            ).execute()

        # 5. Mark processed
        self._db.table("coach_documents").update({
            "status": "processed",
            "chunk_count": len(chunks),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", document_id).execute()

        logger.info("[ingest] document=%s processed — %d chunks stored", document_id[:8], len(chunks))
        return len(chunks)

    def _set_status(self, document_id: str, status: str) -> None:
        try:
            self._db.table("coach_documents").update({
                "status": status,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", document_id).execute()
        except Exception as exc:
            logger.warning("[ingest] Failed to set status=%s for document=%s: %s", status, document_id[:8], exc)


__all__ = ["DocumentIngestService"]
