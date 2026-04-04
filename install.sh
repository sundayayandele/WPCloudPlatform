#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
# WPCloud Installer — Turns a raw Ubuntu 22.04/24.04 server into a
# high-performance WordPress hosting suite.
#
# Run as root:  curl -fsSL https://your-server/install.sh | bash
# Or locally:  sudo bash install.sh
# ═════════════════════════════════════════════════════════════════════════════

set -euo pipefail
DEBIAN_FRONTEND=noninteractive

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()     { echo -e "${GREEN}[✔]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✗]${NC} $*"; exit 1; }
heading() { echo -e "\n${BLUE}══════════════════════════════════════════${NC}"; echo -e "${BLUE} $*${NC}"; echo -e "${BLUE}══════════════════════════════════════════${NC}"; }

[[ $EUID -ne 0 ]] && error "Run as root: sudo bash install.sh"
[[ -f /etc/os-release ]] && source /etc/os-release
[[ "${ID}" != "ubuntu" ]] && error "Ubuntu 22.04 or 24.04 required"

WPCLOUD_DIR="/opt/wpcloud"
WPCLOUD_USER="wpcloud"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
MARIADB_ROOT_PASS=$(openssl rand -base64 32)
API_TOKEN=$(openssl rand -hex 32)

# ─── 1. System dependencies ──────────────────────────────────────────────────
heading "Step 1/9 — Updating system packages"
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
    curl wget git unzip jq \
    ufw fail2ban \
    certbot \
    borgbackup \
    nginx \
    python3 python3-pip python3-venv \
    mariadb-client \
    redis-tools \
    ca-certificates gnupg lsb-release

# ─── 2. Docker ───────────────────────────────────────────────────────────────
heading "Step 2/9 — Installing Docker Engine"
if ! command -v docker &>/dev/null; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
        https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
        > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable --now docker
    log "Docker installed: $(docker --version)"
else
    log "Docker already installed"
fi

# ─── 3. Shared MariaDB container ─────────────────────────────────────────────
heading "Step 3/9 — Starting shared MariaDB container"
docker network create wpcloud_mariadb_net 2>/dev/null || true

docker run -d \
    --name wpcloud-mariadb \
    --restart unless-stopped \
    --network wpcloud_mariadb_net \
    -e MARIADB_ROOT_PASSWORD="${MARIADB_ROOT_PASS}" \
    -v wpcloud_mariadb_data:/var/lib/mysql \
    -v /opt/wpcloud/mysql-conf:/etc/mysql/conf.d \
    mariadb:11

# MariaDB tuning config
mkdir -p /opt/wpcloud/mysql-conf
cat > /opt/wpcloud/mysql-conf/wpcloud.cnf <<'EOF'
[mysqld]
innodb_buffer_pool_size     = 512M
innodb_log_file_size        = 128M
innodb_flush_log_at_trx_commit = 2
innodb_flush_method         = O_DIRECT
query_cache_type            = 0
max_connections             = 150
wait_timeout                = 600
interactive_timeout         = 600
slow_query_log              = 1
slow_query_log_file         = /var/log/mysql/slow.log
long_query_time             = 2
EOF
log "MariaDB container started"

# ─── 4. Nginx global config ──────────────────────────────────────────────────
heading "Step 4/9 — Configuring Nginx"
mkdir -p /etc/nginx/sites-enabled /var/www/letsencrypt

cat > /etc/nginx/nginx.conf <<'NGINXEOF'
user www-data;
worker_processes auto;
worker_rlimit_nofile 65535;
error_log /var/log/nginx/error.log warn;
pid /run/nginx.pid;

events {
    worker_connections  4096;
    use epoll;
    multi_accept on;
}

http {
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    server_tokens off;
    client_max_body_size 64M;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    include /etc/nginx/sites-enabled/*.conf;
}
NGINXEOF

nginx -t && systemctl reload nginx
log "Nginx configured"

# ─── 5. Firewall + fail2ban ──────────────────────────────────────────────────
heading "Step 5/9 — Hardening firewall"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw allow 8080/tcp comment 'WPCloud Dashboard'
ufw --force enable
log "UFW firewall enabled"

cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
ignoreip = 127.0.0.1/8

[sshd]
enabled = true
maxretry = 3

[nginx-http-auth]
enabled = true

[nginx-botsearch]
enabled = true
EOF
systemctl enable --now fail2ban
log "fail2ban enabled"

# ─── 6. WPCloud application ──────────────────────────────────────────────────
heading "Step 6/9 — Installing WPCloud backend"
mkdir -p "${WPCLOUD_DIR}"/{sites,backups,scripts,logs,frontend}
cp -r /tmp/wpcloud/backend "${WPCLOUD_DIR}/"
cp -r /tmp/wpcloud/templates "${WPCLOUD_DIR}/"
cp -r /tmp/wpcloud/scripts "${WPCLOUD_DIR}/"
chmod +x "${WPCLOUD_DIR}"/scripts/*.sh

# Python venv
python3 -m venv "${WPCLOUD_DIR}/venv"
"${WPCLOUD_DIR}/venv/bin/pip" install -q \
    fastapi uvicorn[standard] aiodocker aiofiles jinja2 httpx pydantic tinydb

# ─── 7. Environment config ───────────────────────────────────────────────────
heading "Step 7/9 — Writing configuration"
cat > "${WPCLOUD_DIR}/.env" <<ENVEOF
SITES_ROOT=${WPCLOUD_DIR}/sites
BORG_REPO=${WPCLOUD_DIR}/backups
MARIADB_ROOT_PASS=${MARIADB_ROOT_PASS}
API_TOKEN=${API_TOKEN}
LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL}
WPCLOUD_DIR=${WPCLOUD_DIR}
ENVEOF
chmod 600 "${WPCLOUD_DIR}/.env"

# ─── 8. Systemd service ──────────────────────────────────────────────────────
heading "Step 8/9 — Creating systemd service"
cat > /etc/systemd/system/wpcloud.service <<SERVICEEOF
[Unit]
Description=WPCloud Orchestrator API
After=network.target docker.service

[Service]
Type=simple
User=root
WorkingDirectory=${WPCLOUD_DIR}/backend
EnvironmentFile=${WPCLOUD_DIR}/.env
ExecStart=${WPCLOUD_DIR}/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8080 --workers 2
Restart=always
RestartSec=5
StandardOutput=append:${WPCLOUD_DIR}/logs/wpcloud.log
StandardError=append:${WPCLOUD_DIR}/logs/wpcloud-error.log

[Install]
WantedBy=multi-user.target
SERVICEEOF

systemctl daemon-reload
systemctl enable --now wpcloud
log "WPCloud service started"

# ─── 9. Certbot auto-renewal ─────────────────────────────────────────────────
heading "Step 9/9 — SSL auto-renewal"
(crontab -l 2>/dev/null; echo "0 2 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab -
log "Certbot renewal cron configured"

# ─── Done ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  WPCloud installed successfully!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Dashboard URL: ${BLUE}http://$(curl -s ifconfig.me):8080${NC}"
echo -e "  API Token:     ${YELLOW}${API_TOKEN}${NC}"
echo -e "  MariaDB Root:  (saved to ${WPCLOUD_DIR}/.env)"
echo ""
echo -e "${YELLOW}⚠  Save the API token — you will need it to log in!${NC}"
echo ""
