from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from decimal import Decimal
import json
import uuid
from app.database import get_db
from app.auth import get_current_user


class _DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _user_can_access(user: dict, account_id: str, db) -> bool:
    if user["role"] == "admin":
        return True
    cur = db.cursor()
    cur.execute(
        "SELECT id FROM user_account_access WHERE user_id = %s AND account_id = %s",
        (str(user["id"]), account_id),
    )
    return cur.fetchone() is not None


class CreateReportRequest(BaseModel):
    account_id: str
    title: str
    description: Optional[str] = ""
    period_start: str
    period_end: str
    quarter: Optional[str] = None


@router.get("")
def list_reports(
    account_id: str = Query(...),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if not _user_can_access(current_user, account_id, db):
        raise HTTPException(status_code=403, detail="Access denied")
    cur = db.cursor()
    cur.execute(
        """
        SELECT id, account_id, title, description, period_start, period_end,
               quarter, status, created_by, created_at, updated_at,
               snapshot->'summary' AS snapshot_summary
        FROM reports
        WHERE account_id = %s
        ORDER BY created_at DESC
        """,
        (account_id,),
    )
    rows = []
    for r in cur.fetchall():
        row = dict(r)
        summary = row.pop("snapshot_summary", None)
        if summary:
            if isinstance(summary, str):
                import json as _json
                summary = _json.loads(summary)
            row["snapshot"] = {"summary": summary}
        else:
            row["snapshot"] = None
        rows.append(row)
    return rows


@router.get("/{report_id}")
def get_report(
    report_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    cur = db.cursor()
    cur.execute("SELECT * FROM reports WHERE id = %s", (report_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    report = dict(row)
    if not _user_can_access(current_user, str(report["account_id"]), db):
        raise HTTPException(status_code=403, detail="Access denied")
    return report


@router.post("")
def create_report(
    body: CreateReportRequest,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if not _user_can_access(current_user, body.account_id, db):
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        period_start = datetime.fromisoformat(body.period_start.replace("Z", "+00:00"))
        period_end = datetime.fromisoformat(body.period_end.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format for period_start or period_end")

    if period_start >= period_end:
        raise HTTPException(status_code=400, detail="period_start must be before period_end")

    report_id = str(uuid.uuid4())
    cur = db.cursor()
    cur.execute(
        """
        INSERT INTO reports (id, account_id, title, description, period_start, period_end, quarter, status, created_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s, 'generating', %s)
        RETURNING id
        """,
        (
            report_id,
            body.account_id,
            body.title,
            body.description or "",
            period_start,
            period_end,
            body.quarter,
            str(current_user["id"]),
        ),
    )
    db.commit()

    snapshot = _build_snapshot(body.account_id, period_start, period_end, db)

    cur.execute(
        "UPDATE reports SET status = 'ready', snapshot = %s, updated_at = now() WHERE id = %s",
        (json.dumps(snapshot, cls=_DecimalEncoder), report_id),
    )
    db.commit()

    cur.execute("SELECT * FROM reports WHERE id = %s", (report_id,))
    return dict(cur.fetchone())


@router.delete("/{report_id}")
def delete_report(
    report_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    cur = db.cursor()
    cur.execute("SELECT * FROM reports WHERE id = %s", (report_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    report = dict(row)
    if not _user_can_access(current_user, str(report["account_id"]), db):
        raise HTTPException(status_code=403, detail="Access denied")
    cur.execute("DELETE FROM reports WHERE id = %s", (report_id,))
    db.commit()
    return {"success": True}


def _build_snapshot(account_id: str, period_start: datetime, period_end: datetime, db) -> dict:
    cur = db.cursor()

    cur.execute(
        """
        SELECT
            cr.id, cr.rule_id, cr.resource_id, cr.status, cr.detail,
            cr.acknowledged, cr.acknowledged_at, cr.acknowledged_note,
            cr.evaluated_at,
            rule.name as rule_name, rule.severity, rule.description as rule_description,
            res.label as resource_label, res.resource_type, res.region
        FROM compliance_results cr
        JOIN compliance_rules rule ON rule.id = cr.rule_id
        LEFT JOIN resources res ON res.id = cr.resource_id
        WHERE cr.account_id = %s
          AND cr.evaluated_at >= %s
          AND cr.evaluated_at <= %s
        ORDER BY
            CASE cr.status WHEN 'non_compliant' THEN 1 WHEN 'compliant' THEN 2 ELSE 3 END,
            CASE rule.severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END
        """,
        (account_id, period_start, period_end),
    )
    results = [dict(r) for r in cur.fetchall()]

    if not results:
        cur.execute(
            """
            SELECT
                cr.id, cr.rule_id, cr.resource_id, cr.status, cr.detail,
                cr.acknowledged, cr.acknowledged_at, cr.acknowledged_note,
                cr.evaluated_at,
                rule.name as rule_name, rule.severity, rule.description as rule_description,
                res.label as resource_label, res.resource_type, res.region
            FROM compliance_results cr
            JOIN compliance_rules rule ON rule.id = cr.rule_id
            LEFT JOIN resources res ON res.id = cr.resource_id
            WHERE cr.account_id = %s
            ORDER BY cr.evaluated_at DESC
            """,
            (account_id,),
        )
        results = [dict(r) for r in cur.fetchall()]

    cur.execute(
        "SELECT * FROM compliance_score_history WHERE account_id = %s ORDER BY evaluated_at DESC LIMIT 1",
        (account_id,),
    )
    score_row = cur.fetchone()
    score = dict(score_row) if score_row else {}

    cur.execute(
        "SELECT COUNT(*) as total FROM resources WHERE account_id = %s",
        (account_id,),
    )
    resource_count = cur.fetchone()["total"]

    cur.execute(
        "SELECT resource_type, COUNT(*) as count FROM resources WHERE account_id = %s GROUP BY resource_type",
        (account_id,),
    )
    resources_by_type = {r["resource_type"]: r["count"] for r in cur.fetchall()}

    cur.execute(
        "SELECT name FROM linode_accounts WHERE id = %s",
        (account_id,),
    )
    acc_row = cur.fetchone()
    account_name = acc_row["name"] if acc_row else ""

    cur.execute(
        """
        SELECT p.id, p.name, p.description, p.tier
        FROM compliance_profiles p
        JOIN account_compliance_profiles acp ON acp.profile_id = p.id
        WHERE acp.account_id = %s AND acp.is_active = TRUE
        ORDER BY p.tier, p.name
        """,
        (account_id,),
    )
    active_profiles = [dict(r) for r in cur.fetchall()]

    acknowledged = len([r for r in results if r["acknowledged"] and r["status"] == "non_compliant"])
    compliant = len([r for r in results if r["status"] == "compliant"])
    non_compliant = len([r for r in results if r["status"] == "non_compliant" and not r["acknowledged"]])
    total = len([r for r in results if r["status"] != "not_applicable" and not (r["status"] == "non_compliant" and r["acknowledged"])])
    scoreable = compliant + non_compliant
    compliance_score = round((compliant / scoreable) * 100, 1) if scoreable > 0 else None

    rule_summary: dict = {}
    for r in results:
        rn = r["rule_name"]
        if rn not in rule_summary:
            rule_summary[rn] = {"severity": r["severity"], "compliant": 0, "non_compliant": 0, "not_applicable": 0, "acknowledged": 0}
        rule_summary[rn][r["status"]] = rule_summary[rn].get(r["status"], 0) + 1
        if r["acknowledged"]:
            rule_summary[rn]["acknowledged"] += 1

    for r in results:
        if isinstance(r.get("evaluated_at"), datetime):
            r["evaluated_at"] = r["evaluated_at"].isoformat()
        if isinstance(r.get("acknowledged_at"), datetime):
            r["acknowledged_at"] = r["acknowledged_at"].isoformat()

    if isinstance(score.get("evaluated_at"), datetime):
        score["evaluated_at"] = score["evaluated_at"].isoformat()

    return {
        "account_name": account_name,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "summary": {
            "total_checks": total,
            "compliant": compliant,
            "non_compliant": non_compliant,
            "acknowledged": acknowledged,
            "compliance_score": compliance_score,
            "total_resources": resource_count,
            "resources_by_type": resources_by_type,
        },
        "score": score,
        "rule_summary": rule_summary,
        "results": results,
        "active_profiles": active_profiles,
    }
