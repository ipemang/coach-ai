-- COA-26: Oura Ring daily sync service migration
-- Adds refresh_token column to oura_tokens (needed for OAuth2 flow later)
-- Also adds token_type to distinguish PAT vs OAuth2 tokens

ALTER TABLE oura_tokens
  ADD COLUMN IF NOT EXISTS refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS token_type TEXT NOT NULL DEFAULT 'pat'
    CHECK (token_type IN ('pat', 'oauth2'));

-- Index for fast athlete lookups during sync
CREATE INDEX IF NOT EXISTS oura_tokens_athlete_id_idx ON oura_tokens (athlete_id);

COMMENT ON COLUMN oura_tokens.token_type IS
  'pat = Personal Access Token (entered manually by coach); oauth2 = obtained via Oura OAuth2 flow (future)';
COMMENT ON COLUMN oura_tokens.refresh_token IS
  'OAuth2 refresh token. NULL for PAT tokens.';
