-- COA-109: Expanded athlete profile fields for comprehensive onboarding redesign.
-- Migration applied directly via Supabase MCP on 2026-04-27.

ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS athlete_type text
    CHECK (athlete_type IN ('new_fresh', 'new_existing_relationship', 'returning')),
  ADD COLUMN IF NOT EXISTS coach_relationship_duration text,
  ADD COLUMN IF NOT EXISTS occupation text,
  ADD COLUMN IF NOT EXISTS training_availability jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS equipment_access text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS communication_preference text,
  ADD COLUMN IF NOT EXISTS coaching_expectations text,
  ADD COLUMN IF NOT EXISTS previous_coaches text,
  ADD COLUMN IF NOT EXISTS competitive_history text,
  ADD COLUMN IF NOT EXISTS resting_hr integer,
  ADD COLUMN IF NOT EXISTS sleep_hours numeric(3,1),
  ADD COLUMN IF NOT EXISTS medications text,
  ADD COLUMN IF NOT EXISTS how_found_coach text,
  ADD COLUMN IF NOT EXISTS typical_week_description text,
  ADD COLUMN IF NOT EXISTS race_motivation text,
  ADD COLUMN IF NOT EXISTS secondary_events jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS profile_refreshed_at timestamptz;
