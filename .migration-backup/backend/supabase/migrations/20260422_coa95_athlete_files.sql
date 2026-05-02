-- COA-95: Athlete file uploads
-- Athletes can upload their own files (training logs, medical docs, race history, etc.)
-- Files are stored in Supabase Storage and metadata tracked in athlete_files table.
-- Text files are ingested into pgvector for AI coaching context.

-- 1. Athlete files metadata table
CREATE TABLE IF NOT EXISTS public.athlete_files (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id        uuid        NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  coach_id          uuid        NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  filename          text        NOT NULL,
  original_filename text        NOT NULL,
  file_url          text        NOT NULL,
  file_type         text        NOT NULL,          -- 'pdf' | 'txt' | 'md' | 'csv' | etc.
  size_bytes        integer,
  description       text,                          -- optional coach/athlete note about the file
  category          text,                          -- 'training_log' | 'medical' | 'race_history' | 'general'
  ai_accessible     boolean     NOT NULL DEFAULT true,   -- default: ingested for AI context
  status            text        NOT NULL DEFAULT 'pending',  -- pending | processed | failed
  chunk_count       integer,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS athlete_files_athlete_id_idx ON public.athlete_files(athlete_id);
CREATE INDEX IF NOT EXISTS athlete_files_coach_id_idx   ON public.athlete_files(coach_id);

-- 2. Embedding chunks for athlete file semantic search
CREATE TABLE IF NOT EXISTS public.athlete_file_chunks (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id      uuid        NOT NULL REFERENCES public.athlete_files(id) ON DELETE CASCADE,
  athlete_id   uuid        NOT NULL,
  coach_id     uuid        NOT NULL,
  chunk_index  integer     NOT NULL,
  content      text        NOT NULL,
  embedding    vector(1536),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS athlete_file_chunks_athlete_id_idx
  ON public.athlete_file_chunks(athlete_id);
CREATE INDEX IF NOT EXISTS athlete_file_chunks_coach_id_idx
  ON public.athlete_file_chunks(coach_id);
CREATE INDEX IF NOT EXISTS athlete_file_chunks_hnsw_idx
  ON public.athlete_file_chunks USING hnsw (embedding vector_cosine_ops);

-- 3. RLS — service role has full access; athletes can manage their own files
ALTER TABLE public.athlete_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athlete_file_chunks ENABLE ROW LEVEL SECURITY;

-- Service role full access (backend uses service role key)
CREATE POLICY "service_role_full_access_athlete_files"
  ON public.athlete_files
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_full_access_athlete_file_chunks"
  ON public.athlete_file_chunks
  USING (auth.role() = 'service_role');

-- Athletes can read/delete their own file metadata
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'athlete_files' AND policyname = 'athlete_read_own_files'
  ) THEN
    CREATE POLICY "athlete_read_own_files" ON public.athlete_files
      FOR SELECT
      USING (
        athlete_id IN (
          SELECT id FROM public.athletes WHERE auth_user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'athlete_files' AND policyname = 'athlete_delete_own_files'
  ) THEN
    CREATE POLICY "athlete_delete_own_files" ON public.athlete_files
      FOR DELETE
      USING (
        athlete_id IN (
          SELECT id FROM public.athletes WHERE auth_user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- 4. Storage bucket for athlete files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'athlete-files',
  'athlete-files',
  false,
  52428800,  -- 50 MB
  ARRAY[
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: athletes can upload/download their own files; coach can read their athletes' files
-- Path convention: {athlete_id}/{uuid}/{filename}

-- Athletes upload to their own prefix
INSERT INTO storage.policies (name, bucket_id, definition)
VALUES (
  'athlete_upload_own_files',
  'athlete-files',
  $$
  (bucket_id = 'athlete-files'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.athletes WHERE auth_user_id = auth.uid()
    )
  )
  $$
)
ON CONFLICT (name, bucket_id) DO NOTHING;

-- Athletes download their own files
INSERT INTO storage.policies (name, bucket_id, definition)
VALUES (
  'athlete_download_own_files',
  'athlete-files',
  $$
  (bucket_id = 'athlete-files'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.athletes WHERE auth_user_id = auth.uid()
    )
  )
  $$
)
ON CONFLICT (name, bucket_id) DO NOTHING;
