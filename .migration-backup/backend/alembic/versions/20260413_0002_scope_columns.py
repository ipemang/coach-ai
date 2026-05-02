"""add organization and coach scope columns"""

from __future__ import annotations

from alembic import op

revision = "20260413_0002_scope_columns"
down_revision = "20260413_0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        do $$
        begin
            if to_regclass('public.athletes') is not null then
                alter table public.athletes add column if not exists organization_id text;
                alter table public.athletes add column if not exists coach_id text;
                execute 'create index if not exists athletes_organization_coach_idx on public.athletes (organization_id, coach_id)';
                execute 'create index if not exists athletes_organization_checkins_enabled_idx on public.athletes (organization_id, coach_id, checkins_enabled)';
            end if;

            if to_regclass('public.memory_states') is not null then
                alter table public.memory_states add column if not exists organization_id text;
                alter table public.memory_states add column if not exists coach_id text;
                execute 'create index if not exists memory_states_organization_coach_athlete_updated_idx on public.memory_states (organization_id, coach_id, athlete_id, updated_at desc)';
                execute 'create index if not exists memory_states_organization_coach_state_type_idx on public.memory_states (organization_id, coach_id, state_type)';
            end if;

            if to_regclass('public.suggestions') is not null then
                alter table public.suggestions add column if not exists organization_id text;
                alter table public.suggestions add column if not exists coach_id text;
                execute 'create index if not exists suggestions_organization_coach_athlete_status_created_idx on public.suggestions (organization_id, coach_id, athlete_id, status, created_at desc)';
                execute 'create index if not exists suggestions_organization_coach_memory_state_idx on public.suggestions (organization_id, coach_id, memory_state_id)';
            end if;

            if to_regclass('public.checkin_send_logs') is not null then
                alter table public.checkin_send_logs add column if not exists organization_id text;
                alter table public.checkin_send_logs add column if not exists coach_id text;
                execute 'create index if not exists checkin_send_logs_organization_coach_dedupe_idx on public.checkin_send_logs (organization_id, coach_id, dedupe_key)';
            end if;

            if to_regclass('public.coaches') is not null then
                alter table public.coaches add column if not exists organization_id text;
                alter table public.coaches add column if not exists coach_id text;
                execute 'create index if not exists coaches_organization_coach_idx on public.coaches (organization_id, coach_id)';
            end if;
        end $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        do $$
        begin
            if to_regclass('public.coaches') is not null then
                execute 'drop index if exists coaches_organization_coach_idx';
                alter table public.coaches drop column if exists organization_id;
                alter table public.coaches drop column if exists coach_id;
            end if;

            if to_regclass('public.checkin_send_logs') is not null then
                execute 'drop index if exists checkin_send_logs_organization_coach_dedupe_idx';
                alter table public.checkin_send_logs drop column if exists organization_id;
                alter table public.checkin_send_logs drop column if exists coach_id;
            end if;

            if to_regclass('public.suggestions') is not null then
                execute 'drop index if exists suggestions_organization_coach_athlete_status_created_idx';
                execute 'drop index if exists suggestions_organization_coach_memory_state_idx';
                alter table public.suggestions drop column if exists organization_id;
                alter table public.suggestions drop column if exists coach_id;
            end if;

            if to_regclass('public.memory_states') is not null then
                execute 'drop index if exists memory_states_organization_coach_athlete_updated_idx';
                execute 'drop index if exists memory_states_organization_coach_state_type_idx';
                alter table public.memory_states drop column if exists organization_id;
                alter table public.memory_states drop column if exists coach_id;
            end if;

            if to_regclass('public.athletes') is not null then
                execute 'drop index if exists athletes_organization_coach_idx';
                execute 'drop index if exists athletes_organization_checkins_enabled_idx';
                alter table public.athletes drop column if exists organization_id;
                alter table public.athletes drop column if exists coach_id;
            end if;
        end $$;
        """
    )
