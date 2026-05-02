-- COA-123: Add office_hours_enabled toggle to coaches table
-- When FALSE (default), the office hours schedule is ignored and the coach is
-- always treated as online. Coaches must explicitly opt in by enabling the toggle.
-- Applied to production via Supabase MCP on 2026-05-02.

ALTER TABLE coaches
  ADD COLUMN IF NOT EXISTS office_hours_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN coaches.office_hours_enabled IS
  'COA-123: master schedule toggle. When false, office_hours config is ignored and coach is always online.';
