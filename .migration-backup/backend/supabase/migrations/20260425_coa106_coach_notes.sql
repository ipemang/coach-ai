-- COA-106: Coach session notes
-- AI-drafted post-workout annotations. Coach reviews, optionally edits, then sends
-- to athlete via WhatsApp. Stored with source='coach_note' for /my-plan "From your coach" view.

CREATE TABLE IF NOT EXISTS public.coach_notes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id      UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  athlete_id    UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  note_text     TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('manual', 'ai_draft', 'ai_sent')),
  sent_via_whatsapp BOOLEAN NOT NULL DEFAULT false,
  sent_at       TIMESTAMPTZ,
  workout_id    UUID REFERENCES public.workouts(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Coach lookup: list notes for an athlete (newest first)
CREATE INDEX IF NOT EXISTS coach_notes_athlete_created
  ON public.coach_notes (athlete_id, created_at DESC);

CREATE INDEX IF NOT EXISTS coach_notes_coach_created
  ON public.coach_notes (coach_id, created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_coach_notes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS coach_notes_updated_at ON public.coach_notes;
CREATE TRIGGER coach_notes_updated_at
  BEFORE UPDATE ON public.coach_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_coach_notes_updated_at();

-- RLS
ALTER TABLE public.coach_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_coach_notes"
  ON public.coach_notes FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "coach_all_coach_notes"
  ON public.coach_notes FOR ALL
  TO authenticated
  USING  (coach_id = (auth.jwt() ->> 'coach_id')::uuid)
  WITH CHECK (coach_id = (auth.jwt() ->> 'coach_id')::uuid);

COMMENT ON TABLE public.coach_notes IS
  'COA-106: Per-athlete coach session notes. AI drafts the note; coach '
  'reviews and optionally sends via WhatsApp. source: manual | ai_draft | ai_sent. '
  'Displayed in /my-plan "From your coach" section (last 5 notes).';
