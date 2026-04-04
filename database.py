import os
import json
import secrets
from typing import Dict, List, Optional
from datetime import datetime
from models import Site, SiteStatus


class Database:
    def __init__(self, data_file: str = "wpcloud.db.json"):
        self.data_file = data_file
        self.data = self._load_data()
        if "api_token" not in self.data:
            self.data["api_token"] = secrets.token_hex(32)
            self._save_data()
        if "sites" not in self.data:
            self.data["sites"] = {}
            self._save_data()

    def _load_data(self) -> Dict:
        if os.path.exists(self.data_file):
            with open(self.data_file, "r") as f:
                return json.load(f)
        return {}

    def _save_data(self):
        with open(self.data_file, "w") as f:
            json.dump(self.data, f, indent=2, default=str)

    def get_api_token(self) -> str:
        return self.data["api_token"]

    def get_sites(self) -> List[Dict]:
        return list(self.data["sites"].values())

    def get_site(self, site_id: str) -> Optional[Dict]:
        return self.data["sites"].get(site_id)

    def create_site(self, site: Site) -> str:
        site_dict = site.dict()
        site_dict["status"] = site.status.dict()
        self.data["sites"][site.id] = site_dict
        self._save_data()
        return site.id

    def update_site_status(self, site_id: str, status: str, message: Optional[str] = None):
        if site_id in self.data["sites"]:
            self.data["sites"][site_id]["status"] = {
                "status": status,
                "message": message,
                "last_updated": datetime.utcnow().isoformat()
            }
            self._save_data()

    def delete_site(self, site_id: str):
        if site_id in self.data["sites"]:
            del self.data["sites"][site_id]
            self._save_data()

    # Add other methods as needed for backups, etc.
    def get_backups(self, site_id: str) -> List[Dict]:
        # Placeholder
        return []

    def get_security_events(self) -> List[Dict]:
        # Placeholder
        return []