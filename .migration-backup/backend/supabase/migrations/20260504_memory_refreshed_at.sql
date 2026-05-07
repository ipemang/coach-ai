-- Track when memory_summary was last consolidated so we can throttle auto-refresh.
ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS memory_refreshed_at timestamptz;
