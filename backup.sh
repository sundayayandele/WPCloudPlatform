#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# WPCloud BorgBackup Script
# Backs up: WordPress files + MariaDB database dump
# Prunes: Keeps 7 daily, 4 weekly, 6 monthly
#
# Usage: ./backup.sh <domain> <site_id>
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

DOMAIN="${1:?Usage: backup.sh <domain> <site_id>}"
SITE_ID="${2:?Usage: backup.sh <domain> <site_id>}"

SITES_ROOT="${SITES_ROOT:-/opt/wpcloud/sites}"
BORG_REPO="${BORG_REPO:-/opt/wpcloud/backups/${DOMAIN}}"
BORG_PASSPHRASE="${BORG_PASSPHRASE:?BORG_PASSPHRASE env var must be set}"
MARIADB_ROOT_PASS="${MARIADB_ROOT_PASS:?MARIADB_ROOT_PASS env var must be set}"

SITE_DIR="${SITES_ROOT}/${DOMAIN}"
TIMESTAMP=$(date +%Y-%m-%dT%H:%M)
ARCHIVE_NAME="${DOMAIN}-${TIMESTAMP}"
TMPDIR=$(mktemp -d)

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
cleanup() { rm -rf "$TMPDIR"; }
trap cleanup EXIT

export BORG_PASSPHRASE

# ─── 1. Init repo if needed ──────────────────────────────────────────────────
if [[ ! -d "${BORG_REPO}" ]]; then
    log "Initialising Borg repository at ${BORG_REPO}"
    borg init --encryption=repokey "${BORG_REPO}"
fi

# ─── 2. Dump MariaDB ─────────────────────────────────────────────────────────
log "Dumping MariaDB database for ${DOMAIN}"
DB_NAME="wp_$(echo "${DOMAIN}" | tr '.-' '_')"
docker exec wpcloud-mariadb \
    mysqldump \
    -uroot -p"${MARIADB_ROOT_PASS}" \
    --single-transaction \
    --quick \
    --lock-tables=false \
    "${DB_NAME}" \
    > "${TMPDIR}/database.sql"

log "Database dump: $(du -sh "${TMPDIR}/database.sql" | cut -f1)"

# ─── 3. Create Borg archive ──────────────────────────────────────────────────
log "Creating Borg archive: ${ARCHIVE_NAME}"
borg create \
    --stats \
    --compression zstd,3 \
    --exclude-caches \
    --exclude "${SITE_DIR}/nginx/cache" \
    "${BORG_REPO}::${ARCHIVE_NAME}" \
    "${SITE_DIR}/wordpress" \
    "${TMPDIR}/database.sql"

# ─── 4. Prune old archives ───────────────────────────────────────────────────
log "Pruning old archives"
borg prune \
    --list \
    --keep-daily=7 \
    --keep-weekly=4 \
    --keep-monthly=6 \
    "${BORG_REPO}"

# ─── 5. Verify integrity ────────────────────────────────────────────────────
borg check --last 1 "${BORG_REPO}"

log "Backup complete: ${ARCHIVE_NAME}"
echo "BACKUP_ARCHIVE=${ARCHIVE_NAME}"
