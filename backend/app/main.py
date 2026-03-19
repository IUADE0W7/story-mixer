"""FastAPI application entrypoint for LoreForge."""

from __future__ import annotations

import logging
import os
import sys
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request

from app.api.v1.stories import router as stories_router
from app.config import settings
from app.persistence.db import engine
from app.persistence.models import Base


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Run optional startup work while keeping app startup test-friendly."""

    logger = logging.getLogger("app.lifespan")
    logger.info("startup: beginning lifespan startup sequence")

    if settings.auto_create_schema:
        logger.info("auto_create_schema enabled — creating DB schema if missing")
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

    yield

    logger.info("shutdown: lifespan completed")


def create_app() -> FastAPI:
    """Construct the FastAPI app once so tests and runtime share identical wiring."""

    app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)
    app.include_router(stories_router, prefix="/api/v1")

    @app.middleware("http")
    async def _log_requests(request: Request, call_next):
        logger = logging.getLogger("app.requests")
        start = time.time()
        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "unhandled exception handling request %s %s",
                request.method,
                request.url.path,
            )
            raise
        duration_ms = (time.time() - start) * 1000.0
        logger.info(
            "%s %s -> %s (%.1fms)",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
        return response

    logging.getLogger("app.main").info("FastAPI application constructed")
    return app


def _configure_logging() -> None:
    """Configure root and uvicorn logging to write to stdout with a simple format.

    This is intentionally lightweight so logs appear when running via `uvicorn app.main:app`.
    """

    level_name = (
        getattr(settings, "log_level", None) or os.getenv("LOG_LEVEL") or "INFO"
    ).upper()
    root_level = getattr(logging, level_name, logging.INFO)

    root_logger = logging.getLogger()
    # Avoid adding duplicate handlers if already configured (useful for tests)
    if not root_logger.handlers:
        handler = logging.StreamHandler(stream=sys.stdout)
        fmt = "%(asctime)s %(levelname)s [%(name)s] %(message)s"
        handler.setFormatter(logging.Formatter(fmt))
        root_logger.addHandler(handler)

    root_logger.setLevel(root_level)

    # Make sure uvicorn loggers don't hide application logs
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logging.getLogger(name).setLevel(root_level)

    # Ensure our `app.*` loggers always emit to stdout even when uvicorn configures handlers.
    for app_name in ("app", "app.requests", "app.main", "app.lifespan"):
        logger = logging.getLogger(app_name)
        logger.setLevel(root_level)
        if not logger.handlers:
            handler = logging.StreamHandler(stream=sys.stdout)
            fmt = "%(asctime)s %(levelname)s [%(name)s] %(message)s"
            handler.setFormatter(logging.Formatter(fmt))
            logger.addHandler(handler)
        logger.propagate = True


_configure_logging()

app = create_app()
