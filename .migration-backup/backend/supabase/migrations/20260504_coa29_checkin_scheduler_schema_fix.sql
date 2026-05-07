-- COA-29: Fix checkin_send_logs schema mismatch + add athlete checkin scheduling columns.
--
-- Issues found:
-- 1. checkin_send_logs.dedup_key (DB) vs dedupe_key (code) — rename to match code
-- 2. checkin_send_logs missing 5 columns the code writes (timezone_name, channel,
--    message_fingerprint, provider_message_id, updated_at)
-- 3. athletes missing 3 columns the scheduler reads (checkins_enabled, scheduled_time,
--    trigger_window_minutes) — the scheduler filters by checkins_enabled=true, so with
--    the column missing, every run returns 0 athletes and no check-in is ever sent.

-- ── checkin_send_logs fixes ───────────────────────────────────────────────────

ALTER TABLE public.checkin_send_logs
  RENAME COLUMN dedup_key TO dedupe_key;

ALTER TABLE public.checkin_send_logs
  ADD COLUMN IF NOT EXISTS timezone_name      text,
  ADD COLUMN IF NOT EXISTS channel            text NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS message_fingerprint text,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS updated_at         timestamptz NOT NULL DEFAULT now();

-- Unique constraint on dedupe_key so upserts are idempotent
CREATE UNIQUE INDEX IF NOT EXISTS checkin_send_logs_dedupe_key_idx
  ON public.checkin_send_logs (dedupe_key);

-- ── athletes: add scheduler columns ──────────────────────────────────────────

ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS checkins_enabled       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scheduled_time         time    NOT NULL DEFAULT '08:00:00',
  ADD COLUMN IF NOT EXISTS trigger_window_minutes integer NOT NULL DEFAULT 30;

-- Index so the scheduler's .eq("checkins_enabled", True) query is fast
CREATE INDEX IF NOT EXISTS athletes_checkins_enabled_idx
  ON public.athletes (checkins_enabled)
  WHERE checkins_enabled = true;

-- Enable check-ins for Patrick Burland (the active test athlete with a real phone number).
-- scheduled_time 08:00 ET = 13:00 UTC. trigger_window = 30 min (matches cron cadence).
UPDATE public.athletes
  SET checkins_enabled = true,
      scheduled_time   = '08:00:00',
      trigger_window_minutes = 30
  WHERE full_name = 'Patrick Burland'
    AND phone_number IS NOT NULL
    AND archived_at IS NULL;
