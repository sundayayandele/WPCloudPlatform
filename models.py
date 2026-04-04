from pydantic import BaseModel, validator
from typing import Optional, List
from datetime import datetime


class SiteCreate(BaseModel):
    domain: str
    php_version: str = "8.3"
    admin_email: str
    redis: bool = True
    auto_ssl: bool = True
    staging: bool = False

    @validator('domain')
    def validate_domain(cls, v):
        if not v or '.' not in v:
            raise ValueError('Invalid domain')
        return v


class SiteStatus(BaseModel):
    status: str  # provisioning, active, error
    message: Optional[str] = None
    last_updated: datetime = datetime.utcnow()


class Site(BaseModel):
    id: str
    domain: str
    php_version: str
    admin_email: str
    redis: bool
    auto_ssl: bool
    staging: bool
    status: SiteStatus
    created_at: datetime = datetime.utcnow()
    db_name: Optional[str] = None
    db_user: Optional[str] = None


class ServerInfo(BaseModel):
    hostname: str
    ip_address: str
    uptime: str
    disk_usage: str
    memory_usage: str
    cpu_usage: str


class BackupJob(BaseModel):
    id: str
    site_id: str
    status: str  # running, completed, failed
    created_at: datetime
    size_bytes: Optional[int] = None


class DNSRecord(BaseModel):
    type: str  # A, CNAME, etc.
    name: str
    value: str
    ttl: int = 3600


class SSLCertificate(BaseModel):
    domain: str
    issuer: str
    valid_from: datetime
    valid_until: datetime
    auto_renew: bool = True


class StagingEnv(BaseModel):
    id: str
    site_id: str
    domain: str
    created_at: datetime
    status: str


class SecurityEvent(BaseModel):
    id: str
    type: str  # e.g., "failed_login", "blocked_ip"
    message: str
    timestamp: datetime
    ip_address: Optional[str] = None