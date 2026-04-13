do $$
begin
    if to_regclass('public.athletes') is not null then
        alter table public.athletes add column if not exists age_years integer;
        alter table public.athletes add column if not exists training_age_years numeric;
        alter table public.athletes add column if not exists biological_baseline jsonb not null default '{}'::jsonb;
        execute 'create index if not exists athletes_organization_coach_age_idx on public.athletes (organization_id, coach_id, age_years)';
    end if;
end $$;
