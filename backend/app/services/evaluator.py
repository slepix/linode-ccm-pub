import json
from datetime import datetime, timezone
from typing import Any
from app.services.linode_api import LinodeClient


def _check_port_in_range(port_range: str, sensitive_ports: list[int]) -> bool:
    if not port_range:
        return True
    parts = [p.strip() for p in port_range.replace(";", ",").split(",")]
    for part in parts:
        if "-" in part:
            try:
                lo, hi = part.split("-", 1)
                lo, hi = int(lo), int(hi)
                for sp in sensitive_ports:
                    if lo <= sp <= hi:
                        return True
            except ValueError:
                pass
        else:
            try:
                if int(part) in sensitive_ports:
                    return True
            except ValueError:
                pass
    return False


def _is_open_address(addr: str) -> bool:
    return addr in ("0.0.0.0/0", "::/0", "2000::/3")


def _is_rfc1918(addr: str) -> bool:
    return (
        addr.startswith("10.") or
        addr.startswith("192.168.") or
        any(addr.startswith(f"172.{i}.") for i in range(16, 32))
    )


def evaluate_rule(rule: dict, resource: dict | None, all_resources: list[dict],
                  api_token: str, client: LinodeClient) -> tuple[str, str | None]:
    ct = rule["condition_type"]
    raw_cfg = rule["condition_config"] or {}
    if isinstance(raw_cfg, str):
        import json as _json
        try:
            raw_cfg = _json.loads(raw_cfg)
        except Exception:
            raw_cfg = {}
    cfg = raw_cfg

    if resource:
        raw_specs = resource.get("specs") or {}
        if isinstance(raw_specs, str):
            import json as _json
            try:
                raw_specs = _json.loads(raw_specs)
            except Exception:
                raw_specs = {}
        specs = raw_specs

    # --- firewall_attached ---
    if ct == "firewall_attached":
        if not resource:
            return "not_applicable", None
        attached = specs.get("attached_firewalls") or []
        if attached:
            return "compliant", None
        fw_resources = [r for r in all_resources if r["resource_type"] == "firewall"]
        resource_id_str = str(resource.get("resource_id", ""))
        for fw in fw_resources:
            fw_specs = fw.get("specs") or {}
            for ent in fw_specs.get("entities", []):
                ent_type = ent.get("type")
                if ent_type == "linode" and str(ent.get("id")) == resource_id_str:
                    return "compliant", None
                if ent_type in ("linode_interface", "interface"):
                    parent = ent.get("parent_entity") or {}
                    if str(parent.get("id")) == resource_id_str:
                        return "compliant", None
        return "non_compliant", "No active firewall attached to this Linode."

    # --- no_open_inbound ---
    if ct == "no_open_inbound":
        if not resource:
            return "not_applicable", None
        sensitive_ports = cfg.get("sensitive_ports", [22, 3389, 3306, 5432, 6379, 27017])
        inbound_policy = specs.get("inbound_policy", "DROP")
        inbound_rules = specs.get("inbound_rules_detail", [])
        if inbound_policy == "ACCEPT" and not inbound_rules:
            return "non_compliant", "Inbound policy is ACCEPT with no rules — all traffic allowed."
        for r in inbound_rules:
            if r.get("action") != "ACCEPT":
                continue
            proto = r.get("protocol", "").upper()
            if proto not in ("TCP", "ALL"):
                continue
            addrs = r.get("addresses", {})
            ipv4s = addrs.get("ipv4", [])
            ipv6s = addrs.get("ipv6", [])
            all_addrs = ipv4s + ipv6s
            open_addr = any(_is_open_address(a) for a in all_addrs)
            if not open_addr:
                continue
            ports = r.get("ports", "")
            if not ports or proto == "ALL":
                return "non_compliant", f"Rule '{r.get('label','')}' allows unrestricted inbound on all ports."
            if _check_port_in_range(ports, sensitive_ports):
                return "non_compliant", f"Rule '{r.get('label','')}' allows unrestricted inbound on sensitive port(s): {ports}."
        return "compliant", None

    # --- firewall_has_targets ---
    if ct == "firewall_has_targets":
        if not resource:
            return "not_applicable", None
        return ("compliant", None) if specs.get("entity_count", 0) > 0 else ("non_compliant", "Firewall has no attached resources.")

    # --- min_node_count ---
    if ct == "min_node_count":
        if not resource:
            return "not_applicable", None
        min_count = cfg.get("min_count", 2)
        node_count = specs.get("node_count") or len(specs.get("nodes", []))
        if node_count is None:
            return "not_applicable", None
        return ("compliant", None) if node_count >= min_count else ("non_compliant", f"Cluster has {node_count} node(s), minimum is {min_count}.")

    # --- has_tags ---
    if ct == "has_tags":
        if not resource:
            return "not_applicable", None
        tags = [t.lower() for t in (specs.get("tags") or [])]
        required_tags = cfg.get("required_tags", [])
        if required_tags:
            missing = []
            for req in required_tags:
                key = req["key"].lower()
                value = req.get("value", "*")
                found = False
                for tag in tags:
                    if ":" in tag:
                        tk, tv = tag.split(":", 1)
                        if tk == key and (value == "*" or tv == value.lower()):
                            found = True
                            break
                    elif tag == key and value == "*":
                        found = True
                        break
                if not found:
                    missing.append(req["key"])
            if missing:
                return "non_compliant", f"Missing required tags: {', '.join(missing)}"
            return "compliant", None
        min_tags = cfg.get("min_tags", 1)
        return ("compliant", None) if len(tags) >= min_tags else ("non_compliant", f"Resource has {len(tags)} tag(s), minimum is {min_tags}.")

    # --- volume_attached ---
    if ct == "volume_attached":
        if not resource:
            return "not_applicable", None
        return ("compliant", None) if specs.get("linode_id") else ("non_compliant", "Volume is not attached to any Linode.")

    # --- db_allowlist_check ---
    if ct == "db_allowlist_check":
        if not resource:
            return "not_applicable", None
        allow_list = specs.get("allow_list")
        if allow_list is None:
            return "not_applicable", None
        forbidden = cfg.get("forbidden_cidrs", ["0.0.0.0/0", "::/0"])
        require_non_empty = cfg.get("require_non_empty", False)
        if require_non_empty and not allow_list:
            return "non_compliant", "Database allow list is empty."
        for cidr in allow_list:
            if cidr in forbidden:
                return "non_compliant", f"Database allow list contains forbidden CIDR: {cidr}"
        return "compliant", None

    # --- db_public_access ---
    if ct == "db_public_access":
        if not resource:
            return "not_applicable", None
        public_access = specs.get("public_access")
        if public_access is None:
            return "not_applicable", None
        allow = cfg.get("allow_public_access", False)
        if public_access and not allow:
            return "non_compliant", "Database has public access enabled."
        return "compliant", None

    # --- linode_backups_enabled ---
    if ct == "linode_backups_enabled":
        if not resource:
            return "not_applicable", None
        val = specs.get("backups_enabled")
        if val is None:
            return "not_applicable", None
        return ("compliant", None) if val else ("non_compliant", "Automated backups are not enabled.")

    # --- linode_disk_encryption ---
    if ct == "linode_disk_encryption":
        if not resource:
            return "not_applicable", None
        val = specs.get("disk_encryption")
        if val is None:
            return "not_applicable", "Disk encryption status is unknown (feature may not be supported)."
        return ("compliant", None) if val == "enabled" else ("non_compliant", f"Disk encryption is '{val}', expected 'enabled'.")

    # --- linode_lock_configured ---
    if ct == "linode_lock_configured":
        if not resource:
            return "not_applicable", None
        locks = specs.get("locks") or []
        required = cfg.get("required_lock_types", [])
        if not locks:
            return "non_compliant", "No deletion locks configured."
        if required:
            missing = [r for r in required if r not in locks]
            if missing:
                return "non_compliant", f"Missing required lock types: {', '.join(missing)}"
        return "compliant", None

    # --- linode_not_offline ---
    if ct == "linode_not_offline":
        if not resource:
            return "not_applicable", None
        status = specs.get("status")
        return ("non_compliant", "Linode is offline.") if status == "offline" else ("compliant", None)

    # --- linode_backup_recency ---
    if ct == "linode_backup_recency":
        if not resource:
            return "not_applicable", None
        if not specs.get("backups_enabled"):
            return "non_compliant", "Backups are not enabled."
        last = specs.get("backups_last_successful")
        if not last:
            return "non_compliant", "No successful backup recorded."
        try:
            if isinstance(last, datetime):
                last_dt = last if last.tzinfo else last.replace(tzinfo=timezone.utc)
            else:
                last_dt = datetime.fromisoformat(str(last).replace("Z", "+00:00").replace(" ", "T"))
                if last_dt.tzinfo is None:
                    last_dt = last_dt.replace(tzinfo=timezone.utc)
            age = (datetime.now(timezone.utc) - last_dt).days
            max_age = cfg.get("max_age_days", 7)
            if age <= max_age:
                return "compliant", None
            return "non_compliant", f"Last successful backup was {age} days ago (max: {max_age})."
        except Exception:
            return "not_applicable", "Could not parse backup timestamp."

    # --- lke_control_plane_acl ---
    if ct == "lke_control_plane_acl":
        if not resource:
            return "not_applicable", None
        data = client.get_lke_control_plane_acl(int(resource["resource_id"]))
        if not data or data.get("_status") == 400:
            return "not_applicable", "Control plane ACL is not supported for this cluster."
        acl = data.get("acl", {})
        if not acl.get("enabled", False):
            return "non_compliant", "Control plane ACL is not enabled."
        addresses = acl.get("addresses", {})
        ipv4s = addresses.get("ipv4", [])
        ipv6s = addresses.get("ipv6", [])
        if any(_is_open_address(a) for a in ipv4s + ipv6s):
            return "non_compliant", "Control plane ACL allows unrestricted access (0.0.0.0/0 or ::/0)."
        return "compliant", None

    # --- volume_encryption_enabled ---
    if ct == "volume_encryption_enabled":
        if not resource:
            return "not_applicable", None
        val = specs.get("encryption")
        if val is None:
            return "not_applicable", "Encryption status unknown."
        return ("compliant", None) if val == "enabled" else ("non_compliant", f"Volume encryption is '{val}'.")

    # --- lke_control_plane_ha ---
    if ct == "lke_control_plane_ha":
        if not resource:
            return "not_applicable", None
        val = specs.get("high_availability")
        return ("compliant", None) if val else ("non_compliant", "Control plane HA is not enabled.")

    # --- lke_audit_logs_enabled ---
    if ct == "lke_audit_logs_enabled":
        if not resource:
            return "not_applicable", None
        val = specs.get("audit_logs_enabled")
        if val is None:
            return "not_applicable", None
        return ("compliant", None) if val else ("non_compliant", "Audit logs are not enabled for this cluster.")

    # --- bucket_acl_check ---
    if ct == "bucket_acl_check":
        if not resource:
            return "not_applicable", None
        acl = specs.get("acl")
        if acl is None:
            return "not_applicable", "Bucket ACL is unknown."
        forbidden = cfg.get("forbidden_acls", ["public-read", "public-read-write", "authenticated-read"])
        required = cfg.get("required_acl", "")
        if required and acl != required:
            return "non_compliant", f"Bucket ACL is '{acl}', required '{required}'."
        if acl in forbidden:
            return "non_compliant", f"Bucket ACL '{acl}' is not allowed."
        return "compliant", None

    # --- tfa_users (account-level, live API) ---
    if ct == "tfa_users":
        users = client.get_account_users()
        exclude = cfg.get("exclude_user_types", ["proxy"])
        results = []
        for u in users:
            if u.get("user_type") in exclude:
                continue
            tfa = u.get("tfa_enabled", False)
            status = "compliant" if tfa else "non_compliant"
            detail = None if tfa else f"User '{u['username']}' does not have TFA enabled."
            results.append((status, detail))
        if not results:
            return "not_applicable", "No users found."
        non_comp = [r for r in results if r[0] == "non_compliant"]
        if non_comp:
            return "non_compliant", "; ".join(r[1] for r in non_comp if r[1])
        return "compliant", None

    # --- login_allowed_ips (account-level, live API) ---
    if ct == "login_allowed_ips":
        allowed_ips = cfg.get("allowed_ips", [])
        if not allowed_ips:
            return "not_applicable", "No allowed IPs configured."
        logins = client.get_account_logins()
        violations = []
        seen = set()
        for login in logins:
            ip = login.get("ip", "unknown")
            username = login.get("username", "unknown")
            key = (username, ip)
            if ip not in allowed_ips and key not in seen:
                seen.add(key)
                violations.append(f"{username} from {ip}")
        if violations:
            return "non_compliant", "Login from non-allowed IP: " + "; ".join(violations)
        return "compliant", None

    # --- approved_regions ---
    if ct == "approved_regions":
        if not resource:
            return "not_applicable", None
        approved = cfg.get("approved_regions", [])
        if not approved:
            return "not_applicable", "No approved regions configured."
        region = resource.get("region")
        if not region:
            return "not_applicable", "Resource has no region."
        return ("compliant", None) if region in approved else ("non_compliant", f"Region '{region}' is not in the approved list.")

    # --- firewall_rules_check ---
    if ct == "firewall_rules_check":
        if not resource:
            return "not_applicable", None
        fw_resources = [r for r in all_resources if r["resource_type"] == "firewall"]
        resource_id_str = str(resource.get("resource_id", ""))
        matched_fw_specs = []

        for fw in fw_resources:
            fw_specs = fw.get("specs") or {}
            if isinstance(fw_specs, str):
                import json as _json
                try:
                    fw_specs = _json.loads(fw_specs)
                except Exception:
                    fw_specs = {}
            for ent in fw_specs.get("entities", []):
                ent_type = ent.get("type")
                matched = False
                if ent_type == "linode" and str(ent.get("id")) == resource_id_str:
                    matched = True
                if ent_type in ("linode_interface", "interface"):
                    parent = ent.get("parent_entity") or {}
                    if str(parent.get("id")) == resource_id_str:
                        matched = True
                if matched:
                    matched_fw_specs.append(fw_specs)
                    break

        if not matched_fw_specs:
            attached = specs.get("attached_firewalls") or []
            for fw_ref in attached:
                fw_id = str(fw_ref.get("id", fw_ref) if isinstance(fw_ref, dict) else fw_ref)
                for fw in fw_resources:
                    if str(fw.get("resource_id", "")) == fw_id:
                        fw_specs = fw.get("specs") or {}
                        if isinstance(fw_specs, str):
                            import json as _json
                            try:
                                fw_specs = _json.loads(fw_specs)
                            except Exception:
                                fw_specs = {}
                        matched_fw_specs.append(fw_specs)
                        break

        if not matched_fw_specs:
            return "non_compliant", "No firewall attached."

        req_in = cfg.get("required_inbound_policy", "DROP")
        req_out = cfg.get("required_outbound_policy", "")
        for fw_specs in matched_fw_specs:
            if req_in and fw_specs.get("inbound_policy") != req_in:
                return "non_compliant", f"Firewall inbound policy is '{fw_specs.get('inbound_policy')}', expected '{req_in}'."
            if req_out and fw_specs.get("outbound_policy") != req_out:
                return "non_compliant", f"Firewall outbound policy is '{fw_specs.get('outbound_policy')}', expected '{req_out}'."
        return "compliant", None

    # --- nodebalancer_protocol_check ---
    if ct == "nodebalancer_protocol_check":
        if not resource:
            return "not_applicable", None
        configs = specs.get("configs", [])
        if not configs:
            return "not_applicable", "No configs found."
        allowed = cfg.get("allowed_protocols", ["https"])
        forbidden = cfg.get("forbidden_protocols", [])
        for c in configs:
            proto = c.get("protocol", "").lower()
            if forbidden and proto in forbidden:
                return "non_compliant", f"Port {c.get('port')} uses forbidden protocol '{proto}'."
            if allowed and proto not in allowed:
                return "non_compliant", f"Port {c.get('port')} uses protocol '{proto}', allowed: {allowed}."
        return "compliant", None

    # --- nodebalancer_port_allowlist ---
    if ct == "nodebalancer_port_allowlist":
        if not resource:
            return "not_applicable", None
        configs = specs.get("configs", [])
        if not configs:
            return "not_applicable", None
        allowed = cfg.get("allowed_ports", [443])
        for c in configs:
            if c.get("port") not in allowed:
                return "non_compliant", f"Port {c.get('port')} is not in the allowed ports list."
        return "compliant", None

    # --- firewall_all_ports_allowed ---
    if ct == "firewall_all_ports_allowed":
        if not resource:
            return "not_applicable", None
        check_in = cfg.get("check_inbound", True)
        check_out = cfg.get("check_outbound", False)
        actions = cfg.get("actions", ["ACCEPT"])
        rules_to_check = []
        if check_in:
            rules_to_check.extend(specs.get("inbound_rules_detail", []))
        if check_out:
            rules_to_check.extend(specs.get("outbound_rules_detail", []))
        for r in rules_to_check:
            if r.get("action") not in actions:
                continue
            proto = r.get("protocol", "").upper()
            if proto in ("ICMP", "IPENCAP"):
                continue
            ports = r.get("ports", "")
            if proto == "ALL" or not ports or ports == "1-65535":
                return "non_compliant", f"Rule '{r.get('label', '')}' allows traffic on all ports."
        return "compliant", None

    # --- firewall_rule_descriptions ---
    if ct == "firewall_rule_descriptions":
        if not resource:
            return "not_applicable", None
        all_rules = specs.get("inbound_rules_detail", []) + specs.get("outbound_rules_detail", [])
        for r in all_rules:
            if not (r.get("description") or "").strip():
                return "non_compliant", f"Rule '{r.get('label', 'unnamed')}' is missing a description."
        return "compliant", None

    # --- bucket_cors_check ---
    if ct == "bucket_cors_check":
        if not resource:
            return "not_applicable", None
        cors = specs.get("cors_enabled")
        if cors is None:
            return "not_applicable", "CORS status unknown."
        if cfg.get("require_cors_disabled") and cors:
            return "non_compliant", "CORS is enabled but should be disabled."
        if cfg.get("require_cors_enabled") and not cors:
            return "non_compliant", "CORS is disabled but should be enabled."
        return "compliant", None

    # --- firewall_rfc1918_lateral ---
    if ct == "firewall_rfc1918_lateral":
        if not resource:
            return "not_applicable", None
        sensitive_ports = cfg.get("sensitive_ports", [22, 3389, 3306, 5432, 6379, 27017])
        for r in specs.get("inbound_rules_detail", []):
            if r.get("action") != "ACCEPT":
                continue
            proto = r.get("protocol", "").upper()
            if proto not in ("TCP", "ALL"):
                continue
            addrs = r.get("addresses", {})
            ipv4s = addrs.get("ipv4", [])
            private = [a for a in ipv4s if _is_rfc1918(a)]
            if not private:
                continue
            ports = r.get("ports", "")
            if not ports or proto == "ALL" or _check_port_in_range(ports, sensitive_ports):
                return "non_compliant", f"Rule '{r.get('label','')}' allows RFC-1918 lateral movement on sensitive port(s)."
        return "compliant", None

    # --- firewall_no_duplicate_rules ---
    if ct == "firewall_no_duplicate_rules":
        if not resource:
            return "not_applicable", None
        def fingerprint(r: dict) -> str:
            addrs = r.get("addresses", {})
            ipv4s = sorted(addrs.get("ipv4", []))
            ipv6s = sorted(addrs.get("ipv6", []))
            return f"{r.get('action')}|{r.get('protocol')}|{r.get('ports','')}|{ipv4s}|{ipv6s}"
        for direction, rules in [("inbound", specs.get("inbound_rules_detail", [])),
                                  ("outbound", specs.get("outbound_rules_detail", []))]:
            seen = set()
            for r in rules:
                fp = fingerprint(r)
                if fp in seen:
                    return "non_compliant", f"Duplicate {direction} rule detected: '{r.get('label','')}'."
                seen.add(fp)
        return "compliant", None

    # --- linode_in_vpc ---
    if ct == "linode_in_vpc":
        if not resource:
            return "not_applicable", None
        vpc_ids = specs.get("vpc_ids", [])
        return ("compliant", None) if vpc_ids else ("non_compliant", "Linode is not attached to any VPC.")

    # --- linode_instance_type_restriction ---
    if ct == "linode_instance_type_restriction":
        if not resource:
            return "not_applicable", None
        instance_type = specs.get("instance_type") or ""
        forbidden_prefixes = cfg.get("forbidden_prefixes", [])
        allowed_prefixes = cfg.get("allowed_prefixes", [])
        if forbidden_prefixes:
            for prefix in forbidden_prefixes:
                if instance_type.startswith(prefix):
                    return "non_compliant", f"Instance type '{instance_type}' is forbidden (matches prefix '{prefix}')."
        if allowed_prefixes:
            if not any(instance_type.startswith(p) for p in allowed_prefixes):
                return "non_compliant", f"Instance type '{instance_type}' is not in the allowed prefixes: {allowed_prefixes}."
        return "compliant", None

    # --- linode_age_check ---
    if ct == "linode_age_check":
        if not resource:
            return "not_applicable", None
        created_at = specs.get("created_at") or resource.get("resource_created_at")
        if not created_at:
            return "not_applicable", "Instance creation date is unknown."
        try:
            if isinstance(created_at, datetime):
                created_dt = created_at if created_at.tzinfo else created_at.replace(tzinfo=timezone.utc)
            else:
                raw = str(created_at).replace("Z", "+00:00").replace(" ", "T")
                created_dt = datetime.fromisoformat(raw)
                if created_dt.tzinfo is None:
                    created_dt = created_dt.replace(tzinfo=timezone.utc)
            age_days = (datetime.now(timezone.utc) - created_dt).days
            max_age_days = cfg.get("max_age_days", 365)
            if age_days > max_age_days:
                return "non_compliant", f"Linode has been running for {age_days} days (max: {max_age_days}). Review if this instance is still needed."
            return "compliant", None
        except Exception as e:
            return "not_applicable", f"Could not parse instance creation date: {type(created_at).__name__}={repr(created_at)[:80]} err={e}"

    # --- firewall_outbound_dangerous_ports ---
    if ct == "firewall_outbound_dangerous_ports":
        if not resource:
            return "not_applicable", None
        dangerous_ports = cfg.get("dangerous_ports", [25, 465, 587])
        outbound_rules = specs.get("outbound_rules_detail", [])
        outbound_policy = specs.get("outbound_policy", "ACCEPT")
        if outbound_policy == "ACCEPT" and not outbound_rules:
            for dp in dangerous_ports:
                pass
        for r in outbound_rules:
            if r.get("action") != "ACCEPT":
                continue
            addrs = r.get("addresses", {})
            all_addrs = addrs.get("ipv4", []) + addrs.get("ipv6", [])
            open_addr = any(_is_open_address(a) for a in all_addrs) if all_addrs else True
            if not open_addr:
                continue
            ports = r.get("ports", "")
            proto = r.get("protocol", "").upper()
            if proto in ("ICMP", "IPENCAP"):
                continue
            if not ports or proto == "ALL":
                return "non_compliant", f"Rule '{r.get('label','')}' allows unrestricted outbound on all ports (including dangerous ports {dangerous_ports})."
            if _check_port_in_range(ports, dangerous_ports):
                return "non_compliant", f"Rule '{r.get('label','')}' allows outbound on dangerous port(s): {ports}."
        return "compliant", None

    # --- firewall_cidr_too_broad ---
    if ct == "firewall_cidr_too_broad":
        if not resource:
            return "not_applicable", None
        max_prefix_ipv4 = cfg.get("max_prefix_ipv4", 8)
        check_inbound = cfg.get("check_inbound", True)
        check_outbound = cfg.get("check_outbound", False)
        rules_to_check = []
        if check_inbound:
            rules_to_check.extend(specs.get("inbound_rules_detail", []))
        if check_outbound:
            rules_to_check.extend(specs.get("outbound_rules_detail", []))
        for r in rules_to_check:
            if r.get("action") != "ACCEPT":
                continue
            addrs = r.get("addresses", {})
            for addr in addrs.get("ipv4", []):
                if "/" in addr and not _is_open_address(addr):
                    try:
                        prefix_len = int(addr.split("/")[1])
                        if prefix_len <= max_prefix_ipv4:
                            return "non_compliant", f"Rule '{r.get('label','')}' allows a very broad CIDR: {addr} (/{prefix_len} <= /{max_prefix_ipv4})."
                    except ValueError:
                        pass
        return "compliant", None

    # --- firewall_rule_count ---
    if ct == "firewall_rule_count":
        if not resource:
            return "not_applicable", None
        max_rules = cfg.get("max_rules", 50)
        inbound = specs.get("inbound_rules_detail", [])
        outbound = specs.get("outbound_rules_detail", [])
        total = len(inbound) + len(outbound)
        if total > max_rules:
            return "non_compliant", f"Firewall has {total} rules (max: {max_rules}). Consider simplifying the ruleset."
        return "compliant", None

    # --- lke_node_pool_min_size ---
    if ct == "lke_node_pool_min_size":
        if not resource:
            return "not_applicable", None
        pools = specs.get("pools", [])
        if not pools:
            return "not_applicable", "No node pools found."
        min_per_pool = cfg.get("min_per_pool", 2)
        for pool in pools:
            count = pool.get("count", 0)
            if count < min_per_pool:
                return "non_compliant", f"Node pool '{pool.get('id')}' has {count} node(s), minimum is {min_per_pool} per pool."
        return "compliant", None

    # --- db_backup_recency ---
    if ct == "db_backup_recency":
        if not resource:
            return "not_applicable", None
        updated_at = specs.get("updated_at") or resource.get("updated_at")
        last_backup = specs.get("backups_last_successful") or specs.get("last_backup_at")
        if not last_backup:
            return "not_applicable", "No backup timestamp available for this database."
        try:
            if isinstance(last_backup, datetime):
                last_dt = last_backup if last_backup.tzinfo else last_backup.replace(tzinfo=timezone.utc)
            else:
                last_dt = datetime.fromisoformat(str(last_backup).replace("Z", "+00:00").replace(" ", "T"))
                if last_dt.tzinfo is None:
                    last_dt = last_dt.replace(tzinfo=timezone.utc)
            age = (datetime.now(timezone.utc) - last_dt).days
            max_age = cfg.get("max_age_days", 7)
            return ("compliant", None) if age <= max_age else ("non_compliant", f"Last database backup was {age} days ago (max: {max_age}).")
        except Exception:
            return "not_applicable", "Could not parse database backup timestamp."

    # --- db_maintenance_window ---
    if ct == "db_maintenance_window":
        if not resource:
            return "not_applicable", None
        maintenance = specs.get("maintenance_dow") or specs.get("maintenance_schedule") or specs.get("updates")
        if not maintenance:
            return "non_compliant", "No maintenance window is configured for this database."
        return "compliant", None

    # --- bucket_versioning ---
    if ct == "bucket_versioning":
        if not resource:
            return "not_applicable", None
        versioning = specs.get("versioning")
        if versioning is None:
            return "not_applicable", "Versioning status is unknown for this bucket."
        enabled = versioning in (True, "enabled", "Enabled", "Suspended") if cfg.get("allow_suspended", False) else versioning in (True, "enabled", "Enabled")
        return ("compliant", None) if enabled else ("non_compliant", "Object versioning is not enabled on this bucket.")

    # --- bucket_encryption ---
    if ct == "bucket_encryption":
        if not resource:
            return "not_applicable", None
        encryption = specs.get("encryption") or specs.get("sse_enabled")
        if encryption is None:
            return "not_applicable", "Encryption status is unknown for this bucket."
        return ("compliant", None) if encryption else ("non_compliant", "Server-side encryption is not enabled on this bucket.")

    # --- inactive_users ---
    if ct == "inactive_users":
        logins = client.get_account_logins()
        max_days = cfg.get("max_inactive_days", 90)
        exclude = cfg.get("exclude_user_types", ["proxy"])
        users = client.get_account_users()
        active_usernames: dict[str, datetime] = {}
        for login in logins:
            uname = login.get("username", "")
            login_dt_str = login.get("datetime") or login.get("created")
            if not login_dt_str:
                continue
            try:
                login_dt = datetime.fromisoformat(str(login_dt_str).replace("Z", "+00:00"))
                if uname not in active_usernames or login_dt > active_usernames[uname]:
                    active_usernames[uname] = login_dt
            except Exception:
                pass
        inactive = []
        for u in users:
            if u.get("user_type") in exclude:
                continue
            uname = u.get("username", "")
            last_login = active_usernames.get(uname)
            if last_login is None:
                inactive.append(f"'{uname}' has no recorded logins.")
            else:
                if last_login.tzinfo is None:
                    last_login = last_login.replace(tzinfo=timezone.utc)
                days_since = (datetime.now(timezone.utc) - last_login).days
                if days_since > max_days:
                    inactive.append(f"'{uname}' last logged in {days_since} days ago (max: {max_days}).")
        if inactive:
            return "non_compliant", "; ".join(inactive)
        return "compliant", None

    # --- user_restricted_access ---
    if ct == "user_restricted_access":
        users = client.get_account_users()
        exclude = cfg.get("exclude_user_types", ["proxy"])
        exclude_usernames = cfg.get("exclude_usernames", [])
        unrestricted = []
        for u in users:
            if u.get("user_type") in exclude:
                continue
            if u.get("username") in exclude_usernames:
                continue
            if not u.get("restricted", False):
                unrestricted.append(u.get("username", ""))
        if unrestricted:
            return "non_compliant", f"Users with unrestricted account access: {', '.join(unrestricted)}."
        return "compliant", None

    # --- linode_watchdog_enabled ---
    if ct == "linode_watchdog_enabled":
        if not resource:
            return "not_applicable", None
        val = specs.get("watchdog_enabled")
        if val is None:
            return "not_applicable", "Watchdog status unknown."
        return ("compliant", None) if val else ("non_compliant", "Lassie watchdog is not enabled. Instance will not auto-reboot on crash.")

    # --- linode_alerts_configured ---
    if ct == "linode_alerts_configured":
        if not resource:
            return "not_applicable", None
        alerts = specs.get("alerts") or {}
        if not alerts:
            return "not_applicable", "Alert configuration not available."
        required_alerts = cfg.get("required_alerts", ["cpu", "io", "network_in", "network_out"])
        unconfigured = [a for a in required_alerts if alerts.get(a) is None]
        if unconfigured:
            return "non_compliant", f"Alert thresholds not configured: {', '.join(unconfigured)}."
        return "compliant", None

    # --- linode_private_ip_only ---
    if ct == "linode_private_ip_only":
        if not resource:
            return "not_applicable", None
        ipv4s = specs.get("ipv4") or []
        has_public = any(not _is_rfc1918(ip) for ip in ipv4s)
        has_private = any(_is_rfc1918(ip) for ip in ipv4s)
        if has_public and not has_private:
            return "non_compliant", "Linode has a public IP but no private IP configured."
        return "compliant", None

    # --- firewall_no_icmp_inbound ---
    if ct == "firewall_no_icmp_inbound":
        if not resource:
            return "not_applicable", None
        for r in specs.get("inbound_rules_detail", []):
            if r.get("action") != "ACCEPT":
                continue
            if r.get("protocol", "").upper() != "ICMP":
                continue
            addrs = r.get("addresses", {})
            all_addrs = addrs.get("ipv4", []) + addrs.get("ipv6", [])
            if any(_is_open_address(a) for a in all_addrs) or not all_addrs:
                return "non_compliant", f"Rule '{r.get('label','')}' allows unrestricted inbound ICMP from 0.0.0.0/0."
        return "compliant", None

    # --- db_ssl_required ---
    if ct == "db_ssl_required":
        if not resource:
            return "not_applicable", None
        ssl = specs.get("ssl_connection")
        if ssl is None:
            return "not_applicable", "SSL connection status unknown."
        return ("compliant", None) if ssl else ("non_compliant", "Database does not enforce SSL connections.")

    # --- db_encrypted ---
    if ct == "db_encrypted":
        if not resource:
            return "not_applicable", None
        encrypted = specs.get("encrypted")
        if encrypted is None:
            return "not_applicable", "Database encryption status unknown."
        return ("compliant", None) if encrypted else ("non_compliant", "Database is not encrypted at rest.")

    # --- db_cluster_size_min ---
    if ct == "db_cluster_size_min":
        if not resource:
            return "not_applicable", None
        cluster_size = specs.get("cluster_size")
        if cluster_size is None:
            return "not_applicable", "Cluster size is unknown."
        min_size = cfg.get("min_size", 2)
        return ("compliant", None) if cluster_size >= min_size else ("non_compliant", f"Database cluster has {cluster_size} node(s), minimum is {min_size}.")

    # --- db_version_minimum ---
    if ct == "db_version_minimum":
        if not resource:
            return "not_applicable", None
        engine = specs.get("engine", "")
        version = specs.get("version", "") or specs.get("engine_version", "")
        if not engine or not version:
            return "not_applicable", "Database engine or version is unknown."
        min_versions = cfg.get("min_versions", {})
        min_ver_str = min_versions.get(engine.lower())
        if not min_ver_str:
            return "not_applicable", f"No minimum version configured for engine '{engine}'."
        try:
            def parse_ver(v: str) -> tuple:
                return tuple(int(x) for x in str(v).split(".")[:3])
            current = parse_ver(version)
            minimum = parse_ver(min_ver_str)
            if current < minimum:
                return "non_compliant", f"Database engine '{engine}' version {version} is below minimum {min_ver_str}."
            return "compliant", None
        except Exception:
            return "not_applicable", "Could not parse version numbers."

    # --- lke_version_minimum ---
    if ct == "lke_version_minimum":
        if not resource:
            return "not_applicable", None
        version = specs.get("k8s_version") or specs.get("version")
        if not version:
            return "not_applicable", "Kubernetes version is unknown."
        min_ver_str = cfg.get("min_version", "")
        if not min_ver_str:
            return "not_applicable", "No minimum Kubernetes version configured."
        try:
            def parse_k8s_ver(v: str) -> tuple:
                return tuple(int(x) for x in str(v).split(".")[:2])
            current = parse_k8s_ver(str(version))
            minimum = parse_k8s_ver(min_ver_str)
            if current < minimum:
                return "non_compliant", f"Kubernetes version {version} is below minimum {min_ver_str}."
            return "compliant", None
        except Exception:
            return "not_applicable", "Could not parse Kubernetes version."

    # --- lke_in_vpc ---
    if ct == "lke_in_vpc":
        if not resource:
            return "not_applicable", None
        vpc_id = specs.get("vpc_id") or specs.get("vpc_ids")
        has_vpc = bool(vpc_id and (not isinstance(vpc_id, list) or len(vpc_id) > 0))
        return ("compliant", None) if has_vpc else ("non_compliant", "LKE cluster is not attached to any VPC.")

    # --- lke_node_pool_type_restriction ---
    if ct == "lke_node_pool_type_restriction":
        if not resource:
            return "not_applicable", None
        pools = specs.get("pools", [])
        if not pools:
            return "not_applicable", "No node pools found."
        forbidden_prefixes = cfg.get("forbidden_prefixes", [])
        allowed_prefixes = cfg.get("allowed_prefixes", [])
        for pool in pools:
            pool_type = pool.get("type", "")
            if forbidden_prefixes:
                for prefix in forbidden_prefixes:
                    if pool_type.startswith(prefix):
                        return "non_compliant", f"Node pool '{pool.get('id')}' uses forbidden type '{pool_type}' (matches prefix '{prefix}')."
            if allowed_prefixes:
                if not any(pool_type.startswith(p) for p in allowed_prefixes):
                    return "non_compliant", f"Node pool '{pool.get('id')}' uses type '{pool_type}' which is not in the allowed prefixes: {allowed_prefixes}."
        return "compliant", None

    # --- nodebalancer_connection_throttle ---
    if ct == "nodebalancer_connection_throttle":
        if not resource:
            return "not_applicable", None
        configs = specs.get("configs", [])
        if not configs:
            return "not_applicable", "No configs found."
        min_throttle = cfg.get("min_throttle", 1)
        for c in configs:
            throttle = c.get("client_conn_throttle", 0)
            if throttle < min_throttle:
                return "non_compliant", f"Port {c.get('port')} has connection throttle set to {throttle} (minimum: {min_throttle})."
        return "compliant", None

    # --- domain_active ---
    if ct == "domain_active":
        if not resource:
            return "not_applicable", None
        status = specs.get("status", "")
        allowed_statuses = cfg.get("allowed_statuses", ["active"])
        return ("compliant", None) if status in allowed_statuses else ("non_compliant", f"Domain status is '{status}', expected one of: {allowed_statuses}.")

    # --- domain_ttl_minimum ---
    if ct == "domain_ttl_minimum":
        if not resource:
            return "not_applicable", None
        ttl = specs.get("ttl_sec")
        if ttl is None:
            return "not_applicable", "Domain TTL is unknown."
        min_ttl = cfg.get("min_ttl_sec", 300)
        return ("compliant", None) if ttl >= min_ttl else ("non_compliant", f"Domain TTL is {ttl}s, minimum is {min_ttl}s.")

    # --- domain_has_soa_email ---
    if ct == "domain_has_soa_email":
        if not resource:
            return "not_applicable", None
        soa_email = (specs.get("soa_email") or "").strip()
        return ("compliant", None) if soa_email else ("non_compliant", "Domain is missing an SOA administrative contact email.")

    # --- user_ssh_keys_configured ---
    if ct == "user_ssh_keys_configured":
        users = client.get_account_users()
        exclude = cfg.get("exclude_user_types", ["proxy"])
        missing_keys = []
        for u in users:
            if u.get("user_type") in exclude:
                continue
            ssh_keys = u.get("ssh_keys", [])
            if not ssh_keys:
                missing_keys.append(u.get("username", ""))
        if missing_keys:
            return "non_compliant", f"Users with no SSH keys registered: {', '.join(missing_keys)}."
        return "compliant", None

    return "not_applicable", f"Unknown condition type: {ct}"


