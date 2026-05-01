-- COA-118: Training reports — AI-drafted, coach-published athlete performance reports

CREATE TABLE IF NOT EXISTS public.training_reports (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id    uuid        NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  coach_id      uuid        NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  period_type   text        NOT NULL DEFAULT 'weekly',   -- weekly | monthly | block
  period_start  date        NOT NULL,
  period_end    date        NOT NULL,
  title         text        NOT NULL DEFAULT '',
  summary_text  text,       -- 1-2 sentence summary shown in list view
  full_text     text,       -- full coach narrative (fromCoach block)
  highlights    jsonb       NOT NULL DEFAULT '[]'::jsonb,  -- array of strings
  watchouts     jsonb       NOT NULL DEFAULT '[]'::jsonb,  -- array of strings
  status        text        NOT NULL DEFAULT 'draft',    -- draft | published
  published_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS training_reports_athlete_id_idx
  ON public.training_reports(athlete_id);

CREATE INDEX IF NOT EXISTS training_reports_coach_id_idx
  ON public.training_reports(coach_id);

CREATE INDEX IF NOT EXISTS training_reports_status_idx
  ON public.training_reports(status);

ALTER TABLE public.training_reports ENABLE ROW LEVEL SECURITY;

-- Service role has full access (backend uses service role key)
CREATE POLICY "service_role_full_access_training_reports"
  ON public.training_reports
  USING (auth.role() = 'service_role');

-- Athletes can read their own published reports
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'training_reports' AND policyname = 'athlete_read_own_published_reports'
  ) THEN
    CREATE POLICY "athlete_read_own_published_reports"
      ON public.training_reports
      FOR SELECT
      USING (
        status = 'published'
        AND athlete_id IN (
          SELECT id FROM public.athletes WHERE auth_user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Coaches can read all reports for their athletes
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'training_reports' AND policyname = 'coach_read_own_athlete_reports'
  ) THEN
    CREATE POLICY "coach_read_own_athlete_reports"
      ON public.training_reports
      FOR SELECT
      USING (
        coach_id IN (
          SELECT id FROM public.coaches WHERE auth_user_id = auth.uid()
        )
      );
  END IF;
END $$;
