import json
from datetime import datetime, timezone
from typing import Any
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


def _collect_api_data(api_token: str, log: list, account_id: str) -> dict:
    client = LinodeClient(api_token)

    def logmsg(msg: str):
        log.append(f"[{account_id[:8]}] {msg}")

    logmsg("Fetching firewalls...")
    firewalls_raw = client.get_firewalls()
    fw_rules_map: dict[int, dict] = {}
    fw_entities_map: dict[int, list] = {}
    for fw in firewalls_raw:
        rules = client.get_firewall_rules(fw["id"]) or {}
        devices = client.get_firewall_devices(fw["id"])
        fw_rules_map[fw["id"]] = rules
        fw_entities_map[fw["id"]] = [
            {"id": d["entity"]["id"], "label": d["entity"]["label"],
             "type": d["entity"]["type"], "via_interface": False,
             "parent_entity": d["entity"].get("parent_entity")}
            for d in devices if d.get("entity")
        ]

    linode_fw_map: dict[int, list] = {}
    for fw in firewalls_raw:
        for ent in fw_entities_map.get(fw["id"], []):
            if ent.get("type") == "linode":
                lid = ent["id"]
                if lid not in linode_fw_map:
                    linode_fw_map[lid] = []
                linode_fw_map[lid].append({"id": fw["id"], "label": fw["label"], "status": fw.get("status", "enabled")})

    fw_info_map: dict[int, dict] = {fw["id"]: fw for fw in firewalls_raw}

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
                if lid not in linode_vpc_map:
                    linode_vpc_map[lid] = []
                linode_vpc_map[lid].append(vpc["id"])

    logmsg("Fetching linodes...")
    linodes_raw = client.get_linodes()
    for ln in linodes_raw:
        attached_fw_ids = {fw["id"] for fw in linode_fw_map.get(ln["id"], [])}
        try:
            per_linode_fws = client.get_linode_firewalls(ln["id"])
            for fw in per_linode_fws:
                if fw["id"] not in attached_fw_ids:
                    attached_fw_ids.add(fw["id"])
                    if ln["id"] not in linode_fw_map:
                        linode_fw_map[ln["id"]] = []
                    linode_fw_map[ln["id"]].append({"id": fw["id"], "label": fw["label"], "status": fw.get("status", "enabled")})
        except Exception:
            pass

    logmsg("Fetching volumes...")
    volumes_raw = client.get_volumes()

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

    logmsg("Fetching LKE clusters...")
    lke_raw = client.get_lke_clusters()
    lke_pools_map: dict[int, list] = {}
    for cl in lke_raw:
        lke_pools_map[cl["id"]] = client.get_lke_pools(cl["id"])

    logmsg("Fetching object storage...")
    buckets_raw = client.get_object_storage_buckets()
    bucket_access_map: dict[str, dict] = {}
    for b in buckets_raw:
        bucket_key = f"{b.get('region', b.get('cluster', ''))}/{b['label']}"
        bucket_access_map[bucket_key] = client.get_bucket_access(
            b.get("region", b.get("cluster", "")), b["label"]
        )

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

    logmsg("Fetching domains...")
    domains_raw = client.get_domains()

    logmsg("Fetching events...")
    events_raw = client.get_events()

    return {
        "firewalls_raw": firewalls_raw,
        "fw_rules_map": fw_rules_map,
        "fw_entities_map": fw_entities_map,
        "linode_fw_map": linode_fw_map,
        "vpcs_raw": vpcs_raw,
        "vpc_subnets_map": vpc_subnets_map,
        "linode_vpc_map": linode_vpc_map,
        "linodes_raw": linodes_raw,
        "volumes_raw": volumes_raw,
        "nbs_raw": nbs_raw,
        "nb_details": nb_details,
        "lke_raw": lke_raw,
        "lke_pools_map": lke_pools_map,
        "buckets_raw": buckets_raw,
        "bucket_access_map": bucket_access_map,
        "dbs_raw": dbs_raw,
        "db_details_map": db_details_map,
        "domains_raw": domains_raw,
        "events_raw": events_raw,
    }


