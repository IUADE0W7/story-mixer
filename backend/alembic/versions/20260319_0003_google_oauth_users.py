"""replace password_hash with google oauth columns

Revision ID: 20260319_0003
Revises: 20260319_0002
Create Date: 2026-03-19
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260319_0003"
down_revision = "20260319_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Fresh start: wipe all users (and cascade to generation_requests via FK)
    op.execute("TRUNCATE users CASCADE")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_column("users", "password_hash")

    op.add_column("users", sa.Column("google_id", sa.Text, nullable=False, server_default=""))
    op.add_column("users", sa.Column("display_name", sa.Text, nullable=True))
    op.add_column("users", sa.Column("avatar_url", sa.Text, nullable=True))

    # Remove the temporary server_default used to satisfy NOT NULL during ALTER
    op.alter_column("users", "google_id", server_default=None)

    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_google_id", "users", ["google_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_google_id", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_column("users", "avatar_url")
    op.drop_column("users", "display_name")
    op.drop_column("users", "google_id")
    op.add_column("users", sa.Column("password_hash", sa.Text, nullable=False, server_default=""))
    op.alter_column("users", "password_hash", server_default=None)
    op.create_index("ix_users_email", "users", ["email"], unique=True)
