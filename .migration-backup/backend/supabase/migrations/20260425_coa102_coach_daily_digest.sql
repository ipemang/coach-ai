-- COA-102: Daily AI-generated coach briefing
-- Adds daily_digest JSONB column to coaches table.
-- Schema: { generated_at: ISO string, summary: string, athlete_flags: [{athlete_id, name, reason}] }
-- Regenerated lazily on first dashboard load after 6 AM if stale (>6 hours old).

ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS daily_digest jsonb;
