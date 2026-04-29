"""Add commute flag to activities

Revision ID: 003
Revises: 002
Create Date: 2026-04-29
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("activities") as batch_op:
        batch_op.add_column(sa.Column("commute", sa.Boolean, nullable=False, server_default="0"))


def downgrade() -> None:
    with op.batch_alter_table("activities") as batch_op:
        batch_op.drop_column("commute")
