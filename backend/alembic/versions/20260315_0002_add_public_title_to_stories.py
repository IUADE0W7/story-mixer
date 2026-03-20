"""add public title to stories

Revision ID: 20260315_0002
Revises: 20260315_0001
Create Date: 2026-03-15 00:30:00

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260315_0002"
down_revision = "20260315_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add an optional user-supplied title for public story labeling."""

    op.add_column("stories", sa.Column("public_title", sa.Text(), nullable=True))


def downgrade() -> None:
    """Remove the optional public title column from stories."""

    op.drop_column("stories", "public_title")