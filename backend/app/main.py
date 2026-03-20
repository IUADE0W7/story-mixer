"""FastAPI application entrypoint for LoreForge."""

from __future__ import annotations

import logging
import os
import sys
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.deps import RateLimitExceeded
from app.api.v1.auth import router as auth_router
from app.api.v1.stories import router as stories_router
from app.config import settings
from app.logging_context import RequestIdFilter, reset_request_id, set_request_id
from app.persistence.db import engine
from app.persistence.models import Base


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Run optional startup work while keeping app startup test-friendly."""

    logger = logging.getLogger("app.lifespan")
    logger.info("startup: beginning lifespan startup sequence")

    if settings.use_stub_llm:
        logger.warning("USE_STUB_LLM=true — no real LLM calls will be made")
    else:
        logger.info(
            "Active LLM provider: %s / %s",
            settings.llm_provider,
            settings.llm_model,
        )

    if settings.auto_create_schema:
        logger.warning("auto_create_schema enabled — creating DB schema if missing")
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

    try:
        async with engine.connect():
            pass
        logger.info("DB connection established")
    except Exception:
        logger.exception("DB connection failed at startup")

    yield

    logger.info("shutdown: lifespan completed")


def create_app() -> FastAPI:
    """Construct the FastAPI app once so tests and runtime share identical wiring."""

    app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)
    app.include_router(stories_router, prefix="/api/v1")
    app.include_router(auth_router, prefix="/api/v1")

    @app.exception_handler(RateLimitExceeded)
    async def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
        return JSONResponse(
            status_code=429,
            headers={"Retry-After": exc.retry_after.strftime("%a, %d %b %Y %H:%M:%S GMT")},
            content={
                "detail": "Rate limit exceeded",
                "retry_after": exc.retry_after.strftime("%Y-%m-%dT%H:%M:%SZ"),
            },
        )

    @app.middleware("http")
    async def _log_requests(request: Request, call_next):
        logger = logging.getLogger("app.requests")
        req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())[:8]
        token = set_request_id(req_id)
        start = time.time()
        try:
            response = await call_next(request)
            duration_ms = (time.time() - start) * 1000.0
            logger.info(
                "%s %s -> %s (%.1fms)",
                request.method,
                request.url.path,
                response.status_code,
                duration_ms,
            )
            response.headers["X-Request-ID"] = req_id
            return response
        except Exception:
            logger.exception(
                "unhandled exception handling request %s %s",
                request.method,
                request.url.path,
            )
            raise
        finally:
            reset_request_id(token)

    logging.getLogger("app.main").info("FastAPI application constructed")
    return app


def _configure_logging() -> None:
    """Configure root and uvicorn logging to write to stdout with request-ID context."""

    level_name = (
        getattr(settings, "log_level", None) or os.getenv("LOG_LEVEL") or "INFO"
    ).upper()
    root_level = getattr(logging, level_name, logging.INFO)

    fmt = "%(asctime)s %(levelname)-8s [%(name)s] [req=%(req_id)s] %(message)s"

    def _make_handler() -> logging.StreamHandler:
        h = logging.StreamHandler(stream=sys.stdout)
        h.setFormatter(logging.Formatter(fmt))
        h.addFilter(RequestIdFilter())
        return h

    root_logger = logging.getLogger()
    if not root_logger.handlers:
        root_logger.addHandler(_make_handler())
    else:
        for h in root_logger.handlers:
            if not any(isinstance(f, RequestIdFilter) for f in h.filters):
                h.addFilter(RequestIdFilter())
                h.setFormatter(logging.Formatter(fmt))

    root_logger.setLevel(root_level)

    # Suppress uvicorn's own access logger — the app middleware handles request logging
    logging.getLogger("uvicorn.access").propagate = False
    logging.getLogger("uvicorn.access").setLevel(logging.CRITICAL)

    for name in ("uvicorn", "uvicorn.error"):
        logging.getLogger(name).setLevel(root_level)

    for app_name in ("app", "app.requests", "app.main", "app.lifespan"):
        lg = logging.getLogger(app_name)
        lg.setLevel(root_level)
        if not lg.handlers:
            lg.addHandler(_make_handler())
        else:
            for h in lg.handlers:
                if not any(isinstance(f, RequestIdFilter) for f in h.filters):
                    h.addFilter(RequestIdFilter())
                    h.setFormatter(logging.Formatter(fmt))
        lg.propagate = True


_configure_logging()

app = create_app()
