"""Google OAuth authentication endpoint."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.auth import GoogleAuthRequest, TokenResponse
from app.api.deps import check_auth_rate_limit
from app.persistence.db import get_session
from app.persistence.models import User
from app.services.auth_service import InvalidGoogleCredentialError, issue_token, verify_google_credential

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


@router.post("/google")
async def google_login(
    body: GoogleAuthRequest,
    _auth_rate_limit: None = Depends(check_auth_rate_limit),
    db: AsyncSession = Depends(get_session),
) -> TokenResponse:
    """Verify a Google ID token credential, upsert user, and return a JWT."""
    try:
        payload = await verify_google_credential(body.credential)
    except InvalidGoogleCredentialError as exc:
        logger.warning("Google credential verification failed: %s", exc.reason)
        raise HTTPException(status_code=401, detail="Authentication failed") from exc

    stmt = (
        pg_insert(User)
        .values(
            id=str(uuid.uuid4()),
            email=payload["email"],
            google_id=payload["sub"],
            display_name=payload.get("name"),
            avatar_url=payload.get("picture"),
        )
        .on_conflict_do_update(
            index_elements=["google_id"],
            set_={
                "display_name": payload.get("name"),
                "avatar_url": payload.get("picture"),
            },
        )
        .returning(User.id, User.email)
    )

    try:
        result = await db.execute(stmt)
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        logger.warning("Google login rejected because account identity could not be reconciled")
        raise HTTPException(status_code=401, detail="Authentication failed") from exc

    row = result.one()
    return TokenResponse(access_token=issue_token(row.id, row.email))
