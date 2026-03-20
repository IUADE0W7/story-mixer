#!/bin/bash
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
# Update REPO_URL before running on the server
REPO_URL="https://github.com/YOUR_ORG/story-mixer.git"
DEPLOY_DIR="/opt/loreforge"
DEPLOY_USER="deploy"

echo "╔══════════════════════════════════════════════════════╗"
echo "║     LoreForge Hetzner Provisioning Script            ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Running as: $(whoami) on $(hostname)"
echo ""

# ── 1. System update ──────────────────────────────────────────────────────────
echo "[1/7] Updating system packages..."
apt-get update -y
apt-get upgrade -y

# ── 2. Install Docker (official repo) ─────────────────────────────────────────
echo "[2/7] Installing Docker..."
if command -v docker &>/dev/null; then
    echo "  Docker already installed: $(docker --version)"
else
    apt-get install -y ca-certificates curl
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo \
        "deb [arch=$(dpkg --print-architecture) \
        signed-by=/etc/apt/keyrings/docker.asc] \
        https://download.docker.com/linux/ubuntu \
        $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        | tee /etc/apt/sources.list.d/docker.list >/dev/null
    apt-get update -y
    apt-get install -y \
        docker-ce docker-ce-cli containerd.io \
        docker-buildx-plugin docker-compose-plugin
    echo "  Installed: $(docker --version)"
fi

systemctl enable docker
systemctl start docker

# ── 3. Install git and ufw ────────────────────────────────────────────────────
echo "[3/7] Installing git and ufw..."
apt-get install -y git ufw

# ── 4. Configure UFW firewall ─────────────────────────────────────────────────
echo "[4/7] Configuring UFW firewall..."
# Set default policy BEFORE enabling to avoid open-firewall window
ufw default deny incoming
ufw default allow outgoing
# Allow SSH BEFORE enabling or current session will drop
ufw allow 22/tcp   comment 'SSH'
ufw allow 80/tcp   comment 'HTTP'
ufw allow 443/tcp  comment 'HTTPS'
ufw --force enable
echo "  Firewall status:"
ufw status verbose

# NOTE: Docker bypasses UFW by directly manipulating iptables.
# Only Caddy exposes host ports (80, 443) in this setup — this is safe.
# Do NOT add ports: mappings to backend, frontend, or postgres in docker-compose.yml.

# ── 5. Create deploy user ─────────────────────────────────────────────────────
echo "[5/7] Creating deploy user..."
if id "$DEPLOY_USER" &>/dev/null; then
    echo "  User '$DEPLOY_USER' already exists."
else
    useradd -m -s /bin/bash "$DEPLOY_USER"
    echo "  Created user: $DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"
echo "  '$DEPLOY_USER' added to docker group."

# ── 6. Clone repository ───────────────────────────────────────────────────────
echo "[6/7] Setting up repository at $DEPLOY_DIR..."
if [ -d "$DEPLOY_DIR/.git" ]; then
    echo "  Repository already exists, skipping clone."
else
    # For private repos: set up an SSH deploy key or GitHub PAT before this step.
    # See: https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys
    git clone "$REPO_URL" "$DEPLOY_DIR"
fi
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_DIR"

# ── 7. Print next steps ───────────────────────────────────────────────────────
echo ""
echo "[7/7] Provisioning complete!"
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║                   NEXT STEPS                        ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "1. Create the .env file:"
echo "   cp $DEPLOY_DIR/.env.production.example $DEPLOY_DIR/.env"
echo "   chmod 600 $DEPLOY_DIR/.env"
echo "   chown $DEPLOY_USER:$DEPLOY_USER $DEPLOY_DIR/.env"
echo ""
echo "2. Edit $DEPLOY_DIR/.env and set:"
echo "   DOMAIN=your-registered-domain.com"
echo "   POSTGRES_PASSWORD=a_secure_alphanumeric_password"
echo "   XAI_API_KEY=your_xai_api_key"
echo ""
echo "3. Point your domain's DNS A record to this server's IP:"
echo "   $(curl -s ifconfig.me 2>/dev/null || echo '<run: curl ifconfig.me>')"
echo ""
echo "4. Run the first deployment:"
echo "   su - $DEPLOY_USER -c 'cd $DEPLOY_DIR && bash scripts/deploy.sh'"
echo ""
echo "Caddy will obtain a TLS certificate automatically on first request."
