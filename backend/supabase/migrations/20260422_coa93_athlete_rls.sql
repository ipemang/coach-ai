-- COA-93: RLS policies for athlete-scoped data access
-- Athletes (authenticated via Supabase JWT with role="athlete") can only see their own data.

-- Helper: resolve authenticated athlete's id from their auth uid
-- Used in policies below so we don't repeat the subquery

-- ── athletes table ───────────────────────────────────────────────────────────

-- Athletes can read their own row
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'athletes' AND policyname = 'athlete_read_own'
  ) THEN
    CREATE POLICY "athlete_read_own" ON public.athletes
      FOR SELECT
      USING (auth.uid() = auth_user_id);
  END IF;
END $$;

-- ── workouts table ───────────────────────────────────────────────────────────

-- Athletes can read their own workouts
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'workouts' AND policyname = 'athlete_read_own_workouts'
  ) THEN
    CREATE POLICY "athlete_read_own_workouts" ON public.workouts
      FOR SELECT
      USING (
        athlete_id IN (
          SELECT id FROM public.athletes WHERE auth_user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Athletes can update their own workout completions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'workouts' AND policyname = 'athlete_update_own_workouts'
  ) THEN
    CREATE POLICY "athlete_update_own_workouts" ON public.workouts
      FOR UPDATE
      USING (
        athlete_id IN (
          SELECT id FROM public.athletes WHERE auth_user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ── messages table ───────────────────────────────────────────────────────────
-- NOTE: No 'messages' table exists — athlete chat goes via WhatsApp (not Supabase).
-- Policy will be added if a messages table is created in the future.

-- ── athlete_checkins table ───────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'athlete_checkins' AND policyname = 'athlete_insert_own_checkin'
  ) THEN
    CREATE POLICY "athlete_insert_own_checkin" ON public.athlete_checkins
      FOR INSERT
      WITH CHECK (
        athlete_id IN (
          SELECT id FROM public.athletes WHERE auth_user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'athlete_checkins' AND policyname = 'athlete_read_own_checkins'
  ) THEN
    CREATE POLICY "athlete_read_own_checkins" ON public.athlete_checkins
      FOR SELECT
      USING (
        athlete_id IN (
          SELECT id FROM public.athletes WHERE auth_user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ── athlete_memory_events table ──────────────────────────────────────────────
-- (policy already exists from COA-82, but scoped to auth.uid() = athlete_id
--  which was wrong — fix it to use the auth_user_id join)

-- Drop old policy if it exists and replace with correct one
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'athlete_memory_events'
      AND policyname = 'Athletes can view own memory events'
  ) THEN
    DROP POLICY "Athletes can view own memory events" ON public.athlete_memory_events;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'athlete_memory_events'
      AND policyname = 'athlete_read_own_memory_events'
  ) THEN
    CREATE POLICY "athlete_read_own_memory_events" ON public.athlete_memory_events
      FOR SELECT
      USING (
        athlete_id IN (
          SELECT id FROM public.athletes WHERE auth_user_id = auth.uid()
        )
      );
  END IF;
END $$;
