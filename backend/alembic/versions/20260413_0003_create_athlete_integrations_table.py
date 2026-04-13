"""create athlete integrations table"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260413_0003_create_athlete_integrations_table"
down_revision = "20260413_0002_scope_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "athlete_integrations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("athlete_id", sa.Text(), nullable=False),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("organization_id", sa.Text(), nullable=True),
        sa.Column("coach_id", sa.Text(), nullable=True),
        sa.Column("provider_user_id", sa.Text(), nullable=True),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=True),
        sa.Column("token_type", sa.Text(), nullable=True),
        sa.Column("scopes", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'connected'")),
        sa.Column("first_connected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_backfill_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("webhook_subscription_id", sa.Text(), nullable=True),
        sa.Column("backfill_days", sa.Integer(), nullable=False, server_default=sa.text("90")),
        sa.Column("sync_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("connection_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc'::text, now())")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc'::text, now())")),
        sa.UniqueConstraint("provider", "athlete_id", name="athlete_integrations_provider_athlete_unique"),
        sa.CheckConstraint("provider in ('garmin', 'strava', 'oura')", name="athlete_integrations_provider_check"),
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS athlete_integrations_provider_athlete_idx ON public.athlete_integrations (provider, athlete_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS athlete_integrations_provider_status_idx ON public.athlete_integrations (provider, status, last_synced_at DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS athlete_integrations_organization_coach_idx ON public.athlete_integrations (organization_id, coach_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS public.athlete_integrations_organization_coach_idx")
    op.execute("DROP INDEX IF EXISTS public.athlete_integrations_provider_status_idx")
    op.execute("DROP INDEX IF EXISTS public.athlete_integrations_provider_athlete_idx")
    op.drop_table("athlete_integrations")
