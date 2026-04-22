"""COA-87: Document retrieval service — semantic search over coach knowledge base.

Two-tier RAG at message time:
  Tier 1 (always): athlete memory summary + coach notes on this athlete
  Tier 2 (search): top-k chunks from coach's approved documents via pgvector cosine similarity

Both tiers are assembled here and returned as formatted prompt blocks for
injection into _build_system_prompt.
"""
from __future__ import annotations

import logging
from typing import Any

from app.services.llm_client import LLMClient, LLMResponse
from app.services.usage_logger import UsageLogger

logger = logging.getLogger(__name__)

_DEFAULT_TOP_K = 3
_DEFAULT_MIN_SIMILARITY = 0.72


class DocumentRetrievalService:
    def __init__(self, supabase: Any, llm: LLMClient | None = None) -> None:
        self._db = supabase
        self._llm = llm or LLMClient()

    def get_coach_athlete_notes(self, coach_id: str, athlete_id: str) -> str:
        """Return Tier-1 coach notes for this athlete as a formatted prompt block.

        Always injected — no similarity threshold. Returns empty string if none exist.
        """
        try:
            result = self._db.table("coach_athlete_notes").select(
                "note_type, note_text, created_at"
            ).eq("coach_id", coach_id).eq("athlete_id", athlete_id).order(
                "created_at", desc=True
            ).limit(20).execute()
            rows = result.data or []
        except Exception as exc:
            logger.warning("[retrieval] Failed to fetch coach athlete notes: %s", exc)
            return ""

        if not rows:
            return ""

        lines = []
        for row in rows:
            dt = str(row.get("created_at") or "")[:10]
            ntype = str(row.get("note_type") or "general").upper()
            text = str(row.get("note_text") or "").strip()
            if text:
                lines.append(f"  [{dt}] {ntype}: {text}")

        if not lines:
            return ""

        return "## Coach Notes on Athlete\n" + "\n".join(lines)

    def retrieve_knowledge(
        self,
        coach_id: str,
        query_text: str,
        top_k: int = _DEFAULT_TOP_K,
        min_similarity: float = _DEFAULT_MIN_SIMILARITY,
    ) -> str:
        """Return Tier-2 knowledge base chunks as a formatted prompt block.

        Embeds query_text, runs cosine similarity search against coach's
        approved documents. Returns empty string if no relevant chunks found.
        """
        if not query_text.strip():
            return ""

        # Embed the query
        try:
            embed_resp = self._llm.embed([query_text.strip()[:1000]])
            if not embed_resp.embeddings:
                return ""
            query_embedding = embed_resp.embeddings[0]
            # COA-92: Log embed token usage (non-fatal)
            UsageLogger.log_sync(
                supabase=self._db,
                response=LLMResponse(
                    content="",
                    input_tokens=embed_resp.total_tokens,
                    output_tokens=0,
                    model=embed_resp.model,
                    latency_ms=0,
                ),
                event_type="rag_embed",
                coach_id=coach_id,
                endpoint="webhook/whatsapp",
            )
        except Exception as exc:
            logger.warning("[retrieval] Failed to embed query: %s", exc)
            return ""

        # pgvector cosine similarity search via Supabase RPC
        try:
            result = self._db.rpc("match_coach_documents", {
                "p_coach_id": coach_id,
                "p_embedding": query_embedding,
                "p_top_k": top_k,
                "p_min_similarity": min_similarity,
            }).execute()
            rows = result.data or []
        except Exception as exc:
            # RPC not yet created or failed — fall back to raw SQL approach
            logger.warning("[retrieval] RPC failed, trying direct query: %s", exc)
            rows = self._fallback_search(coach_id, query_embedding, top_k, min_similarity)

        if not rows:
            return ""

        lines = []
        for row in rows:
            filename = str(row.get("filename") or "document")
            category = str(row.get("category") or "").strip()
            content = str(row.get("content") or "").strip()
            similarity = float(row.get("similarity") or 0)
            if not content:
                continue
            label = f"{filename}"
            if category:
                label += f" ({category})"
            lines.append(f"  [{label}, relevance {similarity:.0%}]:\n  {content[:400]}")

        if not lines:
            return ""

        logger.info("[retrieval] Knowledge base: %d chunks for coach=%s", len(lines), coach_id[:8])
        return "## Coach Knowledge Base (relevant excerpts)\n" + "\n\n".join(lines)

    def _fallback_search(
        self,
        coach_id: str,
        query_embedding: list[float],
        top_k: int,
        min_similarity: float,
    ) -> list[dict]:
        """Direct pgvector query when RPC is not available."""
        try:
            embedding_str = "[" + ",".join(str(v) for v in query_embedding) + "]"
            sql = f"""
                SELECT c.content,
                       d.filename,
                       d.category,
                       1 - (c.embedding <=> '{embedding_str}'::vector) AS similarity
                FROM coach_document_chunks c
                JOIN coach_documents d ON d.id = c.document_id
                WHERE d.coach_id = '{coach_id}'
                  AND d.ai_accessible = true
                  AND d.status = 'processed'
                  AND 1 - (c.embedding <=> '{embedding_str}'::vector) >= {min_similarity}
                ORDER BY c.embedding <=> '{embedding_str}'::vector
                LIMIT {top_k};
            """
            result = self._db.rpc("execute_sql", {"query": sql}).execute()
            return result.data or []
        except Exception as exc:
            logger.warning("[retrieval] Fallback search also failed: %s", exc)
            return []


__all__ = ["DocumentRetrievalService"]
