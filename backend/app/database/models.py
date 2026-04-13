from sqlalchemy import Boolean, Column, DateTime, Integer, JSON, String, Text, UniqueConstraint, func

from app.database.session import Base


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AthleteIntegrationToken(Base):
    __tablename__ = "athlete_integrations"
    __table_args__ = (
        UniqueConstraint("provider", "athlete_id", name="athlete_integrations_provider_athlete_unique"),
    )

    id = Column(String, primary_key=True, index=True)
    athlete_id = Column(String, nullable=False, index=True)
    provider = Column(String, nullable=False, index=True)
    organization_id = Column(String, nullable=True, index=True)
    coach_id = Column(String, nullable=True, index=True)
    provider_user_id = Column(String, nullable=True, index=True)
    access_token = Column(Text, nullable=False)
    refresh_token = Column(Text, nullable=True)
    token_type = Column(String, nullable=True)
    scopes = Column(JSON, nullable=False, server_default="[]")
    expires_at = Column(DateTime(timezone=True), nullable=True)
    raw_payload = Column(JSON, nullable=False, server_default="{}")
    status = Column(String, nullable=False, server_default="connected")
    first_connected_at = Column(DateTime(timezone=True), nullable=True)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    last_backfill_at = Column(DateTime(timezone=True), nullable=True)
    next_sync_at = Column(DateTime(timezone=True), nullable=True)
    webhook_subscription_id = Column(String, nullable=True)
    backfill_days = Column(Integer, nullable=False, server_default="90")
    sync_enabled = Column(Boolean, nullable=False, server_default="true")
    connection_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
