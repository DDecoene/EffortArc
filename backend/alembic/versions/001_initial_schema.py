"""Initial schema

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "activities",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("strava_id", sa.String, unique=True, nullable=False),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("date", sa.DateTime, nullable=False),
        sa.Column("type", sa.String, nullable=False),
        sa.Column("raw_distance_m", sa.Float),
        sa.Column("raw_duration_s", sa.Integer),
        sa.Column("raw_gpx", sa.Text),
        sa.Column("cleaned_gpx", sa.Text),
        sa.Column("cleaned_distance_m", sa.Float),
        sa.Column("moving_time_s", sa.Integer),
        sa.Column("elevation_gain_m", sa.Float),
        sa.Column("avg_moving_pace", sa.Float),
        sa.Column("processed_at", sa.DateTime),
    )
    op.create_table(
        "activity_segments",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("activity_id", sa.Integer, sa.ForeignKey("activities.id"), nullable=False),
        sa.Column("km_index", sa.Integer, nullable=False),
        sa.Column("pace", sa.Float),
        sa.Column("elevation_change_m", sa.Float),
        sa.Column("grade_adjusted_pace", sa.Float),
        sa.Column("is_stop", sa.Boolean, default=False),
    )
    op.create_table(
        "goals",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("date", sa.DateTime, nullable=False),
        sa.Column("distance_km", sa.Float, nullable=False),
        sa.Column("elevation_gain_m", sa.Float),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", sa.DateTime),
    )
    op.create_table(
        "sync_state",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("last_synced_at", sa.DateTime),
        sa.Column("strava_access_token", sa.String),
        sa.Column("strava_refresh_token", sa.String),
        sa.Column("token_expires_at", sa.DateTime),
    )


def downgrade() -> None:
    op.drop_table("sync_state")
    op.drop_table("goals")
    op.drop_table("activity_segments")
    op.drop_table("activities")
