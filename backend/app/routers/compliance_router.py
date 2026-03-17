from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional
from psycopg2 import sql as pgsql
from app.database import get_db
from app.auth import get_current_user, require_admin, require_power_or_admin

_ALLOWED_STATUS = {"compliant", "non_compliant", "not_applicable"}
_ALLOWED_SEVERITY = {"critical", "warning", "info"}

router = APIRouter(prefix="/api/compliance", tags=["compliance"])


def _user_can_access(user: dict, account_id: str, db) -> bool:
    if user["role"] == "admin":
        return True
    cur = db.cursor()
    cur.execute(
        "SELECT id FROM user_account_access WHERE user_id = %s AND account_id = %s",
        (str(user["id"]), account_id),
    )
    return cur.fetchone() is not None


@router.get("/results")
def get_results(
    account_id: str = Query(...),
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    rule_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if not _user_can_access(current_user, account_id, db):
        raise HTTPException(status_code=403, detail="Access denied")

    if status and status not in _ALLOWED_STATUS:
        raise HTTPException(status_code=400, detail="Invalid status value")
    if severity and severity not in _ALLOWED_SEVERITY:
        raise HTTPException(status_code=400, detail="Invalid severity value")

    cur = db.cursor()
    where_parts = [pgsql.SQL("cr.account_id = %s")]
    params = [account_id]

    if status:
        where_parts.append(pgsql.SQL("cr.status = %s"))
        params.append(status)
    if severity:
        where_parts.append(pgsql.SQL("rule.severity = %s"))
        params.append(severity)
    if resource_type:
        where_parts.append(pgsql.SQL("res.resource_type = %s"))
        params.append(resource_type)
    if rule_id:
        where_parts.append(pgsql.SQL("cr.rule_id = %s"))
        params.append(rule_id)
    if search:
        where_parts.append(pgsql.SQL("(rule.name ILIKE %s OR res.label ILIKE %s OR cr.detail ILIKE %s)"))
        params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])

    query = pgsql.SQL("""
        SELECT
            cr.id, cr.rule_id, cr.resource_id, cr.account_id, cr.status,
            cr.detail, cr.acknowledged, cr.acknowledged_at, cr.acknowledged_note,
            cr.acknowledged_by, u.full_name as acknowledged_by_name,
            cr.evaluated_at, cr.created_at,
            row_to_json(rule.*) as rule,
            row_to_json(res.*) as resource
        FROM compliance_results cr
        JOIN compliance_rules rule ON rule.id = cr.rule_id
        LEFT JOIN resources res ON res.id = cr.resource_id
        LEFT JOIN org_users u ON u.id = cr.acknowledged_by
        WHERE {where}
        ORDER BY
            CASE cr.status WHEN 'non_compliant' THEN 1 WHEN 'compliant' THEN 2 ELSE 3 END,
            CASE rule.severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END
    """).format(where=pgsql.SQL(" AND ").join(where_parts))
    cur.execute(query, params)
    return [dict(r) for r in cur.fetchall()]


@router.get("/score")
def get_score(account_id: str = Query(...), current_user=Depends(get_current_user), db=Depends(get_db)):
    if not _user_can_access(current_user, account_id, db):
        raise HTTPException(status_code=403, detail="Access denied")
    cur = db.cursor()

    cur.execute("""
        SELECT
            cr.rule_id,
            rule.name as rule_name,
            rule.severity,
            CASE WHEN cr.acknowledged = TRUE THEN 'compliant' ELSE cr.status END as effective_status
        FROM compliance_results cr
        JOIN compliance_rules rule ON rule.id = cr.rule_id
        WHERE cr.account_id = %s
          AND cr.status != 'not_applicable'
    """, (account_id,))
    rows = cur.fetchall()

    if not rows:
        cur.execute("""
            SELECT * FROM compliance_score_history
            WHERE account_id = %s
            ORDER BY evaluated_at DESC LIMIT 1
        """, (account_id,))
        row = cur.fetchone()
        return dict(row) if row else {}

    compliant = sum(1 for r in rows if r["effective_status"] == "compliant")
    non_compliant = sum(1 for r in rows if r["effective_status"] == "non_compliant")
    total = compliant + non_compliant
    compliance_score = round((compliant / total) * 100, 1) if total > 0 else None

    rule_breakdown = {}
    for r in rows:
        rid = str(r["rule_id"])
        if rid not in rule_breakdown:
            rule_breakdown[rid] = {"rule_id": rid, "rule_name": r["rule_name"], "severity": r["severity"], "compliant": 0, "non_compliant": 0}
        if r["effective_status"] == "compliant":
            rule_breakdown[rid]["compliant"] += 1
        elif r["effective_status"] == "non_compliant":
            rule_breakdown[rid]["non_compliant"] += 1

    cur.execute("""
        SELECT evaluated_at FROM compliance_score_history
        WHERE account_id = %s ORDER BY evaluated_at DESC LIMIT 1
    """, (account_id,))
    score_row = cur.fetchone()
    evaluated_at = score_row["evaluated_at"].isoformat() if score_row else None

    return {
        "account_id": account_id,
        "compliance_score": compliance_score,
        "compliant_count": compliant,
        "non_compliant_count": non_compliant,
        "total_checks": total,
        "evaluated_at": evaluated_at,
        "rule_breakdown": list(rule_breakdown.values()),
    }


