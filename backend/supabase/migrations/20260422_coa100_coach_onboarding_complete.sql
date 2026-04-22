-- COA-100: Coach onboarding_complete flag
-- Tracks whether a coach has completed onboarding (Step 3: athletes).
-- Used by /auth/callback to route coaches to onboarding vs. dashboard.

ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS onboarding_complete boolean NOT NULL DEFAULT false;

-- Backfill: any coach who already has athletes is considered onboarded
-- (they must have completed Step 3 at some point)
UPDATE public.coaches c
SET onboarding_complete = true
WHERE EXISTS (
  SELECT 1 FROM public.athletes a
  WHERE a.coach_id = c.id
  LIMIT 1
);
