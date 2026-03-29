import json
from datetime import datetime, timezone
from typing import Any
from psycopg2.extras import execute_values
from app.services.linode_api import LinodeClient


def _diff(old_specs: dict, new_specs: dict) -> dict:
    if not old_specs:
        return {}
    diff = {}
    all_keys = set(old_specs.keys()) | set(new_specs.keys())
    for k in all_keys:
        ov = old_specs.get(k)
        nv = new_specs.get(k)
        if ov != nv:
            diff[k] = {"from": ov, "to": nv}
    return diff


class _SyncWriter:
    """Holds cursor, account_id, now and accumulates state needed across phases."""

    def __init__(self, cur, account_id: str, now: datetime, log: list):
        self.cur = cur
        self.account_id = account_id
        self.now = now
        self.log = log
        self.resource_count = 0
        self.synced_resource_ids: set[str] = set()
        self.linode_db_ids: dict[int, str] = {}
        self.vpc_db_ids: dict[int, str] = {}

    def logmsg(self, msg: str):
        self.log.append(f"[{self.account_id[:8]}] {msg}")

    # ------------------------------------------------------------------
    # Core upsert helpers
    # ------------------------------------------------------------------

    def _fetch_existing(self, resource_ids: list[tuple]) -> dict[tuple, tuple]:
        """Return map of (resource_id, resource_type) -> (db_id, old_specs) for a batch."""
        if not resource_ids:
            return {}
        self.cur.execute("""
            SELECT id, resource_id, resource_type, specs
            FROM resources
            WHERE account_id = %s AND (resource_id, resource_type) IN %s
        """, (self.account_id, tuple(resource_ids)))
        return {(r["resource_id"], r["resource_type"]): (str(r["id"]), r["specs"] or {})
                for r in self.cur.fetchall()}

    def bulk_upsert_resources(self, rows: list[dict]) -> dict[tuple, str]:
        """
        Upsert a list of resource dicts and return map of
        (resource_id, resource_type) -> db_uuid.

        Each dict must have keys:
          resource_id, resource_type, label, region, status,
          specs, plan_type, resource_created_at
        """
        if not rows:
            return {}

        key_pairs = [(r["resource_id"], r["resource_type"]) for r in rows]
        existing = self._fetch_existing(key_pairs)

        to_insert: list[tuple] = []
        to_update: list[tuple] = []
        snapshots: list[tuple] = []
        id_map: dict[tuple, str] = {}

        for r in rows:
            key = (r["resource_id"], r["resource_type"])
            specs_json = json.dumps(r["specs"])
            if key in existing:
                db_id, old_specs = existing[key]
                id_map[key] = db_id
                diff = _diff(old_specs, r["specs"])
                to_update.append((
                    r["label"], r["region"], r["status"], specs_json,
                    r["plan_type"], r["resource_created_at"], self.now, db_id,
                ))
                if diff:
                    snapshots.append((
                        db_id, self.account_id, r["resource_type"],
                        r["label"], r["region"], r["plan_type"],
                        r["status"], specs_json, json.dumps(diff), self.now,
                    ))
            else:
                to_insert.append((
                    self.account_id, r["resource_id"], r["resource_type"],
                    r["label"], r["region"], r["status"], specs_json,
                    r["plan_type"], r["resource_created_at"], self.now,
                ))

        if to_update:
            self.cur.executemany("""
                UPDATE resources SET label=%s, region=%s, status=%s, specs=%s,
                    plan_type=%s, resource_created_at=%s,
                    last_synced_at=%s, updated_at=NOW()
                WHERE id=%s
            """, to_update)

        if to_insert:
            inserted = execute_values(self.cur, """
                INSERT INTO resources
                (account_id, resource_id, resource_type, label, region, status, specs,
                 plan_type, resource_created_at, last_synced_at)
                VALUES %s
                RETURNING id, resource_id, resource_type
            """, to_insert, fetch=True)
            for row in inserted:
                key = (row["resource_id"], row["resource_type"])
                db_id = str(row["id"])
                id_map[key] = db_id
                specs_row = next(
                    r for r in rows
                    if r["resource_id"] == row["resource_id"]
                    and r["resource_type"] == row["resource_type"]
                )
                snapshots.append((
                    db_id, self.account_id, specs_row["resource_type"],
                    specs_row["label"], specs_row["region"], specs_row["plan_type"],
                    specs_row["status"], json.dumps(specs_row["specs"]), None, self.now,
                ))

        if snapshots:
            execute_values(self.cur, """
                INSERT INTO resource_snapshots
                (resource_id, account_id, resource_type, label, region, plan_type,
                 status, specs, diff, synced_at)
                VALUES %s
            """, snapshots)

        self.resource_count += len(rows)
        db_ids = list(id_map.values())
        self.synced_resource_ids.update(db_ids)
        return id_map

    # ------------------------------------------------------------------
    # Per-resource-type write methods
    # ------------------------------------------------------------------

    def write_firewalls(self, firewalls_raw: list, fw_rules_map: dict, fw_entities_map: dict) -> dict[int, str]:
        rows = []
        for fw in firewalls_raw:
            rules = fw_rules_map.get(fw["id"], {})
            entities = fw_entities_map.get(fw["id"], [])
            inbound_rules = rules.get("inbound") or []
            outbound_rules = rules.get("outbound") or []
            rows.append({
                "resource_id": str(fw["id"]),
                "resource_type": "firewall",
                "label": fw["label"],
                "region": None,
                "status": fw.get("status"),
                "specs": {
                    "inbound_policy": rules.get("inbound_policy", "DROP"),
                    "outbound_policy": rules.get("outbound_policy", "ACCEPT"),
                    "inbound_rules": len(inbound_rules),
                    "outbound_rules": len(outbound_rules),
                    "inbound_rules_detail": inbound_rules,
                    "outbound_rules_detail": outbound_rules,
                    "entity_count": len(entities),
                    "entities": entities,
                    "tags": fw.get("tags", []),
                },
                "plan_type": None,
                "resource_created_at": fw.get("created"),
            })
        id_map = self.bulk_upsert_resources(rows)
        return {int(k[0]): v for k, v in id_map.items()}

    def write_linodes(self, linodes_raw: list, linode_fw_map: dict, linode_vpc_map: dict) -> dict[int, str]:
        rows = []
        for ln in linodes_raw:
            attached_fw = linode_fw_map.get(ln["id"], [])
            rows.append({
                "resource_id": str(ln["id"]),
                "resource_type": "linode",
                "label": ln["label"],
                "region": ln.get("region"),
                "status": ln.get("status"),
                "specs": {
                    "vcpus": ln.get("specs", {}).get("vcpus"),
                    "memory": ln.get("specs", {}).get("memory"),
                    "disk": ln.get("specs", {}).get("disk"),
                    "transfer": ln.get("specs", {}).get("transfer"),
                    "gpus": ln.get("specs", {}).get("gpus", 0),
                    "tags": ln.get("tags", []),
                    "attached_firewalls": attached_fw,
                    "backups_enabled": ln.get("backups", {}).get("enabled", False),
                    "backups_available": ln.get("backups", {}).get("available", False),
                    "backups_last_successful": ln.get("backups", {}).get("last_successful"),
                    "disk_encryption": ln.get("disk_encryption"),
                    "locks": ln.get("locked_for", []),
                    "status": ln.get("status"),
                    "vpc_ids": linode_vpc_map.get(ln["id"], []),
                    "instance_type": ln.get("type"),
                    "created_at": ln.get("created"),
                    "watchdog_enabled": ln.get("watchdog_enabled", False),
                    "alerts": ln.get("alerts", {}),
                    "ipv4": ln.get("ipv4", []),
                    "ipv6": ln.get("ipv6"),
                },
                "plan_type": ln.get("type"),
                "resource_created_at": ln.get("created"),
            })
        id_map = self.bulk_upsert_resources(rows)
        result = {int(k[0]): v for k, v in id_map.items()}
        self.linode_db_ids.update(result)
        return result

    def write_volumes(self, volumes_raw: list) -> dict:
        rows = []
        for v in volumes_raw:
            rows.append({
                "resource_id": str(v["id"]),
                "resource_type": "volume",
                "label": v["label"],
                "region": v.get("region"),
                "status": v.get("status"),
                "specs": {
                    "size": v.get("size"),
                    "tags": v.get("tags", []),
                    "linode_id": v.get("linode_id"),
                    "linode_label": v.get("linode_label"),
                    "filesystem_path": v.get("filesystem_path"),
                    "encryption": v.get("encryption"),
                },
                "plan_type": None,
                "resource_created_at": v.get("created"),
            })
        return self.bulk_upsert_resources(rows)

    def write_nodebalancers(self, nbs_raw: list, nb_details: dict) -> dict:
        rows = []
        for nb in nbs_raw:
            details = nb_details.get(nb["id"], {})
            configs = details.get("configs", [])
            all_nodes = details.get("nodes", [])
            rows.append({
                "resource_id": str(nb["id"]),
                "resource_type": "nodebalancer",
                "label": nb["label"],
                "region": nb.get("region"),
                "status": None,
                "specs": {
                    "ipv4": nb.get("ipv4"),
                    "tags": nb.get("tags", []),
                    "node_count": len(all_nodes),
                    "nodes": all_nodes,
                    "configs": [{"id": c["id"], "port": c["port"],
                                 "protocol": c.get("protocol"),
                                 "algorithm": c.get("algorithm"),
                                 "client_conn_throttle": c.get("client_conn_throttle", 0)}
                                for c in configs],
                    "vpcs": [],
                },
                "plan_type": None,
                "resource_created_at": nb.get("created"),
            })
        return self.bulk_upsert_resources(rows)

    def write_lke_clusters(self, lke_raw: list, lke_pools_map: dict) -> dict:
        rows = []
        for cl in lke_raw:
            pools = lke_pools_map.get(cl["id"], [])
            node_count = sum(p.get("count", 0) for p in pools)
            rows.append({
                "resource_id": str(cl["id"]),
                "resource_type": "lke_cluster",
                "label": cl["label"],
                "region": cl.get("region"),
                "status": cl.get("status"),
                "specs": {
                    "k8s_version": cl.get("k8s_version"),
                    "node_count": node_count,
                    "pool_count": len(pools),
                    "high_availability": cl.get("control_plane", {}).get("high_availability", False),
                    "audit_logs_enabled": cl.get("control_plane", {}).get("acl") is not None,
                    "vpc_id": cl.get("vpc_id"),
                    "subnet_id": cl.get("subnet_id"),
                    "tags": cl.get("tags", []),
                    "pools": [{"id": p["id"], "type": p.get("type"),
                               "count": p.get("count"), "autoscaler": p.get("autoscaler")}
                              for p in pools],
                },
                "plan_type": None,
                "resource_created_at": cl.get("created"),
            })
        return self.bulk_upsert_resources(rows)

    def write_object_storage(self, buckets_raw: list, bucket_access_map: dict) -> dict:
        rows = []
        for b in buckets_raw:
            bucket_key = f"{b.get('region', b.get('cluster', ''))}/{b['label']}"
            access = bucket_access_map.get(bucket_key)
            rows.append({
                "resource_id": bucket_key,
                "resource_type": "object_storage",
                "label": b["label"],
                "region": b.get("region", b.get("cluster")),
                "status": None,
                "specs": {
                    "hostname": b.get("hostname"),
                    "endpoint_type": b.get("endpoint_type"),
                    "objects": b.get("objects", 0),
                    "size": b.get("size", 0),
                    "s3_endpoint": b.get("s3_endpoint"),
                    "acl": access.get("acl") if access else None,
                    "cors_enabled": access.get("cors_enabled") if access else None,
                },
                "plan_type": None,
                "resource_created_at": b.get("created"),
            })
        return self.bulk_upsert_resources(rows)

    def write_databases(self, dbs_raw: list, db_details_map: dict) -> dict:
        rows = []
        for db_item in dbs_raw:
            engine = db_item.get("engine", "mysql")
            detail = db_details_map.get(db_item["id"], {})
            rows.append({
                "resource_id": str(db_item["id"]),
                "resource_type": "database",
                "label": db_item["label"],
                "region": db_item.get("region"),
                "status": db_item.get("status"),
                "specs": {
                    "engine": engine,
                    "version": db_item.get("version"),
                    "cluster_size": db_item.get("cluster_size", 1),
                    "encrypted": db_item.get("encrypted", False),
                    "port": db_item.get("port"),
                    "tags": db_item.get("tags", []),
                    "vpc_id": detail.get("platform") and detail.get("vpc_id"),
                    "subnet_id": detail.get("subnet_id"),
                    "public_access": (
                        db_item.get("allow_list") is not None and
                        (len(db_item.get("allow_list", [])) == 0 or
                         "0.0.0.0/0" in db_item.get("allow_list", []))
                    ),
                    "allow_list": db_item.get("allow_list", []),
                    "ssl_connection": (
                        detail.get("ssl_connection")
                        if "ssl_connection" in detail
                        else db_item.get("ssl_connection")
                    ),
                    "maintenance_dow": (
                        (detail.get("updates") or {}).get("day_of_week")
                        or db_item.get("maintenance_dow")
                    ),
                    "maintenance_schedule": detail.get("updates") or db_item.get("updates"),
                    "backups_enabled": (detail.get("backups") or {}).get("enabled", False),
                    "backups_last_successful": (
                        (detail.get("backups") or {}).get("oldest_restore_date")
                        or detail.get("last_backup_at")
                        or db_item.get("last_backup_at")
                    ),
                },
                "plan_type": db_item.get("type"),
                "resource_created_at": db_item.get("created"),
            })
        return self.bulk_upsert_resources(rows)

    def write_domains(self, domains_raw: list) -> dict:
        rows = []
        for dom in domains_raw:
            raw_ttl = dom.get("ttl_sec")
            raw_retry = dom.get("retry_sec")
            raw_expire = dom.get("expire_sec")
            raw_refresh = dom.get("refresh_sec")
            rows.append({
                "resource_id": str(dom["id"]),
                "resource_type": "domain",
                "label": dom["domain"],
                "region": None,
                "status": dom.get("status"),
                "specs": {
                    "type": dom.get("type"),
                    "status": dom.get("status"),
                    "soa_email": dom.get("soa_email") or "",
                    "ttl_sec": 86400 if raw_ttl == 0 else raw_ttl,
                    "retry_sec": 14400 if raw_retry == 0 else raw_retry,
                    "expire_sec": 1209600 if raw_expire == 0 else raw_expire,
                    "refresh_sec": 14400 if raw_refresh == 0 else raw_refresh,
                    "axfr_ips": dom.get("axfr_ips", []),
                    "master_ips": dom.get("master_ips", []),
                    "description": dom.get("description") or "",
                    "tags": dom.get("tags", []),
                    "group": dom.get("group") or "",
                },
                "plan_type": None,
                "resource_created_at": dom.get("created"),
            })
        return self.bulk_upsert_resources(rows)

    def write_vpcs(self, vpcs_raw: list, vpc_subnets_map: dict) -> dict[int, str]:
        rows = []
        for vpc in vpcs_raw:
            subnets = vpc_subnets_map.get(vpc["id"], [])
            linode_ids = []
            for sub in subnets:
                linode_ids.extend([ln["id"] for ln in sub.get("linodes", [])])
            rows.append({
                "resource_id": str(vpc["id"]),
                "resource_type": "vpc",
                "label": vpc["label"],
                "region": vpc.get("region"),
                "status": None,
                "specs": {
                    "description": vpc.get("description"),
                    "subnet_count": len(subnets),
                    "subnets": [{"id": s["id"], "label": s["label"],
                                 "ipv4": s.get("ipv4"),
                                 "linode_count": len(s.get("linodes", []))} for s in subnets],
                    "linode_count": len(linode_ids),
                    "linode_ids": linode_ids,
                },
                "plan_type": None,
                "resource_created_at": vpc.get("created"),
            })
        id_map = self.bulk_upsert_resources(rows)
        result = {int(k[0]): v for k, v in id_map.items()}
        self.vpc_db_ids.update(result)
        return result

    def write_events(self, events_raw: list):
        if not events_raw:
            return
        event_rows = []
        for ev in events_raw:
            ent = ev.get("entity") or {}
            sec = ev.get("secondary_entity") or {}
            event_rows.append((
                self.account_id, ev["id"], ev["action"],
                str(ent.get("id")) if ent.get("id") else None,
                ent.get("type"), ent.get("label"), ent.get("url"),
                str(sec.get("id")) if sec.get("id") else None,
                sec.get("type"), sec.get("label"),
                ev.get("message"), ev.get("status"), ev.get("username"),
                ev.get("duration"), ev.get("percent_complete"),
                ev.get("seen", False), ev.get("created"),
            ))
        execute_values(self.cur, """
            INSERT INTO linode_events
            (account_id, event_id, action, entity_id, entity_type, entity_label, entity_url,
             secondary_entity_id, secondary_entity_type, secondary_entity_label,
             message, status, username, duration, percent_complete, seen, event_created)
            VALUES %s
            ON CONFLICT (account_id, event_id) DO NOTHING
        """, event_rows)

    def write_relationships(self,
                            firewalls_raw: list,
                            fw_entities_map: dict,
                            fw_db_ids: dict[int, str],
                            volumes_raw: list,
                            vpcs_raw: list,
                            vpc_subnets_map: dict):
        self.cur.execute("DELETE FROM resource_relationships WHERE account_id = %s", (self.account_id,))

        rel_rows: list[tuple] = []

        for fw in firewalls_raw:
            fw_db_id = fw_db_ids.get(fw["id"])
            if not fw_db_id:
                continue
            for ent in fw_entities_map.get(fw["id"], []):
                if ent.get("type") == "linode":
                    ln_db_id = self.linode_db_ids.get(ent["id"])
                    if ln_db_id:
                        rel_rows.append((self.account_id, fw_db_id, ln_db_id, "protects", self.now))

        for v in volumes_raw:
            if v.get("linode_id"):
                v_db_id = self._lookup_resource_db_id(str(v["id"]), "volume")
                ln_db_id = self.linode_db_ids.get(v["linode_id"])
                if v_db_id and ln_db_id:
                    rel_rows.append((self.account_id, v_db_id, ln_db_id, "attached_to", self.now))

        for vpc in vpcs_raw:
            vpc_db_id = self.vpc_db_ids.get(vpc["id"])
            if not vpc_db_id:
                continue
            for sub in vpc_subnets_map.get(vpc["id"], []):
                for linode_entry in sub.get("linodes", []):
                    ln_db_id = self.linode_db_ids.get(linode_entry["id"])
                    if ln_db_id:
                        rel_rows.append((self.account_id, vpc_db_id, ln_db_id, "contains", self.now))

        if rel_rows:
            execute_values(self.cur, """
                INSERT INTO resource_relationships
                (account_id, source_id, target_id, relationship_type, synced_at)
                VALUES %s
            """, rel_rows)

    def _lookup_resource_db_id(self, resource_id: str, resource_type: str) -> str | None:
        self.cur.execute(
            "SELECT id FROM resources WHERE account_id=%s AND resource_id=%s AND resource_type=%s",
            (self.account_id, resource_id, resource_type),
        )
        row = self.cur.fetchone()
        return str(row["id"]) if row else None

    def mark_deleted(self):
        if self.synced_resource_ids:
            self.cur.execute("""
                UPDATE resources
                SET deleted_at = %s, updated_at = NOW()
                WHERE account_id = %s
                  AND deleted_at IS NULL
                  AND id::text NOT IN %s
            """, (self.now, self.account_id, tuple(self.synced_resource_ids)))
            self.cur.execute("""
                UPDATE resources
                SET deleted_at = NULL, updated_at = NOW()
                WHERE account_id = %s
                  AND deleted_at IS NOT NULL
                  AND id::text IN %s
            """, (self.account_id, tuple(self.synced_resource_ids)))
        else:
            self.cur.execute("""
                UPDATE resources
                SET deleted_at = %s, updated_at = NOW()
                WHERE account_id = %s AND deleted_at IS NULL
            """, (self.now, self.account_id))