@router.get("/score/history")
def get_score_history(
    account_id: str = Query(...),
    limit: int = Query(30, ge=1, le=500),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if not _user_can_access(current_user, account_id, db):
        raise HTTPException(status_code=403, detail="Access denied")
    cur = db.cursor()
    cur.execute("""
        SELECT * FROM compliance_score_history
        WHERE account_id = %s
        ORDER BY evaluated_at DESC LIMIT %s
    """, (account_id, limit))
    return [dict(r) for r in cur.fetchall()]


class AcknowledgeRequest(BaseModel):
    acknowledged: bool
    acknowledged_note: Optional[str] = None


class BulkAcknowledgeRequest(BaseModel):
    result_ids: list[str] = Field(..., min_length=1, max_length=500)
    acknowledged: bool
    acknowledged_note: Optional[str] = None


@router.put("/results/bulk-acknowledge")
def bulk_acknowledge_results(
    body: BulkAcknowledgeRequest,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if not body.result_ids:
        return {"ok": True, "updated": 0}

    cur = db.cursor()
    id_placeholders = pgsql.SQL(", ").join(pgsql.Placeholder() * len(body.result_ids))
    cur.execute(
        pgsql.SQL("SELECT id, account_id FROM compliance_results WHERE id IN ({ids})").format(
            ids=id_placeholders
        ),
        body.result_ids,
    )
    rows = cur.fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail="No results found")

    account_ids = {str(r["account_id"]) for r in rows}
    for aid in account_ids:
        if not _user_can_access(current_user, aid, db):
            raise HTTPException(status_code=403, detail="Access denied")

    ids = [str(r["id"]) for r in rows]
    upd_placeholders = pgsql.SQL(", ").join(pgsql.Placeholder() * len(ids))
    if body.acknowledged:
        cur.execute(
            pgsql.SQL("""
            UPDATE compliance_results
            SET acknowledged = TRUE, acknowledged_at = NOW(),
                acknowledged_note = %s, acknowledged_by = %s
            WHERE id IN ({ids})
            """).format(ids=upd_placeholders),
            [body.acknowledged_note, str(current_user["id"])] + ids,
        )
    else:
        cur.execute(
            pgsql.SQL("""
            UPDATE compliance_results
            SET acknowledged = FALSE, acknowledged_at = NULL,
                acknowledged_note = NULL, acknowledged_by = NULL
            WHERE id IN ({ids})
            """).format(ids=upd_placeholders),
            ids,
        )
    return {"ok": True, "updated": len(ids)}


@router.put("/results/{result_id}/acknowledge")
def acknowledge_result(
    result_id: str,
    body: AcknowledgeRequest,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    cur = db.cursor()
    cur.execute("SELECT account_id FROM compliance_results WHERE id = %s", (result_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Result not found")
    if not _user_can_access(current_user, str(row["account_id"]), db):
        raise HTTPException(status_code=403, detail="Access denied")

    if body.acknowledged:
        cur.execute("""
            UPDATE compliance_results
            SET acknowledged = TRUE, acknowledged_at = NOW(),
                acknowledged_note = %s, acknowledged_by = %s
            WHERE id = %s
            RETURNING id, acknowledged, acknowledged_at, acknowledged_note
        """, (body.acknowledged_note, str(current_user["id"]), result_id))
    else:
        cur.execute("""
            UPDATE compliance_results
            SET acknowledged = FALSE, acknowledged_at = NULL,
                acknowledged_note = NULL, acknowledged_by = NULL
            WHERE id = %s
            RETURNING id, acknowledged
        """, (result_id,))
    return dict(cur.fetchone())


class NoteCreate(BaseModel):
    note: str


@router.post("/results/{result_id}/notes")
def add_note(
    result_id: str,
    body: NoteCreate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    cur = db.cursor()
    cur.execute("SELECT account_id FROM compliance_results WHERE id = %s", (result_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Result not found")
    account_id = str(row["account_id"])
    if not _user_can_access(current_user, account_id, db):
        raise HTTPException(status_code=403, detail="Access denied")

    cur.execute("""
        INSERT INTO compliance_result_notes (compliance_result_id, account_id, note, created_by)
        VALUES (%s, %s, %s, %s)
        RETURNING id, note, created_at
    """, (result_id, account_id, body.note, str(current_user["id"])))
    return dict(cur.fetchone())


@router.get("/results/{result_id}/notes")
def get_notes(result_id: str, current_user=Depends(get_current_user), db=Depends(get_db)):
    cur = db.cursor()
    cur.execute("SELECT account_id FROM compliance_results WHERE id = %s", (result_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Result not found")
    if not _user_can_access(current_user, str(row["account_id"]), db):
        raise HTTPException(status_code=403, detail="Access denied")

    cur.execute("""
        SELECT n.*, u.full_name as author_name
        FROM compliance_result_notes n
        LEFT JOIN org_users u ON u.id = n.created_by
        WHERE n.compliance_result_id = %s
        ORDER BY n.created_at DESC
    """, (result_id,))
    return [dict(r) for r in cur.fetchall()]


@router.get("/resources/{resource_id}/timeline")
def get_resource_timeline(
    resource_id: str,
    account_id: str = Query(...),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if not _user_can_access(current_user, account_id, db):
        raise HTTPException(status_code=403, detail="Access denied")
    cur = db.cursor()

    cur.execute("""
        SELECT
            rch.evaluated_at AS snapshot_time,
            COUNT(*) FILTER (WHERE r->>'status' = 'compliant') AS compliant,
            COUNT(*) FILTER (WHERE r->>'status' = 'non_compliant') AS non_compliant,
            COUNT(*) FILTER (WHERE r->>'status' = 'not_applicable') AS not_applicable,
            COUNT(*) AS total,
            ROUND(
                COUNT(*) FILTER (WHERE r->>'status' = 'compliant') * 100.0 /
                NULLIF(COUNT(*) FILTER (WHERE r->>'status' IN ('compliant','non_compliant')), 0),
                1
            ) AS compliance_score
        FROM resource_compliance_history rch,
             jsonb_array_elements(rch.results) AS r
        WHERE rch.resource_id = %s AND rch.account_id = %s
        GROUP BY rch.evaluated_at
        ORDER BY snapshot_time ASC
    """, (resource_id, account_id))
    snapshots = [dict(r) for r in cur.fetchall()]

    for s in snapshots:
        if hasattr(s.get('snapshot_time'), 'isoformat'):
            s['snapshot_time'] = s['snapshot_time'].isoformat()
        s['compliant'] = int(s['compliant'])
        s['non_compliant'] = int(s['non_compliant'])
        s['not_applicable'] = int(s['not_applicable'])
        s['total'] = int(s['total'])
        if s['compliance_score'] is not None:
            s['compliance_score'] = float(s['compliance_score'])

    cur.execute("""
        SELECT
            r->>'rule_id' AS rule_id,
            r->>'rule_name' AS rule_name,
            r->>'severity' AS severity,
            rch.evaluated_at AS snapshot_time,
            r->>'status' AS status,
            r->>'detail' AS detail
        FROM resource_compliance_history rch,
             jsonb_array_elements(rch.results) AS r
        WHERE rch.resource_id = %s AND rch.account_id = %s
        ORDER BY rch.evaluated_at ASC, r->>'severity', r->>'rule_name'
    """, (resource_id, account_id))
    rule_history = []
    for r in cur.fetchall():
        row = dict(r)
        if hasattr(row.get('snapshot_time'), 'isoformat'):
            row['snapshot_time'] = row['snapshot_time'].isoformat()
        rule_history.append(row)

    return {"snapshots": snapshots, "rule_history": rule_history}


@router.get("/rules")
def list_rules(
    account_id: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    cur = db.cursor()
    if account_id:
        if not _user_can_access(current_user, account_id, db):
            raise HTTPException(status_code=403, detail="Access denied")
        cur.execute("""
            SELECT r.*,
                   CASE WHEN aro.is_active = FALSE THEN TRUE ELSE FALSE END as is_overridden_disabled
            FROM compliance_rules r
            LEFT JOIN account_rule_overrides aro
                ON aro.rule_id = r.id AND aro.account_id = %s AND aro.is_active = FALSE
            WHERE r.account_id IS NULL OR r.account_id = %s
            ORDER BY r.severity, r.name
        """, (account_id, account_id))
    else:
        if current_user["role"] not in ("admin", "power_user"):
            raise HTTPException(status_code=403, detail="Admin access required")
        cur.execute("""
            SELECT *, FALSE as is_overridden_disabled
            FROM compliance_rules
            WHERE account_id IS NULL ORDER BY severity, name
        """)
    return [dict(r) for r in cur.fetchall()]


@router.get("/profiles")
def list_profiles(current_user=Depends(get_current_user), db=Depends(get_db)):
    cur = db.cursor()
    cur.execute("SELECT * FROM compliance_profiles ORDER BY tier, name")
    profiles = [dict(r) for r in cur.fetchall()]

    cur.execute("""
        SELECT ARRAY_AGG(DISTINCT condition_type ORDER BY condition_type) AS all_condition_types
        FROM compliance_rules
        WHERE account_id IS NULL AND is_active = TRUE
    """)
    row = cur.fetchone()
    live_condition_types_set = set(row["all_condition_types"] or []) if row else set()
    live_condition_types = sorted(live_condition_types_set)

    for p in profiles:
        if p.get("slug") == "all-rules":
            p["rule_condition_types"] = live_condition_types
        else:
            p["rule_condition_types"] = [
                ct for ct in (p.get("rule_condition_types") or [])
                if ct in live_condition_types_set
            ]

    return profiles


@router.get("/profiles/active")
def get_active_profiles(
    account_id: str = Query(...),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if not _user_can_access(current_user, account_id, db):
        raise HTTPException(status_code=403, detail="Access denied")
    cur = db.cursor()
    cur.execute("""
        SELECT p.* FROM compliance_profiles p
        JOIN account_compliance_profiles acp ON acp.profile_id = p.id
        WHERE acp.account_id = %s AND acp.is_active = TRUE
        ORDER BY p.tier, p.name
    """, (account_id,))
    return [dict(r) for r in cur.fetchall()]


class SetProfilesRequest(BaseModel):
    profile_ids: list[str]


@router.put("/profiles/active")
def set_active_profiles(
    account_id: str = Query(...),
    body: SetProfilesRequest = ...,
    current_user=Depends(require_power_or_admin),
    db=Depends(get_db),
):
    if not _user_can_access(current_user, account_id, db):
        raise HTTPException(status_code=403, detail="Access denied")
    cur = db.cursor()
    cur.execute("DELETE FROM account_compliance_profiles WHERE account_id = %s", (account_id,))
    for pid in body.profile_ids:
        cur.execute("""
            INSERT INTO account_compliance_profiles (account_id, profile_id, is_active)
            VALUES (%s, %s, TRUE)
            ON CONFLICT (account_id, profile_id) DO UPDATE SET is_active = TRUE
        """, (account_id, pid))
    return {"ok": True, "profile_ids": body.profile_ids}


class RuleOverrideRequest(BaseModel):
    is_active: bool


@router.put("/rules/{rule_id}/override")
def set_rule_override(
    rule_id: str,
    account_id: str = Query(...),
    body: RuleOverrideRequest = ...,
    current_user=Depends(require_power_or_admin),
    db=Depends(get_db),
):
    if not _user_can_access(current_user, account_id, db):
        raise HTTPException(status_code=403, detail="Access denied")
    cur = db.cursor()
    cur.execute("SELECT id FROM compliance_rules WHERE id = %s", (rule_id,))
    if not cur.fetchone():
        raise HTTPException(status_code=404, detail="Rule not found")

    if body.is_active:
        cur.execute("""
            DELETE FROM account_rule_overrides
            WHERE account_id = %s AND rule_id = %s AND is_active = FALSE
        """, (account_id, rule_id))
    else:
        cur.execute("""
            INSERT INTO account_rule_overrides (account_id, rule_id, is_active, created_by)
            VALUES (%s, %s, FALSE, %s)
            ON CONFLICT (account_id, rule_id) DO UPDATE SET is_active = FALSE
        """, (account_id, rule_id, str(current_user["id"])))
    return {"ok": True, "rule_id": rule_id, "is_active": body.is_active}


class ProfileActivateRequest(BaseModel):
    account_id: str
    active: bool


@router.put("/profiles/{profile_id}/activate")
def toggle_profile(
    profile_id: str,
    body: ProfileActivateRequest,
    current_user=Depends(require_power_or_admin),
    db=Depends(get_db),
):
    if not _user_can_access(current_user, body.account_id, db):
        raise HTTPException(status_code=403, detail="Access denied")
    cur = db.cursor()
    if body.active:
        cur.execute("""
            DELETE FROM account_compliance_profiles
            WHERE account_id = %s AND profile_id != %s
        """, (body.account_id, profile_id))
        cur.execute("""
            INSERT INTO account_compliance_profiles (account_id, profile_id)
            VALUES (%s, %s)
            ON CONFLICT DO NOTHING
        """, (body.account_id, profile_id))
        cur.execute("""
            SELECT slug, rule_condition_types FROM compliance_profiles WHERE id = %s
        """, (profile_id,))
        profile = cur.fetchone()
        if profile:
            cur.execute("""
                SELECT ARRAY_AGG(DISTINCT condition_type) AS cts
                FROM compliance_rules WHERE account_id IS NULL AND is_active = TRUE
            """)
            cts_row = cur.fetchone()
            live_cts = set(cts_row["cts"] or []) if cts_row else set()
            if profile["slug"] == "all-rules":
                condition_types = list(live_cts)
            else:
                condition_types = [ct for ct in (profile["rule_condition_types"] or []) if ct in live_cts]
            for ct in condition_types:
                cur.execute("""
                    SELECT id FROM compliance_rules WHERE condition_type = %s AND (account_id IS NULL OR account_id = %s)
                """, (ct, body.account_id))
                for rule in cur.fetchall():
                    cur.execute("""
                        INSERT INTO account_rule_overrides (account_id, rule_id, is_active, applied_by_profile_id)
                        VALUES (%s, %s, TRUE, %s)
                        ON CONFLICT (account_id, rule_id) DO UPDATE SET is_active = TRUE, updated_at = NOW()
                    """, (body.account_id, rule["id"], profile_id))
    else:
        cur.execute("""
            DELETE FROM account_compliance_profiles
            WHERE account_id = %s AND profile_id = %s
        """, (body.account_id, profile_id))
    db.commit()
    return {"ok": True}


@router.get("/rules/overrides")
def get_rule_overrides(
    account_id: str = Query(...),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if not _user_can_access(current_user, account_id, db):
        raise HTTPException(status_code=403, detail="Access denied")
    cur = db.cursor()
    cur.execute("""
        SELECT * FROM account_rule_overrides WHERE account_id = %s
    """, (account_id,))
    return [dict(r) for r in cur.fetchall()]


class RuleConfigRequest(BaseModel):
    account_id: str
    config_override: dict


@router.get("/rules/{rule_id}/config")
def get_rule_config(
    rule_id: str,
    account_id: str = Query(...),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if not _user_can_access(current_user, account_id, db):
        raise HTTPException(status_code=403, detail="Access denied")
    cur = db.cursor()
    cur.execute("""
        SELECT * FROM account_rule_configs WHERE account_id = %s AND rule_id = %s
    """, (account_id, rule_id))
    row = cur.fetchone()
    if not row:
        cur.execute("SELECT condition_config FROM compliance_rules WHERE id = %s", (rule_id,))
        rule = cur.fetchone()
        return {"rule_id": rule_id, "account_id": account_id, "config_override": rule["condition_config"] if rule else {}}
    return dict(row)


@router.put("/rules/{rule_id}/config")
def set_rule_config(
    rule_id: str,
    body: RuleConfigRequest,
    current_user=Depends(require_power_or_admin),
    db=Depends(get_db),
):
    if not _user_can_access(current_user, body.account_id, db):
        raise HTTPException(status_code=403, detail="Access denied")
    cur = db.cursor()
    import json
    cur.execute("""
        INSERT INTO account_rule_configs (account_id, rule_id, config_override, created_by)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (account_id, rule_id) DO UPDATE
          SET config_override = %s, updated_at = NOW()
        RETURNING *
    """, (body.account_id, rule_id, json.dumps(body.config_override), str(current_user["id"]),
          json.dumps(body.config_override)))
    return dict(cur.fetchone())
