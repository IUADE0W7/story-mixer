"""create stories table

Revision ID: 20260315_0001
Revises:
Create Date: 2026-03-15 00:00:00

"""

from __future__ import annotations

from alembic import op
from sqlalchemy import Boolean, DateTime, Integer, Text, text
from sqlalchemy.dialects import postgresql
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260315_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create stories table for generated content and calibration metadata."""

    op.create_table(
        "stories",
        sa.Column("id", Text(), nullable=False),
        sa.Column("content", Text(), nullable=False),
        sa.Column("vibe_profile", postgresql.JSONB(astext_type=Text()), nullable=False),
        sa.Column("normalized_vibe", postgresql.JSONB(astext_type=Text()), nullable=False),
        sa.Column("judge_report", postgresql.JSONB(astext_type=Text()), nullable=False),
        sa.Column("revision_count", Integer(), nullable=False, server_default=text("0")),
        sa.Column("low_confidence", Boolean(), nullable=False, server_default=text("false")),
        sa.Column("created_at", DateTime(timezone=True), nullable=False, server_default=text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    """Drop stories table created for generation persistence."""

    op.drop_table("stories")
