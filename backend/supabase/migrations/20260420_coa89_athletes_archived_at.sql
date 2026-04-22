-- COA-89: Soft-delete support for athletes — archived_at timestamp
-- Already applied to production on 2026-04-20. Local file created 2026-04-21.
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS athletes_archived_at_idx ON athletes(archived_at) WHERE archived_at IS NULL;
