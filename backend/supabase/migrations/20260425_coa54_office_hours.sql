-- COA-54: Office hours / AI autonomy mode
-- Adds office_hours JSONB and ai_autonomy_override bool to coaches table.
-- office_hours shape: { timezone: string, mon?: [start, end], tue?: [...], ... sun?: [...] }
-- If a day has no entry, AI runs autonomously for that day.

ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS office_hours        JSONB    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_autonomy_override BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.coaches.office_hours IS
  'JSONB map of day → [start_time, end_time] in HH:MM 24h format, plus a timezone key. Absence of a day = AI autonomous for that day.';

COMMENT ON COLUMN public.coaches.ai_autonomy_override IS
  'When true, AI responds immediately regardless of office_hours schedule.';
