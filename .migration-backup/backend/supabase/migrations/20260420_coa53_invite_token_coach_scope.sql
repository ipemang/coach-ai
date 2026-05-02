-- COA-53: Coach referral link — athlete onboarding via scoped invite URL
--
-- athlete_connect_tokens was created with athlete_id NOT NULL, which works for
-- plan_access and strava_connect tokens (athlete already exists) but breaks
-- purpose='onboard' tokens where no athlete exists yet.
--
-- Also adds coach_id / organization_id / coach_whatsapp_number so the backend
-- can correctly scope the new athlete to the right coach on finalization.

ALTER TABLE public.athlete_connect_tokens
  ALTER COLUMN athlete_id DROP NOT NULL;

ALTER TABLE public.athlete_connect_tokens
  ADD COLUMN IF NOT EXISTS coach_id           UUID REFERENCES public.coaches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS organization_id    TEXT,
  ADD COLUMN IF NOT EXISTS coach_whatsapp_number TEXT;

CREATE INDEX IF NOT EXISTS athlete_connect_tokens_coach_id_idx
  ON public.athlete_connect_tokens(coach_id);
