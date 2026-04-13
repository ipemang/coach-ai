"""initial schema"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260413_0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_table(
        "suggestions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("athlete_id", sa.Text(), nullable=False),
        sa.Column("memory_state_id", sa.Text(), nullable=True),
        sa.Column("source", sa.Text(), nullable=False, server_default=sa.text("'coach-ai'")),
        sa.Column("plan_context", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("suggestion", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("suggestion_text", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("coach_decision", sa.Text(), nullable=True),
        sa.Column("coach_notes", sa.Text(), nullable=True),
        sa.Column("coach_edited_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("athlete_phone_number", sa.Text(), nullable=True),
        sa.Column("athlete_timezone_name", sa.Text(), nullable=True),
        sa.Column("athlete_display_name", sa.Text(), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmation_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmation_message_id", sa.Text(), nullable=True),
        sa.Column("confirmation_error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("timezone('utc'::text, now())"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("timezone('utc'::text, now())"),
        ),
        sa.CheckConstraint(
            "status in ('pending', 'approved', 'edited', 'ignored')",
            name="suggestions_status_check",
        ),
        sa.CheckConstraint(
            "coach_decision is null or coach_decision in ('Approve', 'Edit', 'Ignore')",
            name="suggestions_decision_check",
        ),
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS suggestions_athlete_id_status_created_at_idx "
        "ON public.suggestions (athlete_id, status, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS suggestions_memory_state_id_idx "
        "ON public.suggestions (memory_state_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS public.suggestions_memory_state_id_idx")
    op.execute("DROP INDEX IF EXISTS public.suggestions_athlete_id_status_created_at_idx")
    op.drop_table("suggestions")
    op.drop_table("organizations")
