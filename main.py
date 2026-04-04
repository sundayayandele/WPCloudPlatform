"""
WPCloud Orchestrator — FastAPI Backend
Manages WordPress site provisioning, Docker containers, SSL, DNS, Backups
"""

import asyncio
import secrets
import string
from datetime import datetime
from typing import Optional, List

from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, validator
import uvicorn

from orchestrator import SiteOrchestrator
from models import (
    Site, SiteCreate, SiteStatus, ServerInfo, BackupJob,
    DNSRecord, SSLCertificate, StagingEnv, SecurityEvent
)
from database import Database

app = FastAPI(
    title="WPCloud Orchestrator API",
    description="Self-hosted WordPress hosting platform",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer(auto_error=False)
db = Database()
orchestrator = SiteOrchestrator(db)


# ─── Auth ──────────────────────────────────────────────────────────────────────

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials or credentials.credentials != db.get_api_token():
        raise HTTPException(status_code=401, detail="Invalid or missing API token")
    return credentials.credentials


# ─── Sites ─────────────────────────────────────────────────────────────────────

@app.get("/api/sites", response_model=List[Site])
async def list_sites(token=Depends(verify_token)):
    return db.list_sites()


@app.post("/api/sites", response_model=Site, status_code=202)
async def create_site(payload: SiteCreate, background_tasks: BackgroundTasks, token=Depends(verify_token)):
    """
    Kicks off full site provisioning pipeline:
    1. Create MariaDB database + user
    2. Pull & start WordPress PHP-FPM container
    3. Spin up Redis container
    4. Write Nginx reverse-proxy config with FastCGI cache
    5. Request Let's Encrypt certificate via Certbot
    6. Configure WP-CLI: install WordPress, set options
    7. Install performance plugins (Redis Object Cache, FastCGI Cache Purge)
    """
    if db.get_site_by_domain(payload.domain):
        raise HTTPException(status_code=409, detail=f"Site {payload.domain} already exists")

    site = db.create_site(payload)
    background_tasks.add_task(orchestrator.provision_site, site.id)
    return site


@app.get("/api/sites/{site_id}", response_model=Site)
async def get_site(site_id: str, token=Depends(verify_token)):
    site = db.get_site(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return site


@app.delete("/api/sites/{site_id}", status_code=204)
async def delete_site(site_id: str, background_tasks: BackgroundTasks, token=Depends(verify_token)):
    site = db.get_site(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    background_tasks.add_task(orchestrator.teardown_site, site_id)


@app.post("/api/sites/{site_id}/restart")
async def restart_site(site_id: str, token=Depends(verify_token)):
    await orchestrator.restart_containers(site_id)
    return {"message": "Containers restarted"}


@app.get("/api/sites/{site_id}/logs")
async def get_logs(site_id: str, lines: int = 100, token=Depends(verify_token)):
    return {"logs": await orchestrator.get_logs(site_id, lines)}


# ─── Staging ───────────────────────────────────────────────────────────────────

@app.post("/api/sites/{site_id}/staging", response_model=StagingEnv)
async def create_staging(site_id: str, background_tasks: BackgroundTasks, token=Depends(verify_token)):
    """Clone production to staging.domain.com with isolated DB + containers"""
    site = db.get_site(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    staging = db.create_staging(site_id)
    background_tasks.add_task(orchestrator.provision_staging, site_id, staging.id)
    return staging


@app.post("/api/sites/{site_id}/staging/{staging_id}/push")
async def push_staging_to_prod(site_id: str, staging_id: str, background_tasks: BackgroundTasks, token=Depends(verify_token)):
    """Sync staging → production (files + DB diff)"""
    background_tasks.add_task(orchestrator.promote_staging, site_id, staging_id)
    return {"message": "Staging promotion queued"}


# ─── Backups ───────────────────────────────────────────────────────────────────

@app.get("/api/sites/{site_id}/backups", response_model=List[BackupJob])
async def list_backups(site_id: str, token=Depends(verify_token)):
    return db.list_backups(site_id)


@app.post("/api/sites/{site_id}/backups", response_model=BackupJob)
async def trigger_backup(site_id: str, background_tasks: BackgroundTasks, token=Depends(verify_token)):
    job = db.create_backup_job(site_id)
    background_tasks.add_task(orchestrator.run_backup, site_id, job.id)
    return job


@app.post("/api/sites/{site_id}/backups/{backup_id}/restore")
async def restore_backup(site_id: str, backup_id: str, background_tasks: BackgroundTasks, token=Depends(verify_token)):
    background_tasks.add_task(orchestrator.restore_backup, site_id, backup_id)
    return {"message": "Restore job queued"}


# ─── SSL ───────────────────────────────────────────────────────────────────────

@app.get("/api/sites/{site_id}/ssl", response_model=SSLCertificate)
async def get_ssl(site_id: str, token=Depends(verify_token)):
    return db.get_ssl(site_id)


@app.post("/api/sites/{site_id}/ssl/renew")
async def renew_ssl(site_id: str, background_tasks: BackgroundTasks, token=Depends(verify_token)):
    background_tasks.add_task(orchestrator.renew_ssl, site_id)
    return {"message": "SSL renewal queued"}


# ─── DNS ───────────────────────────────────────────────────────────────────────

@app.get("/api/sites/{site_id}/dns", response_model=List[DNSRecord])
async def list_dns(site_id: str, token=Depends(verify_token)):
    return db.list_dns_records(site_id)


@app.post("/api/sites/{site_id}/dns", response_model=DNSRecord)
async def add_dns_record(site_id: str, record: DNSRecord, token=Depends(verify_token)):
    return await orchestrator.add_dns_record(site_id, record)


# ─── Servers ───────────────────────────────────────────────────────────────────

@app.get("/api/servers", response_model=List[ServerInfo])
async def list_servers(token=Depends(verify_token)):
    return await orchestrator.get_server_stats()


@app.post("/api/servers/{server_id}/connect")
async def connect_server(server_id: str, token=Depends(verify_token)):
    return await orchestrator.test_server_connection(server_id)


# ─── Security ──────────────────────────────────────────────────────────────────

@app.get("/api/security/events", response_model=List[SecurityEvent])
async def security_events(limit: int = 50, token=Depends(verify_token)):
    return db.list_security_events(limit)


@app.post("/api/security/block-ip")
async def block_ip(ip: str, token=Depends(verify_token)):
    await orchestrator.block_ip(ip)
    return {"message": f"IP {ip} blocked via fail2ban + ufw"}


# ─── WordPress Management ──────────────────────────────────────────────────────

@app.post("/api/sites/{site_id}/wp/cli")
async def wp_cli(site_id: str, command: str, token=Depends(verify_token)):
    """Run WP-CLI command inside site container"""
    result = await orchestrator.run_wp_cli(site_id, command)
    return {"output": result}


@app.post("/api/sites/{site_id}/wp/update-all")
async def update_all(site_id: str, background_tasks: BackgroundTasks, token=Depends(verify_token)):
    background_tasks.add_task(orchestrator.update_wordpress, site_id)
    return {"message": "WordPress update queued"}


@app.post("/api/sites/{site_id}/cache/purge")
async def purge_cache(site_id: str, token=Depends(verify_token)):
    await orchestrator.purge_nginx_cache(site_id)
    await orchestrator.purge_redis_cache(site_id)
    return {"message": "All caches purged"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=False)
