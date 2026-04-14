-- COA-40: Web onboarding flow
-- Adds web_step column to onboarding_sessions so web flow can track progress
-- independently from the WhatsApp step field.

ALTER TABLE public.onboarding_sessions
  ADD COLUMN IF NOT EXISTS web_step TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'whatsapp';

-- Allow phone_number to be nullable for web-only onboarding sessions
-- (web sessions use "web:{token}" as the phone_number key, which is fine as-is)

-- Ensure athlete_connect_tokens supports onboarding purpose (already has purpose column from COA-35)
-- No schema change needed — purpose='onboard_web' will be used for new web links.

COMMENT ON COLUMN public.onboarding_sessions.web_step IS 'Current step in web onboarding flow (COA-40)';
COMMENT ON COLUMN public.onboarding_sessions.source IS 'whatsapp or web';
