create table if not exists public.suggestions (
    id uuid primary key default gen_random_uuid(),
    athlete_id text not null,
    memory_state_id text null,
    source text not null default 'coach-ai',
    plan_context jsonb null,
    suggestion jsonb not null,
    suggestion_text text null,
    status text not null default 'pending',
    coach_decision text null,
    coach_notes text null,
    coach_edited_payload jsonb null,
    athlete_phone_number text null,
    athlete_timezone_name text null,
    athlete_display_name text null,
    verified_at timestamptz null,
    confirmation_sent_at timestamptz null,
    confirmation_message_id text null,
    confirmation_error text null,
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now()),
    constraint suggestions_status_check check (status in ('pending', 'approved', 'edited', 'ignored')),
    constraint suggestions_decision_check check (coach_decision is null or coach_decision in ('Approve', 'Edit', 'Ignore'))
);

create index if not exists suggestions_athlete_id_status_created_at_idx
    on public.suggestions (athlete_id, status, created_at desc);

create index if not exists suggestions_memory_state_id_idx
    on public.suggestions (memory_state_id);
