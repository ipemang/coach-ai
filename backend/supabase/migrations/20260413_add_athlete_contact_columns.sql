do $$
begin
    if to_regclass('public.athletes') is not null then
        alter table public.athletes add column if not exists phone_number text;
        alter table public.athletes add column if not exists email text;
        alter table public.athletes add column if not exists organization_id text default '1';
    end if;
end $$;
