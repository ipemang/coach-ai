-- COA-66: Athlete document vault
-- Extends athlete_files with health-document fields, adds field-level encryption
-- infrastructure, and an AI-access audit log.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extend athlete_files with vault-specific columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.athlete_files
  ADD COLUMN IF NOT EXISTS uploaded_by    text        NOT NULL DEFAULT 'athlete',
  ADD COLUMN IF NOT EXISTS document_type  text;
-- document_type values: 'dexa' | 'blood_work' | 'doctor_notes' |
--                        'training_plan' | 'race_results' | 'other'

COMMENT ON COLUMN public.athlete_files.uploaded_by   IS 'athlete | coach';
COMMENT ON COLUMN public.athlete_files.document_type IS 'dexa | blood_work | doctor_notes | training_plan | race_results | other';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Per-athlete encryption keys (Fernet, stored encrypted by master key)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.athlete_encryption_keys (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id    uuid        UNIQUE NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  encrypted_key text        NOT NULL,   -- athlete Fernet key, encrypted by HEALTH_ENCRYPTION_MASTER_KEY
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.athlete_encryption_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_athlete_encryption_keys"
  ON public.athlete_encryption_keys
  USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Athlete health records — extracted structured values, field-level encrypted
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.athlete_health_records (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id       uuid        NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  file_id          uuid        REFERENCES public.athlete_files(id) ON DELETE SET NULL,
  record_type      text        NOT NULL,    -- 'dexa' | 'blood_work' | 'vitals' | 'other'
  encrypted_values bytea       NOT NULL,    -- Fernet-encrypted JSON blob of extracted values
  ai_accessible    boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS athlete_health_records_athlete_id_idx
  ON public.athlete_health_records(athlete_id);

ALTER TABLE public.athlete_health_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_athlete_health_records"
  ON public.athlete_health_records
  USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. AI access audit log — every AI read of health data logged here
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.health_record_access_log (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id          uuid        NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  file_id             uuid        REFERENCES public.athlete_files(id) ON DELETE SET NULL,
  health_record_id    uuid        REFERENCES public.athlete_health_records(id) ON DELETE SET NULL,
  accessed_by         text        NOT NULL DEFAULT 'ai',  -- 'ai' | 'coach'
  access_type         text        NOT NULL DEFAULT 'read',
  context_endpoint    text,       -- which backend endpoint triggered the access
  reasoning_call_id   text,       -- suggestion/reasoning ID that triggered access
  accessed_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS health_record_access_log_athlete_id_idx
  ON public.health_record_access_log(athlete_id);
CREATE INDEX IF NOT EXISTS health_record_access_log_file_id_idx
  ON public.health_record_access_log(file_id);

ALTER TABLE public.health_record_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_health_record_access_log"
  ON public.health_record_access_log
  USING (auth.role() = 'service_role');
