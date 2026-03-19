"""Verify User and GenerationRequest ORM models have expected columns and indexes."""
from app.persistence.models import GenerationRequest, User


def test_user_model_columns() -> None:
    cols = {c.name for c in User.__table__.columns}
    assert cols == {"id", "email", "password_hash", "created_at"}


def test_user_email_unique_index() -> None:
    indexes = {idx.name for idx in User.__table__.indexes}
    assert any("email" in name for name in indexes)


def test_generation_request_model_columns() -> None:
    cols = {c.name for c in GenerationRequest.__table__.columns}
    assert cols == {"id", "user_id", "requested_at"}


def test_generation_request_composite_index() -> None:
    col_sets = [
        {c.name for c in idx.columns}
        for idx in GenerationRequest.__table__.indexes
    ]
    assert {"user_id", "requested_at"} in col_sets
