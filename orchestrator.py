"""
SiteOrchestrator: The engine that provisions and manages WordPress sites.
Each site gets fully isolated Docker containers: PHP-FPM, MariaDB, Redis.
Nginx acts as the global reverse proxy with per-site FastCGI cache zones.
"""

import asyncio
import os
import secrets
import string
import subprocess
import textwrap
from pathlib import Path
from typing import Optional

import aiodocker
import aiofiles
from jinja2 import Environment, FileSystemLoader

from database import Database

SITES_ROOT = Path(os.environ.get("SITES_ROOT", "/opt/wpcloud/sites"))
TEMPLATES_DIR = Path(__file__).parent.parent / "templates"
NGINX_SITES_DIR = Path("/etc/nginx/sites-enabled")
CERTBOT_WEBROOT = Path("/var/www/letsencrypt")
BORG_REPO = os.environ.get("BORG_REPO", "/opt/wpcloud/backups")

jinja = Environment(loader=FileSystemLoader(str(TEMPLATES_DIR)), autoescape=False)


def random_password(length: int = 32) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


class SiteOrchestrator:
    def __init__(self, db: Database):
        self.db = db

    # ─── Main Provisioning Pipeline ──────────────────────────────────────────

    async def provision_site(self, site_id: str):
        site = self.db.get_site(site_id)
        domain = site["domain"]
        site_dir = SITES_ROOT / domain

        self.db.update_site_status(site_id, "provisioning", "Creating directory structure")

        try:
            # 1. Filesystem layout
            await self._create_site_dirs(site_dir)

            # 2. Generate credentials
            db_name = f"wp_{domain.replace('.', '_').replace('-', '_')}"
            db_user = f"u_{secrets.token_hex(6)}"
            db_pass = random_password()
            wp_secret_key = random_password(64)

            self.db.update_site_status(site_id, "provisioning", "Provisioning database")

            # 3. MariaDB: create database + user
            await self._create_mariadb_database(db_name, db_user, db_pass)

            # 4. Write docker-compose for this site
            self.db.update_site_status(site_id, "provisioning", "Starting containers")
            await self._write_docker_compose(site_dir, domain, site_id, db_name, db_user, db_pass, site.get("php_version", "8.3"), wp_secret_key)
            await self._docker_compose_up(site_dir)

            # 5. Wait for containers to be healthy
            await asyncio.sleep(8)

            # 6. Nginx reverse proxy config with FastCGI cache
            self.db.update_site_status(site_id, "provisioning", "Configuring Nginx")
            await self._write_nginx_config(domain, site_id)
            await self._reload_nginx()

            # 7. Let's Encrypt SSL
            self.db.update_site_status(site_id, "provisioning", "Requesting SSL certificate")
            await self._request_ssl(domain)

            # 8. WP-CLI: install WordPress
            self.db.update_site_status(site_id, "provisioning", "Installing WordPress")
            await self._install_wordpress(site_id, domain, site.get("admin_email", "admin@" + domain))

            # 9. Install & configure performance plugins
            self.db.update_site_status(site_id, "provisioning", "Installing plugins")
            await self._configure_redis_object_cache(site_id)
            await self._configure_fastcgi_cache(site_id, domain)

            # 10. Schedule BorgBackup cron
            await self._setup_backup_schedule(site_id, domain)

            self.db.update_site_status(site_id, "active", "Site is live")
            self.db.set_site_ssl(site_id, domain)

        except Exception as exc:
            self.db.update_site_status(site_id, "error", str(exc))
            raise

    # ─── Filesystem ──────────────────────────────────────────────────────────

    async def _create_site_dirs(self, site_dir: Path):
        for sub in ["wordpress", "nginx/cache", "nginx/logs", "logs", "backups"]:
            (site_dir / sub).mkdir(parents=True, exist_ok=True)
        CERTBOT_WEBROOT.mkdir(parents=True, exist_ok=True)

    # ─── Docker ──────────────────────────────────────────────────────────────

    async def _write_docker_compose(self, site_dir, domain, site_id, db_name, db_user, db_pass, php_version, wp_secret_key):
        template = jinja.get_template("docker-compose.yml.j2")
        content = template.render(
            domain=domain,
            site_id=site_id,
            db_name=db_name,
            db_user=db_user,
            db_pass=db_pass,
            db_root_pass=random_password(),
            php_version=php_version,
            wp_secret_key=wp_secret_key,
            redis_pass=random_password(24),
            site_dir=str(site_dir),
        )
        async with aiofiles.open(site_dir / "docker-compose.yml", "w") as f:
            await f.write(content)

    async def _docker_compose_up(self, site_dir: Path):
        proc = await asyncio.create_subprocess_exec(
            "docker", "compose", "-f", str(site_dir / "docker-compose.yml"), "up", "-d",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"docker compose up failed: {stderr.decode()}")

    async def _create_mariadb_database(self, db_name: str, db_user: str, db_pass: str):
        """Run SQL inside the shared MariaDB container (wpcloud-mariadb)"""
        sql = textwrap.dedent(f"""
            CREATE DATABASE IF NOT EXISTS `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
            CREATE USER IF NOT EXISTS '{db_user}'@'%' IDENTIFIED BY '{db_pass}';
            GRANT ALL PRIVILEGES ON `{db_name}`.* TO '{db_user}'@'%';
            FLUSH PRIVILEGES;
        """)
        proc = await asyncio.create_subprocess_exec(
            "docker", "exec", "wpcloud-mariadb",
            "mysql", "-uroot", f"-p{os.environ['MARIADB_ROOT_PASS']}",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate(input=sql.encode())
        if proc.returncode != 0:
            raise RuntimeError(f"MariaDB setup failed: {stderr.decode()}")

    # ─── Nginx ───────────────────────────────────────────────────────────────

    async def _write_nginx_config(self, domain: str, site_id: str):
        template = jinja.get_template("nginx-site.conf.j2")
        content = template.render(domain=domain, site_id=site_id)
        dest = NGINX_SITES_DIR / f"{domain}.conf"
        async with aiofiles.open(dest, "w") as f:
            await f.write(content)

    async def _reload_nginx(self):
        proc = await asyncio.create_subprocess_exec("nginx", "-s", "reload")
        await proc.communicate()

    async def purge_nginx_cache(self, site_id: str):
        site = self.db.get_site(site_id)
        cache_dir = SITES_ROOT / site["domain"] / "nginx" / "cache"
        proc = await asyncio.create_subprocess_exec("rm", "-rf", str(cache_dir))
        await proc.communicate()
        (cache_dir).mkdir(parents=True, exist_ok=True)

    # ─── SSL ─────────────────────────────────────────────────────────────────

    async def _request_ssl(self, domain: str):
        email = os.environ.get("LETSENCRYPT_EMAIL", f"admin@{domain}")
        proc = await asyncio.create_subprocess_exec(
            "certbot", "certonly",
            "--webroot", "-w", str(CERTBOT_WEBROOT),
            "-d", domain, "-d", f"www.{domain}",
            "--email", email,
            "--agree-tos", "--non-interactive",
            "--expand",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"Certbot failed: {stderr.decode()}")

    async def renew_ssl(self, site_id: str):
        proc = await asyncio.create_subprocess_exec(
            "certbot", "renew", "--quiet",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
        await self._reload_nginx()

    # ─── WordPress ───────────────────────────────────────────────────────────

    async def _install_wordpress(self, site_id: str, domain: str, admin_email: str):
        site = self.db.get_site(site_id)
        container = f"wp_{site_id}_phpfpm"
        admin_pass = random_password(20)
        self.db.set_wp_admin(site_id, "admin", admin_pass, admin_email)

        cmds = [
            f"wp core download --path=/var/www/html --locale=en_US",
            f"wp core install --url=https://{domain} --title='{domain}' "
            f"--admin_user=admin --admin_password='{admin_pass}' --admin_email='{admin_email}' --skip-email",
            f"wp option update permalink_structure '/%postname%/'",
            f"wp rewrite flush",
        ]
        for cmd in cmds:
            await self._exec_in_container(container, cmd, as_www_data=True)

    async def _configure_redis_object_cache(self, site_id: str):
        container = f"wp_{site_id}_phpfpm"
        cmds = [
            "wp plugin install redis-cache --activate",
            "wp redis enable",
        ]
        for cmd in cmds:
            await self._exec_in_container(container, cmd, as_www_data=True)

    async def _configure_fastcgi_cache(self, site_id: str, domain: str):
        container = f"wp_{site_id}_phpfpm"
        cmds = [
            "wp plugin install nginx-cache --activate",
            f"wp option update nginx_cache_path '/var/cache/nginx/{domain}'",
        ]
        for cmd in cmds:
            await self._exec_in_container(container, cmd, as_www_data=True)

    async def run_wp_cli(self, site_id: str, command: str) -> str:
        site = self.db.get_site(site_id)
        container = f"wp_{site_id}_phpfpm"
        return await self._exec_in_container(container, command, as_www_data=True)

    async def update_wordpress(self, site_id: str):
        container = f"wp_{site_id}_phpfpm"
        for cmd in ["wp core update", "wp plugin update --all", "wp theme update --all"]:
            await self._exec_in_container(container, cmd, as_www_data=True)

    async def purge_redis_cache(self, site_id: str):
        container = f"wp_{site_id}_redis"
        await self._exec_in_container(container, "redis-cli FLUSHALL")

    # ─── Backups (BorgBackup) ────────────────────────────────────────────────

    async def _setup_backup_schedule(self, site_id: str, domain: str):
        """Add a daily cron job for BorgBackup"""
        cron_line = f"0 3 * * * root /opt/wpcloud/scripts/backup.sh {domain} {site_id} >> /var/log/wpcloud/backup-{site_id}.log 2>&1"
        cron_file = Path(f"/etc/cron.d/wpcloud-{site_id}")
        async with aiofiles.open(cron_file, "w") as f:
            await f.write(cron_line + "\n")

    async def run_backup(self, site_id: str, job_id: str):
        site = self.db.get_site(site_id)
        domain = site["domain"]
        self.db.update_backup_job(job_id, "running")
        try:
            proc = await asyncio.create_subprocess_exec(
                "/opt/wpcloud/scripts/backup.sh", domain, site_id,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()
            if proc.returncode == 0:
                self.db.update_backup_job(job_id, "success", stdout.decode())
            else:
                self.db.update_backup_job(job_id, "failed", stderr.decode())
        except Exception as e:
            self.db.update_backup_job(job_id, "failed", str(e))

    async def restore_backup(self, site_id: str, backup_id: str):
        site = self.db.get_site(site_id)
        backup = self.db.get_backup(backup_id)
        proc = await asyncio.create_subprocess_exec(
            "/opt/wpcloud/scripts/restore.sh", site["domain"], backup["archive_name"],
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()

    # ─── Staging ─────────────────────────────────────────────────────────────

    async def provision_staging(self, site_id: str, staging_id: str):
        """Clone production to staging.domain with isolated containers"""
        site = self.db.get_site(site_id)
        staging_domain = f"staging.{site['domain']}"
        staging_site_id = staging_id

        # Use backup/restore pipeline to clone DB + files
        await self.run_backup(site_id, f"pre-staging-{staging_id}")
        # Then provision a new site pointing to the staging domain with restored data
        await self.provision_site(staging_site_id)
        self.db.update_staging_status(staging_id, "active")

    async def promote_staging(self, site_id: str, staging_id: str):
        """Push staging DB + files to production"""
        proc = await asyncio.create_subprocess_exec(
            "/opt/wpcloud/scripts/promote-staging.sh", site_id, staging_id,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()

    # ─── Security ────────────────────────────────────────────────────────────

    async def block_ip(self, ip: str):
        # UFW block
        await asyncio.create_subprocess_exec("ufw", "deny", "from", ip, "to", "any")
        # fail2ban ban
        await asyncio.create_subprocess_exec("fail2ban-client", "set", "sshd", "banip", ip)

    # ─── DNS (Cloudflare example) ─────────────────────────────────────────────

    async def add_dns_record(self, site_id: str, record):
        """Delegate to Cloudflare/Route53/etc via environment-configured provider"""
        import httpx
        cf_token = os.environ.get("CLOUDFLARE_API_TOKEN")
        cf_zone = os.environ.get("CLOUDFLARE_ZONE_ID")
        if not cf_token or not cf_zone:
            return record
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"https://api.cloudflare.com/client/v4/zones/{cf_zone}/dns_records",
                headers={"Authorization": f"Bearer {cf_token}"},
                json={"type": record.type, "name": record.name, "content": record.value, "ttl": 1, "proxied": True},
            )
            r.raise_for_status()
        return record

    # ─── Server Stats ─────────────────────────────────────────────────────────

    async def get_server_stats(self):
        return self.db.list_servers()

    async def test_server_connection(self, server_id: str):
        server = self.db.get_server(server_id)
        proc = await asyncio.create_subprocess_exec(
            "ssh", "-o", "ConnectTimeout=5", "-o", "BatchMode=yes",
            f"{server['user']}@{server['host']}", "echo ok",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        return {"connected": proc.returncode == 0}

    async def restart_containers(self, site_id: str):
        site = self.db.get_site(site_id)
        site_dir = SITES_ROOT / site["domain"]
        proc = await asyncio.create_subprocess_exec(
            "docker", "compose", "-f", str(site_dir / "docker-compose.yml"), "restart"
        )
        await proc.communicate()

    async def get_logs(self, site_id: str, lines: int = 100) -> str:
        site = self.db.get_site(site_id)
        site_dir = SITES_ROOT / site["domain"]
        proc = await asyncio.create_subprocess_exec(
            "docker", "compose", "-f", str(site_dir / "docker-compose.yml"),
            "logs", "--tail", str(lines),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        stdout, _ = await proc.communicate()
        return stdout.decode()

    # ─── Helpers ──────────────────────────────────────────────────────────────

    async def teardown_site(self, site_id: str):
        site = self.db.get_site(site_id)
        domain = site["domain"]
        site_dir = SITES_ROOT / domain

        proc = await asyncio.create_subprocess_exec(
            "docker", "compose", "-f", str(site_dir / "docker-compose.yml"),
            "down", "-v",
        )
        await proc.communicate()

        nginx_conf = NGINX_SITES_DIR / f"{domain}.conf"
        if nginx_conf.exists():
            nginx_conf.unlink()
        await self._reload_nginx()

        self.db.delete_site(site_id)

    async def _exec_in_container(self, container: str, command: str, as_www_data: bool = False) -> str:
        cmd = ["docker", "exec"]
        if as_www_data:
            cmd += ["-u", "www-data"]
        cmd.append(container)
        cmd += ["bash", "-c", f"cd /var/www/html && {command}"]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        return stdout.decode()
