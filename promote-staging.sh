#!/usr/bin/env bash
# WPCloud — Promote Staging to Production
# Syncs: files (rsync) + database (mysqldump → import) → production site
# A production backup is taken BEFORE the promotion for safety.

set -euo pipefail

SITE_ID="${1:?site_id required}"
STAGING_ID="${2:?staging_id required}"
SITES_ROOT="${SITES_ROOT:-/opt/wpcloud/sites}"

log() { echo "[$(date '+%H:%M:%S')] $*"; }
error() { echo "[ERROR] $*" >&2; exit 1; }

# ─── Load site config ────────────────────────────────────────────────────────
PROD_DOMAIN=$(jq -r ".domain" "${SITES_ROOT}/.meta/${SITE_ID}.json")
STAGING_DOMAIN="staging.${PROD_DOMAIN}"
PROD_DIR="${SITES_ROOT}/${PROD_DOMAIN}"
STAGING_DIR="${SITES_ROOT}/${STAGING_DOMAIN}"

[[ -d "$STAGING_DIR" ]] || error "Staging dir not found: ${STAGING_DIR}"

log "Promoting staging.${PROD_DOMAIN} → ${PROD_DOMAIN}"

# ─── 1. Pre-promotion backup ─────────────────────────────────────────────────
log "Taking pre-promotion backup of production..."
/opt/wpcloud/scripts/backup.sh "${PROD_DOMAIN}" "${SITE_ID}" || error "Pre-promotion backup failed"

# ─── 2. Put production in maintenance mode ───────────────────────────────────
log "Enabling maintenance mode on production..."
docker exec -u www-data "wp_${SITE_ID}_phpfpm" bash -c \
    "cd /var/www/html && wp maintenance-mode activate --quiet"

# ─── 3. Sync files (uploads, themes, plugins) ────────────────────────────────
log "Syncing WordPress files from staging → production..."
rsync -az --delete \
    --exclude 'wp-config.php' \
    --exclude '.htaccess' \
    "${STAGING_DIR}/wordpress/" \
    "${PROD_DIR}/wordpress/"

# ─── 4. Sync database ────────────────────────────────────────────────────────
log "Exporting staging database..."
STAGING_DB="wp_$(echo "${STAGING_DOMAIN}" | tr '.-' '_')"
PROD_DB="wp_$(echo "${PROD_DOMAIN}" | tr '.-' '_')"
TMPFILE=$(mktemp /tmp/staging-db-XXXXXX.sql)

docker exec wpcloud-mariadb \
    mysqldump -uroot -p"${MARIADB_ROOT_PASS}" \
    --single-transaction --quick "${STAGING_DB}" > "$TMPFILE"

# Search-replace staging domain → production domain in SQL
sed -i "s|${STAGING_DOMAIN}|${PROD_DOMAIN}|g" "$TMPFILE"
sed -i "s|https://staging\\.${PROD_DOMAIN}|https://${PROD_DOMAIN}|g" "$TMPFILE"

log "Importing database into production..."
docker exec -i wpcloud-mariadb \
    mysql -uroot -p"${MARIADB_ROOT_PASS}" "${PROD_DB}" < "$TMPFILE"
rm -f "$TMPFILE"

# ─── 5. Run WP search-replace ────────────────────────────────────────────────
log "Running WP-CLI search-replace for URLs..."
docker exec -u www-data "wp_${SITE_ID}_phpfpm" bash -c \
    "cd /var/www/html && wp search-replace 'staging.${PROD_DOMAIN}' '${PROD_DOMAIN}' --all-tables --precise --quiet"

# ─── 6. Flush caches ─────────────────────────────────────────────────────────
log "Flushing all caches..."
docker exec -u www-data "wp_${SITE_ID}_phpfpm" bash -c \
    "cd /var/www/html && wp cache flush"
docker exec "wp_${SITE_ID}_redis" redis-cli -a "${REDIS_PASS}" FLUSHALL 2>/dev/null || true
rm -rf "${PROD_DIR}/nginx/cache/"* 2>/dev/null || true

# ─── 7. Disable maintenance mode ─────────────────────────────────────────────
log "Disabling maintenance mode..."
docker exec -u www-data "wp_${SITE_ID}_phpfpm" bash -c \
    "cd /var/www/html && wp maintenance-mode deactivate --quiet"

log "✔ Promotion complete. ${STAGING_DOMAIN} → ${PROD_DOMAIN} done."
