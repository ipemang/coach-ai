"""add biological baseline athlete fields"""

from __future__ import annotations

from alembic import op

revision = "20260413_0004_add_biological_baseline_fields"
down_revision = "20260413_0003_create_athlete_integrations_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        do $$
        begin
            if to_regclass('public.athletes') is not null then
                alter table public.athletes add column if not exists age_years integer;
                alter table public.athletes add column if not exists training_age_years numeric;
                alter table public.athletes add column if not exists biological_baseline jsonb not null default '{}'::jsonb;
                execute 'create index if not exists athletes_organization_coach_age_idx on public.athletes (organization_id, coach_id, age_years)';
            end if;
        end $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        do $$
        begin
            if to_regclass('public.athletes') is not null then
                execute 'drop index if exists athletes_organization_coach_age_idx';
                alter table public.athletes drop column if exists biological_baseline;
                alter table public.athletes drop column if exists training_age_years;
                alter table public.athletes drop column if exists age_years;
            end if;
        end $$;
        """
    )
