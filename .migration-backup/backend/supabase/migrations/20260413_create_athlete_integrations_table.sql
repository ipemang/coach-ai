create table if not exists public.athlete_integrations (
    id uuid primary key default gen_random_uuid(),
    athlete_id text not null,
    provider text not null,
    organization_id text,
    coach_id text,
    provider_user_id text,
    access_token text not null,
    refresh_token text,
    token_type text,
    scopes jsonb not null default '[]'::jsonb,
    expires_at timestamptz,
    raw_payload jsonb not null default '{}'::jsonb,
    status text not null default 'connected',
    first_connected_at timestamptz,
    last_synced_at timestamptz,
    last_backfill_at timestamptz,
    next_sync_at timestamptz,
    webhook_subscription_id text,
    backfill_days integer not null default 90,
    sync_enabled boolean not null default true,
    connection_error text,
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now()),
    constraint athlete_integrations_provider_athlete_unique unique (provider, athlete_id),
    constraint athlete_integrations_provider_check check (provider in ('garmin', 'strava', 'oura'))
);

create index if not exists athlete_integrations_provider_athlete_idx on public.athlete_integrations (provider, athlete_id);
create index if not exists athlete_integrations_provider_status_idx on public.athlete_integrations (provider, status, last_synced_at desc);
create index if not exists athlete_integrations_organization_coach_idx on public.athlete_integrations (organization_id, coach_id);
