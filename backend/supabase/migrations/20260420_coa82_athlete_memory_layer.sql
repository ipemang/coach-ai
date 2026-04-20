-- COA-82: Athlete memory layer
--
-- Creates append-only event log (athlete_memory_events) for every training
-- interaction and adds a rolling memory_summary column to athletes so the AI
-- pipeline has contextual memory across conversations.

-- 1. Event log table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.athlete_memory_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id  uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  event_type  text NOT NULL,   -- 'message' | 'workout' | 'checkin' | 'flag'
  content     text NOT NULL,   -- raw event text
  metadata    jsonb            -- structured fields (pain_location, workout_type, etc.)
);

CREATE INDEX IF NOT EXISTS athlete_memory_events_athlete_id_created_at_idx
  ON public.athlete_memory_events(athlete_id, created_at DESC);

-- 2. Rolling summary column on athletes ──────────────────────────────────────
ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS memory_summary text;

-- 3. RLS: athletes can read their own events; coaches can read their athletes' events
ALTER TABLE public.athlete_memory_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Athletes can view own memory events"
  ON public.athlete_memory_events FOR SELECT
  USING (athlete_id = auth.uid()::uuid);

CREATE POLICY "Service role has full access to memory events"
  ON public.athlete_memory_events
  USING (auth.role() = 'service_role');
