# WPCloud — Self-Hosted WordPress Hosting Suite

A self-hosted platform that turns a raw Ubuntu server into a high-performance, multi-tenant WordPress hosting environment. Inspired by FlyWP / GridPane.

---

## Architecture

```
Internet → Nginx (global reverse proxy + FastCGI cache)
               └─ Site A: PHP-FPM container ↔ Redis container
               └─ Site B: PHP-FPM container ↔ Redis container
               └─ Site N: PHP-FPM container ↔ Redis container
               
Shared: MariaDB 11 container (each site = isolated DB + user)
Control plane: FastAPI orchestrator (port 8080)
Dashboard: React SPA (served via Nginx or Vite)
```

## Stack per site
- **Nginx** — reverse proxy, FastCGI cache (1 GB zone per site), TLS termination
- **PHP-FPM** — WordPress, tuned with 256 MB memory, 64 MB uploads
- **MariaDB 11** — shared container, isolated DB + user per site  
- **Redis 7** — per-site object cache (128 MB, LRU eviction)
- **Certbot** — Let's Encrypt certificate + auto-renewal

---

## Quick Start (fresh Ubuntu 22.04 / 24.04)

```bash
# 1. Clone the repo
git clone https://github.com/yourname/wpcloud /tmp/wpcloud

# 2. Set your Let's Encrypt email
export LETSENCRYPT_EMAIL=you@example.com

# 3. Run the installer (as root)
sudo bash /tmp/wpcloud/scripts/install.sh

# 4. Open the dashboard
# http://<server-ip>:8080
# Log in with the API token printed at the end of install
```

---

## Creating a Site (API)

```bash
curl -X POST http://localhost:8080/api/sites \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "client-site.com",
    "php_version": "8.3",
    "admin_email": "admin@client-site.com",
    "redis": true,
    "auto_ssl": true,
    "staging": false
  }'
```

The orchestrator will:
1. Create `client-site.com` MariaDB database + user
2. Start isolated PHP-FPM + Redis containers
3. Write tuned Nginx config with FastCGI cache
4. Request Let's Encrypt cert via Certbot
5. Install WordPress + Redis Object Cache + Nginx Cache Purge
6. Schedule daily BorgBackup at 03:00 UTC

---

## Directory Layout

```
/opt/wpcloud/
├── sites/
│   └── client-site.com/
│       ├── docker-compose.yml    # per-site compose file
│       ├── wordpress/            # WP files (bind-mounted)
│       ├── nginx/
│       │   ├── cache/            # FastCGI cache directory
│       │   └── logs/
│       └── backups/
├── backend/                      # FastAPI app
├── templates/                    # Jinja2 templates
├── scripts/                      # backup.sh, install.sh, etc.
├── backups/                      # BorgBackup repos
└── .env                          # secrets (chmod 600)
```

---

## Environment Variables (.env)

| Variable | Description |
|---|---|
| `MARIADB_ROOT_PASS` | MariaDB root password (auto-generated) |
| `API_TOKEN` | Dashboard authentication token |
| `LETSENCRYPT_EMAIL` | Email for Let's Encrypt notifications |
| `BORG_PASSPHRASE` | BorgBackup encryption passphrase |
| `BORG_REPO` | Path to BorgBackup repository |
| `CLOUDFLARE_API_TOKEN` | (optional) Cloudflare API token for DNS |
| `CLOUDFLARE_ZONE_ID` | (optional) Cloudflare zone ID |

---

## Backups (BorgBackup)

Each site gets a cron job at 03:00 UTC:

```bash
# Manual backup
/opt/wpcloud/scripts/backup.sh client-site.com <site_id>

# List archives
borg list /opt/wpcloud/backups/client-site.com

# Restore
borg extract /opt/wpcloud/backups/client-site.com::client-site.com-2025-01-02T03:00
```

Retention: **7 daily, 4 weekly, 6 monthly** with deduplication (~4× compression).

---

## Staging

```bash
# Create staging environment
POST /api/sites/{site_id}/staging

# Push staging → production
POST /api/sites/{site_id}/staging/{staging_id}/push
```

Staging runs at `staging.yourdomain.com` with fully isolated containers and DB.
Push to production: rsync files + mysqldump DB + WP search-replace URLs.

---

## Security

- UFW firewall (allow 22, 80, 443, 8080 only)
- fail2ban (SSH + nginx-http-auth + nginx-botsearch)
- Nginx: security headers (HSTS, X-Frame-Options, CSP)
- WordPress: xmlrpc.php blocked, wp-config.php protected
- MariaDB: each site has its own user with least-privilege grants

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/sites | List all sites |
| POST | /api/sites | Create + provision site |
| GET | /api/sites/{id} | Get site details |
| DELETE | /api/sites/{id} | Teardown site |
| POST | /api/sites/{id}/restart | Restart containers |
| GET | /api/sites/{id}/logs | Get container logs |
| POST | /api/sites/{id}/staging | Create staging |
| POST | /api/sites/{id}/staging/{sid}/push | Promote staging |
| GET | /api/sites/{id}/backups | List backups |
| POST | /api/sites/{id}/backups | Run backup |
| POST | /api/sites/{id}/backups/{bid}/restore | Restore backup |
| POST | /api/sites/{id}/cache/purge | Purge all caches |
| POST | /api/sites/{id}/wp/cli | Run WP-CLI command |
| POST | /api/sites/{id}/wp/update-all | Update WP + plugins |
| GET | /api/servers | List servers + stats |
| GET | /api/security/events | Security event log |
| POST | /api/security/block-ip | Block IP via UFW + fail2ban |

Full OpenAPI docs: `http://localhost:8080/docs`

---

## License

MIT
