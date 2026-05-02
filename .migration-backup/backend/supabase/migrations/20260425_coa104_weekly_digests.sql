-- COA-104: Weekly coach digest table
-- AI-generated per-athlete Friday summaries stored for coach review before WhatsApp send.

CREATE TABLE IF NOT EXISTS public.weekly_digests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id      UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  athlete_id    UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  week_ending   DATE NOT NULL,                         -- the Sunday that ends the reviewed week
  summary_text  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','sent','dismissed')),
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One digest per athlete per week
CREATE UNIQUE INDEX IF NOT EXISTS weekly_digests_athlete_week
  ON public.weekly_digests (athlete_id, week_ending);

-- Coach lookup (list all pending digests for a coach sorted newest first)
CREATE INDEX IF NOT EXISTS weekly_digests_coach_status
  ON public.weekly_digests (coach_id, status, week_ending DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_weekly_digests_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS weekly_digests_updated_at ON public.weekly_digests;
CREATE TRIGGER weekly_digests_updated_at
  BEFORE UPDATE ON public.weekly_digests
  FOR EACH ROW EXECUTE FUNCTION public.set_weekly_digests_updated_at();

-- RLS
ALTER TABLE public.weekly_digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_weekly_digests"
  ON public.weekly_digests FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "coach_all_weekly_digests"
  ON public.weekly_digests FOR ALL
  TO authenticated
  USING  (coach_id = (auth.jwt() ->> 'coach_id')::uuid)
  WITH CHECK (coach_id = (auth.jwt() ->> 'coach_id')::uuid);

COMMENT ON TABLE public.weekly_digests IS
  'COA-104: Per-athlete weekly AI summaries generated every Friday. '
  'Coach reviews, optionally edits, then sends via WhatsApp. '
  'status: draft → sent | dismissed. Unique per (athlete_id, week_ending).';
