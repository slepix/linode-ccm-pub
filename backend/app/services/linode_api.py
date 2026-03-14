import httpx
from typing import Any, Optional
from app.config import settings


class LinodeClient:
    def __init__(self, api_token: str):
        self.token = api_token
        self.base = settings.LINODE_API_BASE
        self.headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        }

    def _get_all_pages(self, path: str, params: Optional[dict] = None) -> list:
        results = []
        page = 1
        while True:
            p = {"page": page, "page_size": 500, **(params or {})}
            resp = httpx.get(f"{self.base}{path}", headers=self.headers, params=p, timeout=30)
            if resp.status_code == 404:
                return []
            resp.raise_for_status()
            data = resp.json()
            results.extend(data.get("data", []))
            if page >= data.get("pages", 1):
                break
            page += 1
        return results

    def _get(self, path: str) -> Any:
        resp = httpx.get(f"{self.base}{path}", headers=self.headers, timeout=30)
        if resp.status_code == 400:
            return {"_status": 400}
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()

    def get_linodes(self) -> list:
        return self._get_all_pages("/linode/instances")

    def get_linode_firewalls(self, linode_id: int) -> list:
        return self._get_all_pages(f"/linode/instances/{linode_id}/firewalls")

    def get_volumes(self) -> list:
        return self._get_all_pages("/volumes")

    def get_nodebalancers(self) -> list:
        return self._get_all_pages("/nodebalancers")

    def get_nodebalancer_configs(self, nb_id: int) -> list:
        return self._get_all_pages(f"/nodebalancers/{nb_id}/configs")

    def get_nodebalancer_config_nodes(self, nb_id: int, cfg_id: int) -> list:
        return self._get_all_pages(f"/nodebalancers/{nb_id}/configs/{cfg_id}/nodes")

    def get_lke_clusters(self) -> list:
        return self._get_all_pages("/lke/clusters")

    def get_lke_pools(self, cluster_id: int) -> list:
        return self._get_all_pages(f"/lke/clusters/{cluster_id}/pools")

    def get_lke_control_plane_acl(self, cluster_id: int) -> Any:
        return self._get(f"/lke/clusters/{cluster_id}/control_plane_acl")

    def get_object_storage_buckets(self) -> list:
        return self._get_all_pages("/object-storage/buckets")

    def get_bucket_access(self, region: str, label: str) -> Any:
        resp = httpx.get(
            f"{self.base}/object-storage/buckets/{region}/{label}/access",
            headers=self.headers, timeout=30
        )
        if resp.status_code in (404, 400):
            return None
        if resp.is_success:
            return resp.json()
        return None

    def get_databases(self) -> list:
        return self._get_all_pages("/databases/instances")

    _ALLOWED_DB_ENGINES = frozenset({"mysql", "postgresql"})

    def get_database_detail(self, engine: str, db_id: int) -> Any:
        if engine not in self._ALLOWED_DB_ENGINES:
            raise ValueError(f"Unsupported database engine: {engine!r}")
        if not isinstance(db_id, int) or db_id <= 0:
            raise ValueError(f"Invalid database id: {db_id!r}")
        return self._get(f"/databases/{engine}/instances/{db_id}")

    def get_firewalls(self) -> list:
        return self._get_all_pages("/networking/firewalls")

    def get_firewall_rules(self, fw_id: int) -> Any:
        return self._get(f"/networking/firewalls/{fw_id}/rules")

    def get_firewall_devices(self, fw_id: int) -> list:
        return self._get_all_pages(f"/networking/firewalls/{fw_id}/devices")

    def get_vpcs(self) -> list:
        return self._get_all_pages("/vpcs")

    def get_vpc_subnets(self, vpc_id: int) -> list:
        return self._get_all_pages(f"/vpcs/{vpc_id}/subnets")

    def get_events(self, page_size: int = 500) -> list:
        return self._get_all_pages("/account/events", {"page_size": page_size})

    def get_account_users(self) -> list:
        return self._get_all_pages("/account/users")

    def get_account_logins(self) -> list:
        return self._get_all_pages("/account/logins")

    def get_user_ssh_keys(self, username: str) -> list:
        return self._get_all_pages(f"/profile/sshkeys") if username == "me" else []

    def get_profile_ssh_keys(self) -> list:
        return self._get_all_pages("/profile/sshkeys")

    def get_account_ssh_keys(self) -> list:
        users = self.get_account_users()
        all_keys = []
        for u in users:
            keys = self._get_all_pages(f"/account/users/{u['username']}/grants")
            all_keys.append({"username": u["username"], "grants": keys})
        return all_keys

    def get_user_profile(self, username: str) -> Any:
        return self._get(f"/account/users/{username}")
