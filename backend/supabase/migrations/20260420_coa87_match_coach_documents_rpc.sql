-- COA-87: RPC for pgvector cosine similarity search over coach knowledge base
CREATE OR REPLACE FUNCTION public.match_coach_documents(
  p_coach_id      uuid,
  p_embedding     vector(1536),
  p_top_k         integer DEFAULT 3,
  p_min_similarity float   DEFAULT 0.72
)
RETURNS TABLE (
  content    text,
  filename   text,
  category   text,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.content,
    d.filename,
    d.category,
    1 - (c.embedding <=> p_embedding) AS similarity
  FROM public.coach_document_chunks c
  JOIN public.coach_documents d ON d.id = c.document_id
  WHERE d.coach_id    = p_coach_id
    AND d.ai_accessible = true
    AND d.status        = 'processed'
    AND 1 - (c.embedding <=> p_embedding) >= p_min_similarity
  ORDER BY c.embedding <=> p_embedding
  LIMIT p_top_k;
$$;
