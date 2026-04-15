-- COA-42: Workouts table — stores prescribed, completed, and skipped workouts.
CREATE TABLE IF NOT EXISTS public.workouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
    coach_id UUID REFERENCES public.coaches(id) ON DELETE SET NULL,
    scheduled_date DATE NOT NULL,
    session_type TEXT NOT NULL DEFAULT 'run',
    title TEXT,
    distance_km NUMERIC(6,2),
    duration_min INTEGER,
    hr_zone TEXT,
    target_pace TEXT,
    coaching_notes TEXT,
    status TEXT NOT NULL DEFAULT 'prescribed',
    sent_via_whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
    athlete_feedback TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT workouts_status_check CHECK (status IN ('prescribed', 'sent', 'completed', 'skipped', 'missed'))
);

CREATE INDEX IF NOT EXISTS workouts_athlete_date_idx ON public.workouts(athlete_id, scheduled_date DESC);
CREATE INDEX IF NOT EXISTS workouts_status_idx ON public.workouts(status);
