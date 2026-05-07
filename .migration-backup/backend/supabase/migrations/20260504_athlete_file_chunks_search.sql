-- COA-memory: Semantic search over athlete-uploaded file chunks.
-- Called at inference time alongside the coach KB search.
-- Note: athlete_file_chunks uses 'content' column (not chunk_text).
CREATE OR REPLACE FUNCTION match_athlete_file_chunks(
  query_embedding vector(1536),
  match_threshold  float DEFAULT 0.72,
  match_count      int   DEFAULT 3,
  p_athlete_id     uuid  DEFAULT NULL
)
RETURNS TABLE (
  id            uuid,
  athlete_id    uuid,
  file_id       uuid,
  chunk_text    text,
  similarity    float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.id,
    c.athlete_id,
    c.file_id,
    c.content         AS chunk_text,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM athlete_file_chunks c
  WHERE
    (p_athlete_id IS NULL OR c.athlete_id = p_athlete_id)
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;
