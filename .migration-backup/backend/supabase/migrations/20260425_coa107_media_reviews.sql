-- COA-107: WhatsApp media analysis — media_reviews table
-- Stores athlete photos/videos received via WhatsApp + AI form analysis.
-- Coach reviews AI analysis, edits, adds comment, then sends back to athlete.

CREATE TABLE IF NOT EXISTS public.media_reviews (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id             UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  coach_id               UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  media_url              TEXT NOT NULL,          -- Supabase Storage path: media-reviews/athletes/{athlete_id}/...
  media_type             TEXT NOT NULL           -- 'image' | 'video'
                           CHECK (media_type IN ('image', 'video')),
  whatsapp_media_id      TEXT,                   -- original Meta media_id (expires — do not use after download)
  ai_analysis            TEXT,                   -- raw AI output (pre-InteractionAgent voice wrap)
  coach_edited_analysis  TEXT,                   -- what coach approved/edited
  coach_comment          TEXT,                   -- coach's personal addition
  status                 TEXT NOT NULL DEFAULT 'pending_analysis'
                           CHECK (status IN (
                             'pending_analysis',   -- just received, AI not yet run
                             'pending_coach_review', -- AI done, awaiting coach
                             'sent',               -- coach sent the reply
                             'dismissed'           -- coach dismissed without sending
                           )),
  sent_at                TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Coach media queue (sort by newest first)
CREATE INDEX IF NOT EXISTS media_reviews_coach_status
  ON public.media_reviews (coach_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS media_reviews_athlete_created
  ON public.media_reviews (athlete_id, created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_media_reviews_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS media_reviews_updated_at ON public.media_reviews;
CREATE TRIGGER media_reviews_updated_at
  BEFORE UPDATE ON public.media_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_media_reviews_updated_at();

-- RLS
ALTER TABLE public.media_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_media_reviews"
  ON public.media_reviews FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "coach_all_media_reviews"
  ON public.media_reviews FOR ALL
  TO authenticated
  USING  (coach_id = (auth.jwt() ->> 'coach_id')::uuid)
  WITH CHECK (coach_id = (auth.jwt() ->> 'coach_id')::uuid);

COMMENT ON TABLE public.media_reviews IS
  'COA-107: Athlete photos/videos received via WhatsApp. '
  'AI analyzes form/technique; coach reviews, edits, and sends reply. '
  'Media stored in Supabase Storage bucket: media-reviews.';
