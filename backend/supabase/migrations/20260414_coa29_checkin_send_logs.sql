-- COA-29: Create checkin_send_logs table for deduplicating proactive check-in sends

CREATE TABLE IF NOT EXISTS checkin_send_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID REFERENCES athletes(id) ON DELETE CASCADE,
  dedup_key TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS checkin_send_logs_athlete_id_idx
  ON checkin_send_logs(athlete_id);

CREATE INDEX IF NOT EXISTS checkin_send_logs_dedup_key_idx
  ON checkin_send_logs(dedup_key);