def sync_account(account_id: str, api_token: str, db, log: list) -> int:
    now = datetime.now(timezone.utc)

    def logmsg(msg: str):
        log.append(f"[{account_id[:8]}] {msg}")

    logmsg("Starting resource sync...")

    cur = db.cursor()
    writer = _SyncWriter(cur, account_id, now, log)

    with LinodeClient(api_token) as client:

        # ---- Firewalls ----
        logmsg("Fetching firewalls...")
        firewalls_raw = client.get_firewalls()
        fw_rules_map: dict[int, dict] = {}
        fw_entities_map: dict[int, list] = {}
        for fw in firewalls_raw:
            fw_rules_map[fw["id"]] = client.get_firewall_rules(fw["id"]) or {}
            devices = client.get_firewall_devices(fw["id"])
            fw_entities_map[fw["id"]] = [
                {"id": d["entity"]["id"], "label": d["entity"]["label"],
                 "type": d["entity"]["type"], "via_interface": False,
                 "parent_entity": d["entity"].get("parent_entity")}
                for d in devices if d.get("entity")
            ]

        linode_fw_map: dict[int, list] = {}
        fw_info_map: dict[int, dict] = {fw["id"]: fw for fw in firewalls_raw}
        for fw in firewalls_raw:
            for ent in fw_entities_map.get(fw["id"], []):
                if ent.get("type") == "linode":
                    lid = ent["id"]
                    linode_fw_map.setdefault(lid, []).append(
                        {"id": fw["id"], "label": fw["label"], "status": fw.get("status", "enabled")}
                    )

        logmsg("Writing firewalls...")
        fw_db_ids = writer.write_firewalls(firewalls_raw, fw_rules_map, fw_entities_map)

        # ---- VPCs ----
        logmsg("Fetching VPCs...")
        vpcs_raw = client.get_vpcs()
        linode_vpc_map: dict[int, list[int]] = {}
        vpc_subnets_map: dict[int, list] = {}
        for vpc in vpcs_raw:
            subnets = client.get_vpc_subnets(vpc["id"])
            vpc_subnets_map[vpc["id"]] = subnets
            for sub in subnets:
                for linode_entry in sub.get("linodes", []):
                    lid = linode_entry["id"]
                    linode_vpc_map.setdefault(lid, []).append(vpc["id"])

        logmsg("Writing VPCs...")
        writer.write_vpcs(vpcs_raw, vpc_subnets_map)

        # ---- Linodes ----
        logmsg("Fetching linodes...")
        linodes_raw = client.get_linodes()
        for ln in linodes_raw:
            attached_fw_ids = {fw["id"] for fw in linode_fw_map.get(ln["id"], [])}
            try:
                per_linode_fws = client.get_linode_firewalls(ln["id"])
                for fw in per_linode_fws:
                    if fw["id"] not in attached_fw_ids:
                        attached_fw_ids.add(fw["id"])
                        linode_fw_map.setdefault(ln["id"], []).append(
                            {"id": fw["id"], "label": fw["label"], "status": fw.get("status", "enabled")}
                        )
            except Exception as e:
                logmsg(f"Warning: could not fetch per-linode firewalls for linode {ln['id']}: {e}")

        logmsg("Writing linodes...")
        writer.write_linodes(linodes_raw, linode_fw_map, linode_vpc_map)

        # ---- Volumes ----
        logmsg("Fetching and writing volumes...")
        volumes_raw = client.get_volumes()
        writer.write_volumes(volumes_raw)

        # ---- Nodebalancers ----
        logmsg("Fetching nodebalancers...")
        nbs_raw = client.get_nodebalancers()
        nb_details: dict[int, dict] = {}
        for nb in nbs_raw:
            configs = client.get_nodebalancer_configs(nb["id"])
            all_nodes = []
            for cfg in configs:
                nodes = client.get_nodebalancer_config_nodes(nb["id"], cfg["id"])
                all_nodes.extend([{"id": n["id"], "label": n["label"],
                                   "address": n["address"], "status": n.get("status")} for n in nodes])
            nb_details[nb["id"]] = {"configs": configs, "nodes": all_nodes}

        logmsg("Writing nodebalancers...")
        writer.write_nodebalancers(nbs_raw, nb_details)

        # ---- LKE ----
        logmsg("Fetching LKE clusters...")
        lke_raw = client.get_lke_clusters()
        lke_pools_map: dict[int, list] = {}
        for cl in lke_raw:
            lke_pools_map[cl["id"]] = client.get_lke_pools(cl["id"])

        logmsg("Writing LKE clusters...")
        writer.write_lke_clusters(lke_raw, lke_pools_map)

        # ---- Object Storage ----
        logmsg("Fetching object storage...")
        buckets_raw = client.get_object_storage_buckets()
        bucket_access_map: dict[str, Any] = {}
        for b in buckets_raw:
            bucket_key = f"{b.get('region', b.get('cluster', ''))}/{b['label']}"
            bucket_access_map[bucket_key] = client.get_bucket_access(
                b.get("region", b.get("cluster", "")), b["label"]
            )

        logmsg("Writing object storage...")
        writer.write_object_storage(buckets_raw, bucket_access_map)

        # ---- Databases ----
        logmsg("Fetching databases...")
        dbs_raw = client.get_databases()
        db_details_map: dict[int, dict] = {}
        _ALLOWED_ENGINES = frozenset({"mysql", "postgresql"})
        for db_item in dbs_raw:
            raw_engine = db_item.get("engine", "")
            engine = raw_engine if raw_engine in _ALLOWED_ENGINES else None
            if engine is None:
                logmsg(f"Skipping database id={db_item.get('id')} — unrecognised engine {raw_engine!r}")
                db_details_map[db_item["id"]] = {}
                continue
            db_details_map[db_item["id"]] = client.get_database_detail(engine, db_item["id"]) or {}

        logmsg("Writing databases...")
        writer.write_databases(dbs_raw, db_details_map)

        # ---- Domains ----
        logmsg("Fetching and writing domains...")
        domains_raw = client.get_domains()
        writer.write_domains(domains_raw)

        # ---- Events ----
        logmsg("Fetching and writing events...")
        events_raw = client.get_events()
        writer.write_events(events_raw)

    # ---- Relationships ----
    logmsg("Building resource relationships...")
    writer.write_relationships(
        firewalls_raw, fw_entities_map, fw_db_ids,
        volumes_raw, vpcs_raw, vpc_subnets_map,
    )

    # ---- Soft-delete ----
    logmsg("Marking deleted resources...")
    writer.mark_deleted()

    cur.execute("UPDATE linode_accounts SET last_sync_at=%s, updated_at=NOW() WHERE id=%s", (now, account_id))
    logmsg(f"Sync complete. {writer.resource_count} resources written.")
    return writer.resource_count
