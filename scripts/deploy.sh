#!/bin/bash
set -euo pipefail

DEPLOY_DIR="/opt/loreforge"

echo "╔══════════════════════════════════════════════════════╗"
echo "║           LoreForge Deploy                          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

cd "$DEPLOY_DIR"

# ── 1. Pull latest code ───────────────────────────────────────────────────────
echo "[1/4] Pulling latest code from main..."
git pull origin main

# ── 2. Refresh base images for image-based services ───────────────────────────
echo "[2/4] Pulling latest caddy and postgres images..."
docker compose pull caddy postgres

# ── 3. Rebuild built services with fresh base images, then start ──────────────
echo "[3/4] Building backend and frontend (with base image refresh)..."
docker compose build --pull backend frontend

echo "      Starting all services..."
docker compose up -d

# ── 4. Show status ────────────────────────────────────────────────────────────
echo "[4/4] Service status:"
docker compose ps

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║              Deploy complete!                       ║"
echo "╚══════════════════════════════════════════════════════╝"
