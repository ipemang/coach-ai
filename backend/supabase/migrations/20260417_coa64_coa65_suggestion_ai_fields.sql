-- COA-64 / COA-65: Add AI pipeline fields to suggestions table
-- Adds message_draft, message_personalized, message_class, classification_confidence,
-- message_reasoning, plan_modification_payload, plan_modification_status,
-- message_reasoning, coach_reply, and athlete_message join field.
-- Also fixes the coach_decision check constraint to use lowercase values
-- consistent with the FastAPI /decide endpoint and frontend.

-- 1. New AI pipeline columns
alter table public.suggestions
    add column if not exists message_draft            text        null,
    add column if not exists message_personalized     text        null,
    add column if not exists message_class            text        null,
    add column if not exists classification_confidence numeric     null,
    add column if not exists message_reasoning        text        null,
    add column if not exists plan_modification_payload jsonb      null,
    add column if not exists plan_modification_status text        null,
    add column if not exists coach_reply              text        null,
    add column if not exists athlete_message          text        null;

-- 2. Fix coach_decision constraint: drop old capitalised-values check, add lowercase version
alter table public.suggestions
    drop constraint if exists suggestions_decision_check;

alter table public.suggestions
    add constraint suggestions_decision_check
        check (coach_decision is null or coach_decision in ('approved', 'rejected', 'modified', 'Approve', 'Edit', 'Ignore'));

-- 3. Fix status constraint to include 'sent' (used by the frontend after WhatsApp delivery)
alter table public.suggestions
    drop constraint if exists suggestions_status_check;

alter table public.suggestions
    add constraint suggestions_status_check
        check (status in ('pending', 'approved', 'edited', 'ignored', 'sent', 'modified'));

-- 4. Index on message_class for future analytics queries
create index if not exists suggestions_message_class_idx
    on public.suggestions (message_class);