def evaluate_account(account_id: str, api_token: str, db, log: list) -> dict:
    from datetime import datetime, timezone
    import json

    now = datetime.now(timezone.utc)
    client = LinodeClient(api_token)
    cur = db.cursor()

    def logmsg(msg: str):
        log.append(f"[{account_id[:8]}] {msg}")

    logmsg("Starting compliance evaluation...")

    # --- Phase 1: Read all needed data from DB (hold connection briefly) ---
    cur.execute("SELECT * FROM resources WHERE account_id = %s", (account_id,))
    all_resources = [dict(r) for r in cur.fetchall()]

    cur.execute("""
        SELECT DISTINCT unnest(cp.rule_condition_types) AS condition_type
        FROM account_compliance_profiles acp
        JOIN compliance_profiles cp ON cp.id = acp.profile_id
        WHERE acp.account_id = %s
    """, (account_id,))
    profile_condition_types = {row["condition_type"] for row in cur.fetchall()}

    has_active_profiles = len(profile_condition_types) > 0

    if has_active_profiles:
        cur.execute("""
            SELECT r.* FROM compliance_rules r
            WHERE (r.account_id IS NULL OR r.account_id = %s)
              AND r.is_active = TRUE
              AND NOT EXISTS (
                SELECT 1 FROM account_rule_overrides aro
                WHERE aro.account_id = %s AND aro.rule_id = r.id AND aro.is_active = FALSE
              )
              AND (
                r.condition_type = ANY(%s::text[])
                OR EXISTS (
                  SELECT 1 FROM account_rule_overrides aro2
                  WHERE aro2.account_id = %s AND aro2.rule_id = r.id AND aro2.is_active = TRUE
                    AND aro2.applied_by_profile_id IS NULL
                )
              )
            ORDER BY r.severity, r.name
        """, (account_id, account_id, list(profile_condition_types), account_id))
    else:
        cur.execute("""
            SELECT r.* FROM compliance_rules r
            WHERE (r.account_id IS NULL OR r.account_id = %s)
              AND r.is_active = TRUE
              AND NOT EXISTS (
                SELECT 1 FROM account_rule_overrides aro
                WHERE aro.account_id = %s AND aro.rule_id = r.id AND aro.is_active = FALSE
              )
            ORDER BY r.severity, r.name
        """, (account_id, account_id))
    rules = [dict(r) for r in cur.fetchall()]

    cur.execute("""
        SELECT rule_id, config_override FROM account_rule_configs WHERE account_id = %s
    """, (account_id,))
    config_overrides = {str(row["rule_id"]): row["config_override"] for row in cur.fetchall()}
    for rule in rules:
        override = config_overrides.get(str(rule["id"]))
        if override:
            merged = dict(rule.get("condition_config") or {})
            merged.update(override)
            rule["condition_config"] = merged

    cur.execute("""
        SELECT rule_id, resource_id, acknowledged, acknowledged_at,
               acknowledged_note, acknowledged_by
        FROM compliance_results
        WHERE account_id = %s AND acknowledged = TRUE
    """, (account_id,))
    ack_map: dict[str, dict] = {}
    for row in cur.fetchall():
        key = f"{row['rule_id']}:{row['resource_id'] or 'null'}"
        ack_map[key] = dict(row)

    # --- Phase 2: Evaluate rules (may make external API calls, no DB connection held) ---
    logmsg("Evaluating compliance rules...")
    results_to_insert = []

    for rule in rules:
        rt = rule.get("resource_types") or []
        ct = rule["condition_type"]

        if ct == "composite":
            continue

        if not rt:
            status, detail = evaluate_rule(rule, None, all_resources, api_token, client)
            key = f"{rule['id']}:null"
            ack = ack_map.get(key, {})
            results_to_insert.append((
                rule["id"], None, account_id, status, detail,
                ack.get("acknowledged", False), ack.get("acknowledged_at"),
                ack.get("acknowledged_note"), ack.get("acknowledged_by"), now
            ))
        else:
            matching = [r for r in all_resources if r["resource_type"] in rt]
            for res in matching:
                status, detail = evaluate_rule(rule, res, all_resources, api_token, client)
                key = f"{rule['id']}:{res['id']}"
                ack = ack_map.get(key, {})
                results_to_insert.append((
                    rule["id"], res["id"], account_id, status, detail,
                    ack.get("acknowledged", False), ack.get("acknowledged_at"),
                    ack.get("acknowledged_note"), ack.get("acknowledged_by"), now
                ))

    # --- Phase 3: Write results back to DB ---
    logmsg("Writing compliance results...")
    cur.execute("DELETE FROM compliance_results WHERE account_id = %s", (account_id,))

    for row in results_to_insert:
        cur.execute("""
            INSERT INTO compliance_results
            (rule_id, resource_id, account_id, status, detail,
             acknowledged, acknowledged_at, acknowledged_note, acknowledged_by, evaluated_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, row)

    # Compute score
    total = len(results_to_insert)
    unacked = [r for r in results_to_insert if not r[5]]
    compliant = sum(1 for r in unacked if r[3] == "compliant")
    non_compliant = sum(1 for r in unacked if r[3] == "non_compliant")
    not_applicable = sum(1 for r in unacked if r[3] == "not_applicable")
    acknowledged = sum(1 for r in results_to_insert if r[5])
    scoreable = compliant + non_compliant
    score = round(compliant / scoreable * 100, 2) if scoreable > 0 else None

    rule_breakdown = []
    rule_map = {r["id"]: r for r in rules}
    rule_stats: dict[str, dict] = {}
    for row in results_to_insert:
        rid = str(row[0])
        if rid not in rule_stats:
            rule_stats[rid] = {"compliant": 0, "non_compliant": 0, "not_applicable": 0}
        rule_stats[rid][row[3]] += 1
    for rid, stats in rule_stats.items():
        rule = rule_map.get(rid)
        if rule:
            rule_breakdown.append({
                "rule_id": rid,
                "rule_name": rule["name"],
                "severity": rule["severity"],
                **stats,
            })

    cur.execute("""
        INSERT INTO compliance_score_history
        (account_id, evaluated_at, total_results, compliant_count, non_compliant_count,
         not_applicable_count, acknowledged_count, compliance_score, total_rules_evaluated, rule_breakdown)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    """, (account_id, now, total, compliant, non_compliant, not_applicable,
          acknowledged, score, len(rules), json.dumps(rule_breakdown)))

    # Per-resource history
    res_map: dict[str, list] = {}
    for row in results_to_insert:
        if row[1]:
            res_id = str(row[1])
            if res_id not in res_map:
                res_map[res_id] = []
            rule = rule_map.get(str(row[0]))
            res_map[res_id].append({
                "rule_id": str(row[0]),
                "rule_name": rule["name"] if rule else "",
                "severity": rule["severity"] if rule else "info",
                "status": row[3],
                "detail": row[4],
                "acknowledged": row[5],
            })
    for res_id, res_results in res_map.items():
        cur.execute("""
            INSERT INTO resource_compliance_history (account_id, resource_id, evaluated_at, results)
            VALUES (%s,%s,%s,%s)
        """, (account_id, res_id, now, json.dumps(res_results)))

    cur.execute("UPDATE linode_accounts SET last_evaluated_at=%s, updated_at=NOW() WHERE id=%s", (now, account_id))

    logmsg(f"Evaluation complete. {len(results_to_insert)} results. Score: {score}%")
    return {
        "evaluated": len(results_to_insert),
        "compliant": compliant,
        "non_compliant": non_compliant,
        "score": score,
    }
