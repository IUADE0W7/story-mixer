"""add generation_requests table

Revision ID: 20260319_0002
Revises: 20260319_0001
Create Date: 2026-03-19
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260319_0002"
down_revision = "20260319_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "generation_requests",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column(
            "user_id",
            sa.Text,
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "requested_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_generation_requests_user_id_requested_at",
        "generation_requests",
        ["user_id", "requested_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_generation_requests_user_id_requested_at",
        table_name="generation_requests",
    )
    op.drop_table("generation_requests")
