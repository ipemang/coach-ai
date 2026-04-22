-- COA-88: Preserve original AI plan modification before coach edits
-- plan_modification_original is written once on first edit, never overwritten.
ALTER TABLE public.suggestions
    ADD COLUMN IF NOT EXISTS plan_modification_original jsonb NULL;
