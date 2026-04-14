-- COA-24/COA-26: oura_tokens table + schema comments
-- Applied directly via Supabase MCP on 2026-04-14
-- This file is for version tracking only.

CREATE TABLE IF NOT EXISTS public.oura_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS oura_tokens_athlete_id_idx ON public.oura_tokens(athlete_id);
