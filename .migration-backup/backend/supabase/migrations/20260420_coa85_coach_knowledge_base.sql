-- COA-85: Coach Knowledge Base — documents, chunks (pgvector), athlete notes

-- 1. Coach documents metadata
CREATE TABLE IF NOT EXISTS public.coach_documents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id          uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  filename          text NOT NULL,
  original_filename text NOT NULL,
  file_url          text NOT NULL,
  file_type         text NOT NULL,
  category          text,
  ai_accessible     boolean NOT NULL DEFAULT false,
  status            text NOT NULL DEFAULT 'pending',
  size_bytes        integer,
  chunk_count       integer,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coach_documents_coach_id_idx ON public.coach_documents(coach_id);

-- 2. Embedding chunks for semantic search
CREATE TABLE IF NOT EXISTS public.coach_document_chunks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  uuid NOT NULL REFERENCES public.coach_documents(id) ON DELETE CASCADE,
  coach_id     uuid NOT NULL,
  chunk_index  integer NOT NULL,
  content      text NOT NULL,
  embedding    vector(1536),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coach_document_chunks_coach_id_idx ON public.coach_document_chunks(coach_id);
CREATE INDEX IF NOT EXISTS coach_document_chunks_hnsw_idx
  ON public.coach_document_chunks USING hnsw (embedding vector_cosine_ops);

-- 3. Coach notes per athlete (always injected into AI context, no search needed)
CREATE TABLE IF NOT EXISTS public.coach_athlete_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  athlete_id  uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  note_text   text NOT NULL,
  note_type   text NOT NULL DEFAULT 'general',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coach_athlete_notes_coach_athlete_idx
  ON public.coach_athlete_notes(coach_id, athlete_id);

-- 4. RLS
ALTER TABLE public.coach_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_athlete_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to coach_documents"
  ON public.coach_documents USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access to coach_document_chunks"
  ON public.coach_document_chunks USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access to coach_athlete_notes"
  ON public.coach_athlete_notes USING (auth.role() = 'service_role');

-- 5. Storage bucket for coach files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'coach-documents',
  'coach-documents',
  false,
  52428800,
  ARRAY['application/pdf', 'text/plain', 'text/markdown', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;
