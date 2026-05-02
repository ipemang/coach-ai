-- COA-93: Athlete Auth Infrastructure
-- Adds Supabase Auth account support to athletes + invite token system
-- Apply in Supabase Dashboard → SQL Editor

-- 1. Extend athletes table with auth fields
ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS email        text;

CREATE UNIQUE INDEX IF NOT EXISTS athletes_auth_user_id_idx
  ON public.athletes(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- email is unique per coach (same email can be an athlete for two different coaches)
CREATE UNIQUE INDEX IF NOT EXISTS athletes_email_coach_idx
  ON public.athletes(email, coach_id) WHERE email IS NOT NULL;

-- 2. Athlete invite tokens — personalized, expiring, single-use
CREATE TABLE IF NOT EXISTS public.athlete_invite_tokens (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token       text        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  coach_id    uuid        NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  athlete_id  uuid        NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '7 days',
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS athlete_invite_tokens_token_idx
  ON public.athlete_invite_tokens(token);
CREATE INDEX IF NOT EXISTS athlete_invite_tokens_athlete_id_idx
  ON public.athlete_invite_tokens(athlete_id);

ALTER TABLE public.athlete_invite_tokens ENABLE ROW LEVEL SECURITY;

-- Service role has full access (backend uses service role key)
CREATE POLICY "service_role_full_access_invite_tokens"
  ON public.athlete_invite_tokens
  USING (auth.role() = 'service_role');