def _write_to_db(account_id: str, data: dict, db, log: list, now: datetime) -> tuple[int, dict]:
    cur = db.cursor()

    def logmsg(msg: str):
        log.append(f"[{account_id[:8]}] {msg}")

    resource_count = 0
    synced_resource_ids: set[str] = set()
    linode_db_ids: dict[int, str] = {}
    vpc_db_ids: dict[int, str] = {}

    def upsert_resource(resource_id: str, resource_type: str, label: str,
                        region: str | None, status: str | None,
                        specs: dict, plan_type: str | None,
                        resource_created_at: str | None) -> str:
        cur.execute("""
            SELECT id, specs FROM resources
            WHERE account_id = %s AND resource_id = %s AND resource_type = %s
        """, (account_id, resource_id, resource_type))
        existing = cur.fetchone()

        if existing:
            rid = str(existing["id"])
            old_specs = existing["specs"] or {}
            diff = _diff(old_specs, specs)
            cur.execute("""
                UPDATE resources SET label=%s, region=%s, status=%s, specs=%s,
                    plan_type=%s, resource_created_at=%s,
                    last_synced_at=%s, updated_at=NOW()
                WHERE id=%s
            """, (label, region, status, json.dumps(specs),
                  plan_type,
                  resource_created_at, now, rid))
            if diff:
                cur.execute("""
                    INSERT INTO resource_snapshots
                    (resource_id, account_id, resource_type, label, region, plan_type,
                     status, specs, diff, synced_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """, (rid, account_id, resource_type, label, region, plan_type,
                      status, json.dumps(specs), json.dumps(diff), now))
        else:
            cur.execute("""
                INSERT INTO resources
                (account_id, resource_id, resource_type, label, region, status, specs,
                 plan_type, resource_created_at, last_synced_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING id
            """, (account_id, resource_id, resource_type, label, region, status,
                  json.dumps(specs),
                  plan_type, resource_created_at, now))
            rid = str(cur.fetchone()["id"])
            cur.execute("""
                INSERT INTO resource_snapshots
                (resource_id, account_id, resource_type, label, region, plan_type,
                 status, specs, diff, synced_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,NULL,%s)
            """, (rid, account_id, resource_type, label, region, plan_type,
                  status, json.dumps(specs), now))
        return rid

    logmsg("Writing firewalls...")
    for fw in data["firewalls_raw"]:
        rules = data["fw_rules_map"].get(fw["id"], {})
        entities = data["fw_entities_map"].get(fw["id"], [])
        inbound_rules = rules.get("inbound") or []
        outbound_rules = rules.get("outbound") or []
        specs = {
            "inbound_policy": rules.get("inbound_policy", "DROP"),
            "outbound_policy": rules.get("outbound_policy", "ACCEPT"),
            "inbound_rules": len(inbound_rules),
            "outbound_rules": len(outbound_rules),
            "inbound_rules_detail": inbound_rules,
            "outbound_rules_detail": outbound_rules,
            "entity_count": len(entities),
            "entities": entities,
            "tags": fw.get("tags", []),
        }
        rid = upsert_resource(
            str(fw["id"]), "firewall", fw["label"], None, fw.get("status"),
            specs, None, fw.get("created")
        )
        synced_resource_ids.add(rid)
        resource_count += 1

    logmsg("Writing linodes...")
    for ln in data["linodes_raw"]:
        attached_fw = data["linode_fw_map"].get(ln["id"], [])
        specs = {
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
            "vpc_ids": data["linode_vpc_map"].get(ln["id"], []),
            "instance_type": ln.get("type"),
            "created_at": ln.get("created"),
            "watchdog_enabled": ln.get("watchdog_enabled", False),
            "alerts": ln.get("alerts", {}),
            "ipv4": ln.get("ipv4", []),
            "ipv6": ln.get("ipv6"),
        }
        rid = upsert_resource(
            str(ln["id"]), "linode", ln["label"], ln.get("region"),
            ln.get("status"), specs, ln.get("type"), ln.get("created")
        )
        linode_db_ids[ln["id"]] = rid
        synced_resource_ids.add(rid)
        resource_count += 1

    logmsg("Writing volumes...")
    for v in data["volumes_raw"]:
        specs = {
            "size": v.get("size"),
            "tags": v.get("tags", []),
            "linode_id": v.get("linode_id"),
            "linode_label": v.get("linode_label"),
            "filesystem_path": v.get("filesystem_path"),
            "encryption": v.get("encryption"),
        }
        rid = upsert_resource(
            str(v["id"]), "volume", v["label"], v.get("region"),
            v.get("status"), specs, None, v.get("created")
        )
        synced_resource_ids.add(rid)
        resource_count += 1

    logmsg("Writing nodebalancers...")
    for nb in data["nbs_raw"]:
        details = data["nb_details"].get(nb["id"], {})
        configs = details.get("configs", [])
        all_nodes = details.get("nodes", [])
        specs = {
            "ipv4": nb.get("ipv4"),
            "tags": nb.get("tags", []),
            "node_count": len(all_nodes),
            "nodes": all_nodes,
            "configs": [{"id": c["id"], "port": c["port"],
                         "protocol": c.get("protocol"),
                         "algorithm": c.get("algorithm"),
                         "client_conn_throttle": c.get("client_conn_throttle", 0)} for c in configs],
            "vpcs": [],
        }
        rid = upsert_resource(
            str(nb["id"]), "nodebalancer", nb["label"], nb.get("region"),
            None, specs, None, nb.get("created")
        )
        synced_resource_ids.add(rid)
        resource_count += 1

    logmsg("Writing LKE clusters...")
    for cl in data["lke_raw"]:
        pools = data["lke_pools_map"].get(cl["id"], [])
        node_count = sum(p.get("count", 0) for p in pools)
        specs = {
            "k8s_version": cl.get("k8s_version"),
            "node_count": node_count,
            "pool_count": len(pools),
            "high_availability": cl.get("control_plane", {}).get("high_availability", False),
            "audit_logs_enabled": cl.get("control_plane", {}).get("acl") is not None,
            "vpc_id": cl.get("vpc_id"),
            "subnet_id": cl.get("subnet_id"),
            "tags": cl.get("tags", []),
            "pools": [{"id": p["id"], "type": p.get("type"),
                       "count": p.get("count"), "autoscaler": p.get("autoscaler")} for p in pools],
        }
        rid = upsert_resource(
            str(cl["id"]), "lke_cluster", cl["label"], cl.get("region"),
            cl.get("status"), specs, None, cl.get("created")
        )
        synced_resource_ids.add(rid)
        resource_count += 1

    logmsg("Writing object storage...")
    for b in data["buckets_raw"]:
        bucket_key = f"{b.get('region', b.get('cluster', ''))}/{b['label']}"
        access = data["bucket_access_map"].get(bucket_key)
        specs = {
            "hostname": b.get("hostname"),
            "endpoint_type": b.get("endpoint_type"),
            "objects": b.get("objects", 0),
            "size": b.get("size", 0),
            "s3_endpoint": b.get("s3_endpoint"),
            "acl": access.get("acl") if access else None,
            "cors_enabled": access.get("cors_enabled") if access else None,
        }
        rid = upsert_resource(
            bucket_key, "object_storage", b["label"],
            b.get("region", b.get("cluster")),
            None, specs, None, b.get("created")
        )
        synced_resource_ids.add(rid)
        resource_count += 1

    logmsg("Writing databases...")
    for db_item in data["dbs_raw"]:
        engine = db_item.get("engine", "mysql")
        detail = data["db_details_map"].get(db_item["id"], {})
        specs = {
            "engine": engine,
            "version": db_item.get("version"),
            "cluster_size": db_item.get("cluster_size", 1),
            "encrypted": db_item.get("encrypted", False),
            "port": db_item.get("port"),
            "tags": db_item.get("tags", []),
            "vpc_id": detail.get("platform") and detail.get("vpc_id"),
            "subnet_id": detail.get("subnet_id"),
            "public_access": db_item.get("allow_list") is not None and
                             (len(db_item.get("allow_list", [])) == 0 or
                              "0.0.0.0/0" in db_item.get("allow_list", [])),
            "allow_list": db_item.get("allow_list", []),
            "ssl_connection": detail.get("ssl_connection") if "ssl_connection" in detail else db_item.get("ssl_connection"),
            "maintenance_dow": (detail.get("updates") or {}).get("day_of_week") or db_item.get("maintenance_dow"),
            "maintenance_schedule": detail.get("updates") or db_item.get("updates"),
            "backups_enabled": (detail.get("backups") or {}).get("enabled", False),
            "backups_last_successful": (detail.get("backups") or {}).get("oldest_restore_date") or detail.get("last_backup_at") or db_item.get("last_backup_at"),
        }
        rid = upsert_resource(
            str(db_item["id"]), "database", db_item["label"], db_item.get("region"),
            db_item.get("status"), specs, db_item.get("type"), db_item.get("created")
        )
        synced_resource_ids.add(rid)
        resource_count += 1

    logmsg("Writing domains...")
    for dom in data["domains_raw"]:
        raw_ttl = dom.get("ttl_sec")
        raw_retry = dom.get("retry_sec")
        raw_expire = dom.get("expire_sec")
        raw_refresh = dom.get("refresh_sec")
        specs = {
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
        }
        rid = upsert_resource(
            str(dom["id"]), "domain", dom["domain"], None,
            dom.get("status"), specs, None, dom.get("created")
        )
        synced_resource_ids.add(rid)
        resource_count += 1

    logmsg("Writing VPCs...")
    for vpc in data["vpcs_raw"]:
        subnets = data["vpc_subnets_map"].get(vpc["id"], [])
        linode_ids = []
        for sub in subnets:
            linode_ids.extend([l["id"] for l in sub.get("linodes", [])])
        specs = {
            "description": vpc.get("description"),
            "subnet_count": len(subnets),
            "subnets": [{"id": s["id"], "label": s["label"],
                         "ipv4": s.get("ipv4"), "linode_count": len(s.get("linodes", []))} for s in subnets],
            "linode_count": len(linode_ids),
            "linode_ids": linode_ids,
        }
        rid = upsert_resource(
            str(vpc["id"]), "vpc", vpc["label"], vpc.get("region"),
            None, specs, None, vpc.get("created")
        )
        vpc_db_ids[vpc["id"]] = rid
        synced_resource_ids.add(rid)
        resource_count += 1

    logmsg("Writing events...")
    for ev in data["events_raw"][:500]:
        ent = ev.get("entity") or {}
        sec = ev.get("secondary_entity") or {}
        try:
            cur.execute("""
                INSERT INTO linode_events
                (account_id, event_id, action, entity_id, entity_type, entity_label, entity_url,
                 secondary_entity_id, secondary_entity_type, secondary_entity_label,
                 message, status, username, duration, percent_complete, seen, event_created)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (account_id, event_id) DO NOTHING
            """, (account_id, ev["id"], ev["action"],
                  str(ent.get("id")) if ent.get("id") else None,
                  ent.get("type"), ent.get("label"), ent.get("url"),
                  str(sec.get("id")) if sec.get("id") else None,
                  sec.get("type"), sec.get("label"),
                  ev.get("message"), ev.get("status"), ev.get("username"),
                  ev.get("duration"), ev.get("percent_complete"),
                  ev.get("seen", False), ev.get("created")))
        except Exception:
            pass

    logmsg("Building resource relationships...")
    cur.execute("DELETE FROM resource_relationships WHERE account_id = %s", (account_id,))

    for fw in data["firewalls_raw"]:
        cur.execute("SELECT id FROM resources WHERE account_id=%s AND resource_id=%s AND resource_type='firewall'",
                    (account_id, str(fw["id"])))
        fw_row = cur.fetchone()
        if not fw_row:
            continue
        for ent in data["fw_entities_map"].get(fw["id"], []):
            if ent.get("type") == "linode":
                ln_db_id = linode_db_ids.get(ent["id"])
                if ln_db_id:
                    cur.execute("""
                        INSERT INTO resource_relationships
                        (account_id, source_id, target_id, relationship_type, synced_at)
                        VALUES (%s,%s,%s,'protects',%s)
                    """, (account_id, str(fw_row["id"]), ln_db_id, now))

    for v in data["volumes_raw"]:
        if v.get("linode_id"):
            cur.execute("SELECT id FROM resources WHERE account_id=%s AND resource_id=%s AND resource_type='volume'",
                        (account_id, str(v["id"])))
            v_row = cur.fetchone()
            ln_db_id = linode_db_ids.get(v["linode_id"])
            if v_row and ln_db_id:
                cur.execute("""
                    INSERT INTO resource_relationships
                    (account_id, source_id, target_id, relationship_type, synced_at)
                    VALUES (%s,%s,%s,'attached_to',%s)
                """, (account_id, str(v_row["id"]), ln_db_id, now))

    for vpc in data["vpcs_raw"]:
        vpc_db_id = vpc_db_ids.get(vpc["id"])
        if not vpc_db_id:
            continue
        subnets = data["vpc_subnets_map"].get(vpc["id"], [])
        for sub in subnets:
            for linode_entry in sub.get("linodes", []):
                ln_db_id = linode_db_ids.get(linode_entry["id"])
                if ln_db_id:
                    cur.execute("""
                        INSERT INTO resource_relationships
                        (account_id, source_id, target_id, relationship_type, synced_at)
                        VALUES (%s,%s,%s,'contains',%s)
                    """, (account_id, vpc_db_id, ln_db_id, now))

    logmsg("Marking deleted resources...")
    if synced_resource_ids:
        cur.execute("""
            UPDATE resources
            SET deleted_at = %s, updated_at = NOW()
            WHERE account_id = %s
              AND deleted_at IS NULL
              AND id::text NOT IN %s
        """, (now, account_id, tuple(synced_resource_ids)))
    else:
        cur.execute("""
            UPDATE resources
            SET deleted_at = %s, updated_at = NOW()
            WHERE account_id = %s AND deleted_at IS NULL
        """, (now, account_id))

    cur.execute("""
        UPDATE resources
        SET deleted_at = NULL, updated_at = NOW()
        WHERE account_id = %s
          AND deleted_at IS NOT NULL
          AND id::text IN %s
    """, (account_id, tuple(synced_resource_ids))) if synced_resource_ids else None

    cur.execute("UPDATE linode_accounts SET last_sync_at=%s, updated_at=NOW() WHERE id=%s", (now, account_id))
    logmsg(f"Sync complete. {resource_count} resources written.")
    return resource_count, {"linode_db_ids": linode_db_ids, "vpc_db_ids": vpc_db_ids}


def sync_account(account_id: str, api_token: str, db, log: list) -> int:
    now = datetime.now(timezone.utc)

    def logmsg(msg: str):
        log.append(f"[{account_id[:8]}] {msg}")

    logmsg("Starting resource sync...")

    api_data = _collect_api_data(api_token, log, account_id)

    logmsg("Writing resources to database...")
    resource_count, _ = _write_to_db(account_id, api_data, db, log, now)
    return resource_count
