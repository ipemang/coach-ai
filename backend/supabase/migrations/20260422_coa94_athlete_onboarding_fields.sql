-- COA-94: Athlete onboarding fields
-- Adds structured onboarding columns to athletes table so the onboarding flow
-- can collect athlete data step-by-step and the AI can generate an initial profile.

ALTER TABLE public.athletes
  -- Identity
  ADD COLUMN IF NOT EXISTS date_of_birth           date,
  ADD COLUMN IF NOT EXISTS gender                  text,        -- 'male' | 'female' | 'non_binary' | 'prefer_not_to_say'
  ADD COLUMN IF NOT EXISTS fitness_level           text,        -- 'beginner' | 'intermediate' | 'advanced' | 'elite'

  -- Sport profile
  ADD COLUMN IF NOT EXISTS primary_sport           text,        -- 'triathlon' | 'running' | 'cycling' | 'swimming'
  ADD COLUMN IF NOT EXISTS secondary_sports        text[],      -- e.g. ['cycling', 'swimming']
  ADD COLUMN IF NOT EXISTS years_training          integer,
  ADD COLUMN IF NOT EXISTS current_weekly_hours    numeric(4,1),

  -- Race goals
  ADD COLUMN IF NOT EXISTS target_event_name       text,
  ADD COLUMN IF NOT EXISTS target_event_date       date,
  ADD COLUMN IF NOT EXISTS target_event_distance   text,        -- '5k' | '10k' | 'half_marathon' | 'marathon' | 'sprint' | 'olympic' | '70.3' | 'ironman'
  ADD COLUMN IF NOT EXISTS goal_description        text,        -- free text: "I want to finish my first half ironman"
  ADD COLUMN IF NOT EXISTS success_definition      text,        -- free text: "finish under 6 hours"

  -- Health history
  ADD COLUMN IF NOT EXISTS injury_history          text,
  ADD COLUMN IF NOT EXISTS medical_notes           text,
  ADD COLUMN IF NOT EXISTS previous_bests          text,        -- free text: best times / PRs
  ADD COLUMN IF NOT EXISTS current_limiters        text,        -- free text: "poor swim technique, low weekly volume"

  -- Onboarding state
  ADD COLUMN IF NOT EXISTS onboarding_step         integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_complete     boolean      NOT NULL DEFAULT false,

  -- AI-generated profile (populated after onboarding_complete)
  ADD COLUMN IF NOT EXISTS ai_profile_summary      text;        -- 3-4 sentence AI-generated profile

-- No backfill needed — all new columns have defaults or are nullable
