create table if not exists public.methodologies (
    id uuid primary key default gen_random_uuid(),
    coach_id text not null,
    organization_id text null,
    source text not null default 'voice_memo',
    transcript text not null,
    methodology_playbook jsonb not null,
    persona_system_prompt text not null,
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists methodologies_coach_id_created_at_idx
    on public.methodologies (coach_id, created_at desc);

create index if not exists methodologies_organization_id_created_at_idx
    on public.methodologies (organization_id, created_at desc);
