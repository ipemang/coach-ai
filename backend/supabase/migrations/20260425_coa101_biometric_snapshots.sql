-- COA-101: Biometric snapshots table
-- Stores one row per athlete per day capturing the Oura biometric values
-- at the time of the daily sync. Used to compute 30-day rolling baselines
-- for relative trend indicators on the coach dashboard.

CREATE TABLE IF NOT EXISTS public.biometric_snapshots (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id    uuid        NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  snapshot_date date        NOT NULL,
  readiness     int,            -- oura_readiness_score (0-100)
  hrv           numeric(5,1),   -- oura_avg_hrv (ms)
  sleep         int,            -- oura_sleep_score (0-100)
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(athlete_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS biometric_snapshots_athlete_date_idx
  ON public.biometric_snapshots(athlete_id, snapshot_date DESC);

-- RLS: coaches can read snapshots for their athletes
ALTER TABLE public.biometric_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach_read_athlete_snapshots" ON public.biometric_snapshots
  FOR SELECT USING (
    athlete_id IN (
      SELECT id FROM public.athletes
      WHERE coach_id IN (
        SELECT id FROM public.coaches WHERE auth_user_id = auth.uid()
      )
    )
  );
