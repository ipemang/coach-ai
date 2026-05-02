CREATE TABLE IF NOT EXISTS public.onboarding_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  step TEXT NOT NULL DEFAULT 'ask_name',
  collected JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT onboarding_sessions_phone_unique UNIQUE (phone_number)
);
CREATE INDEX IF NOT EXISTS onboarding_sessions_phone_idx ON public.onboarding_sessions(phone_number);
