"""Add sport_type to goals

Revision ID: 002
Revises: 001
Create Date: 2024-01-02 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add nullable first so existing rows aren't rejected, then backfill, then set NOT NULL
    with op.batch_alter_table("goals") as batch_op:
        batch_op.add_column(sa.Column("sport_type", sa.String, nullable=True))

    op.execute("UPDATE goals SET sport_type = 'hiking' WHERE sport_type IS NULL")

    # SQLite doesn't support ALTER COLUMN, so batch_alter handles the NOT NULL constraint
    with op.batch_alter_table("goals") as batch_op:
        batch_op.alter_column("sport_type", nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("goals") as batch_op:
        batch_op.drop_column("sport_type")
