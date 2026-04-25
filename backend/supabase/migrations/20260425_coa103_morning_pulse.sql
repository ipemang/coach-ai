-- COA-103: Athlete morning pulse — daily structured WhatsApp check-in
-- Adds morning pulse config columns to athletes and a sessions table.

-- ── Athletes: pulse config ──────────────────────────────────────────────────

ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS morning_pulse_questions jsonb
    DEFAULT '[
      "How are your legs feeling today? (1 = very sore, 10 = fresh)",
      "How did you sleep last night? (1 = very poor, 10 = excellent)",
      "Any pain, niggles, or anything your coach should know about?"
    ]'::jsonb;

ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS morning_pulse_time text DEFAULT '07:30';

-- ── Morning pulse sessions ───────────────────────────────────────────────────
-- One row per completed (or abandoned) 3-question check-in.

CREATE TABLE IF NOT EXISTS public.morning_pulse_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id    uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  coach_id      uuid NOT NULL,
  session_date  date NOT NULL DEFAULT CURRENT_DATE,
  questions     jsonb NOT NULL DEFAULT '[]'::jsonb,
  answers       jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary_text  text,
  completed     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Unique: one session per athlete per day
CREATE UNIQUE INDEX IF NOT EXISTS morning_pulse_sessions_athlete_date_idx
  ON public.morning_pulse_sessions (athlete_id, session_date);

-- Query index
CREATE INDEX IF NOT EXISTS morning_pulse_sessions_coach_date_idx
  ON public.morning_pulse_sessions (coach_id, session_date DESC);

-- RLS: coaches can read sessions for their athletes
ALTER TABLE public.morning_pulse_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches can read pulse sessions for their athletes" ON public.morning_pulse_sessions;
CREATE POLICY "Coaches can read pulse sessions for their athletes"
  ON public.morning_pulse_sessions FOR SELECT
  USING (
    coach_id::text = (auth.jwt() -> 'app_metadata' ->> 'coach_id')
  );
