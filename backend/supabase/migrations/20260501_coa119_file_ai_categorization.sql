-- COA-119: File upload pipeline — AI auto-categorization columns + RLS on athlete_file_chunks

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add ai_summary and ai_categorized to athlete_files
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.athlete_files
  ADD COLUMN IF NOT EXISTS ai_summary     text,
  ADD COLUMN IF NOT EXISTS ai_categorized boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.athlete_files.ai_summary     IS 'AI-extracted key facts paragraph from the document content';
COMMENT ON COLUMN public.athlete_files.ai_categorized IS 'true once AI has classified and summarized this file';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS policies on athlete_file_chunks (service_role_full_access already exists
--    from COA-95; add athlete and coach policies for defense-in-depth)
-- ─────────────────────────────────────────────────────────────────────────────

-- Athlete: SELECT own chunks only (via JOIN to athlete_files to get athlete_id)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'athlete_file_chunks' AND policyname = 'athlete_read_own_file_chunks'
  ) THEN
    CREATE POLICY "athlete_read_own_file_chunks"
      ON public.athlete_file_chunks
      FOR SELECT
      USING (
        athlete_id IN (
          SELECT id FROM public.athletes WHERE auth_user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Coach: SELECT chunks for their own athletes only
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'athlete_file_chunks' AND policyname = 'coach_read_athlete_file_chunks'
  ) THEN
    CREATE POLICY "coach_read_athlete_file_chunks"
      ON public.athlete_file_chunks
      FOR SELECT
      USING (
        coach_id IN (
          SELECT id FROM public.coaches WHERE auth_user_id = auth.uid()
        )
      );
  END IF;
END $$;
