CREATE TABLE IF NOT EXISTS public.athlete_connect_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'strava_connect',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT athlete_connect_tokens_token_unique UNIQUE (token)
);
CREATE INDEX IF NOT EXISTS athlete_connect_tokens_token_idx ON public.athlete_connect_tokens(token);
