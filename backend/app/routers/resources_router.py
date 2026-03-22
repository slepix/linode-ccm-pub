from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime, timedelta, timezone
import json
from app.database import get_db
from app.auth import get_current_user

router = APIRouter(prefix="/api/resources", tags=["resources"])

GAP_MINUTES = 10


def _user_can_access(user: dict, account_id: str, db) -> bool:
    if user["role"] == "admin":
        return True
    cur = db.cursor()
    cur.execute(
        "SELECT id FROM user_account_access WHERE user_id = %s AND account_id = %s",
        (str(user["id"]), account_id),
    )
    return cur.fetchone() is not None


def _detect_sync_batches(account_id: str, cur) -> list[dict]:
    """
    Cluster all snapshot timestamps into sync batches.
    A new batch starts when there is a gap > GAP_MINUTES between consecutive timestamps.
    Returns list of {start, end, label_ts} sorted newest first.
    """
    cur.execute(
        """
        SELECT synced_at
        FROM resource_snapshots
        WHERE account_id = %s
        ORDER BY synced_at ASC
        """,
        (account_id,),
    )
    rows = [r["synced_at"] for r in cur.fetchall()]
    if not rows:
        return []

    batches = []
    batch_start = rows[0]
    batch_end = rows[0]

    for ts in rows[1:]:
        if ts - batch_end > timedelta(minutes=GAP_MINUTES):
            batches.append({"start": batch_start, "end": batch_end})
            batch_start = ts
        batch_end = ts

    batches.append({"start": batch_start, "end": batch_end})

    batches.sort(key=lambda b: b["start"], reverse=True)
    return batches


def _fetch_batch_snapshots(account_id: str, batch: dict, cur) -> dict:
    """
    Fetch the most recent snapshot per (resource_id, resource_type) within a batch window.
    """
    cur.execute(
        """
        SELECT DISTINCT ON (resource_id, resource_type)
            resource_id, resource_type, label, region, status, specs, synced_at
        FROM resource_snapshots
        WHERE account_id = %s
          AND synced_at >= %s
          AND synced_at <= %s
        ORDER BY resource_id, resource_type, synced_at DESC
        """,
        (account_id, batch["start"], batch["end"]),
    )
    return {(r["resource_id"], r["resource_type"]): dict(r) for r in cur.fetchall()}


@router.get("")
def list_resources(
    account_id: str = Query(...),
    resource_type: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if not _user_can_access(current_user, account_id, db):
        raise HTTPException(status_code=403, detail="Access denied")

    cur = db.cursor()
    conditions = ["account_id = %s"]
    params = [account_id]
    if resource_type:
        conditions.append("resource_type = %s")
        params.append(resource_type)
    if region:
        conditions.append("region = %s")
        params.append(region)

    cur.execute(
        f"SELECT * FROM resources WHERE {' AND '.join(conditions)} ORDER BY resource_type, label",
        params,
    )
    return [dict(r) for r in cur.fetchall()]


@router.get("/drift")
def get_drift(
    account_id: str = Query(...),
    sync_a: Optional[str] = Query(None, description="ISO timestamp representing the older sync batch"),
    sync_b: Optional[str] = Query(None, description="ISO timestamp representing the newer sync batch"),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if not _user_can_access(current_user, account_id, db):
        raise HTTPException(status_code=403, detail="Access denied")

    cur = db.cursor()
    batches = _detect_sync_batches(account_id, cur)

    if len(batches) < 2:
        return {
            "syncs": [str(b["start"]) for b in batches],
            "changes": [],
        }

    sync_labels = [str(b["start"]) for b in batches]

    if sync_b is None:
        batch_b = batches[0]
    else:
        ts_b = datetime.fromisoformat(sync_b.replace("Z", "+00:00"))
        if ts_b.tzinfo is None:
            ts_b = ts_b.replace(tzinfo=timezone.utc)
        batch_b = None
        for b in batches:
            b_start = b["start"]
            if b_start.tzinfo is None:
                b_start = b_start.replace(tzinfo=timezone.utc)
            if abs((b_start - ts_b).total_seconds()) < GAP_MINUTES * 60:
                batch_b = b
                break
        if batch_b is None:
            batch_b = batches[0]

    if sync_a is None:
        batch_a = None
        for b in batches:
            b_start = b["start"]
            if b_start.tzinfo is None:
                b_start = b_start.replace(tzinfo=timezone.utc)
            bb_start = batch_b["start"]
            if bb_start.tzinfo is None:
                bb_start = bb_start.replace(tzinfo=timezone.utc)
            if b_start < bb_start:
                batch_a = b
                break
        if batch_a is None:
            return {"syncs": sync_labels, "changes": []}
    else:
        ts_a = datetime.fromisoformat(sync_a.replace("Z", "+00:00"))
        if ts_a.tzinfo is None:
            ts_a = ts_a.replace(tzinfo=timezone.utc)
        batch_a = None
        for b in batches:
            b_start = b["start"]
            if b_start.tzinfo is None:
                b_start = b_start.replace(tzinfo=timezone.utc)
            if abs((b_start - ts_a).total_seconds()) < GAP_MINUTES * 60:
                batch_a = b
                break
        if batch_a is None:
            batch_a = batches[1]

    snap_a = _fetch_batch_snapshots(account_id, batch_a, cur)
    snap_b = _fetch_batch_snapshots(account_id, batch_b, cur)

    all_keys = set(snap_a.keys()) | set(snap_b.keys())
    changes = []

    for key in all_keys:
        rid, rtype = key
        a = snap_a.get(key)
        b = snap_b.get(key)

        if a is None:
            changes.append({
                "resource_id": rid,
                "resource_type": rtype,
                "label": b["label"] if b else rid,
                "region": b["region"] if b else None,
                "change_type": "added",
                "field_changes": [],
                "sync_a_at": None,
                "sync_b_at": str(b["synced_at"]) if b else None,
            })
            continue

        if b is None:
            changes.append({
                "resource_id": rid,
                "resource_type": rtype,
                "label": a["label"] if a else rid,
                "region": a["region"] if a else None,
                "change_type": "removed",
                "field_changes": [],
                "sync_a_at": str(a["synced_at"]) if a else None,
                "sync_b_at": None,
            })
            continue

        field_changes = []

        for field in ("label", "region", "status"):
            val_a = a.get(field)
            val_b = b.get(field)
            if val_a != val_b:
                field_changes.append({"field": field, "before": val_a, "after": val_b})

        specs_a = a.get("specs") or {}
        specs_b = b.get("specs") or {}
        if isinstance(specs_a, str):
            try:
                specs_a = json.loads(specs_a)
            except Exception:
                specs_a = {}
        if isinstance(specs_b, str):
            try:
                specs_b = json.loads(specs_b)
            except Exception:
                specs_b = {}

        all_spec_keys = set(specs_a.keys()) | set(specs_b.keys())
        for sk in all_spec_keys:
            sv_a = specs_a.get(sk)
            sv_b = specs_b.get(sk)
            if sv_a != sv_b:
                field_changes.append({"field": f"specs.{sk}", "before": sv_a, "after": sv_b})

        if field_changes:
            changes.append({
                "resource_id": rid,
                "resource_type": rtype,
                "label": b["label"] or rid,
                "region": b["region"],
                "change_type": "modified",
                "field_changes": field_changes,
                "sync_a_at": str(a["synced_at"]),
                "sync_b_at": str(b["synced_at"]),
            })

    changes.sort(key=lambda x: (x["change_type"], x["resource_type"], x["label"]))

    return {
        "sync_a": str(batch_a["start"]),
        "sync_b": str(batch_b["start"]),
        "syncs": sync_labels,
        "changes": changes,
    }


@router.get("/{resource_id}")
def get_resource(resource_id: str, current_user=Depends(get_current_user), db=Depends(get_db)):
    cur = db.cursor()
    if current_user["role"] == "admin":
        cur.execute("SELECT * FROM resources WHERE id = %s", (resource_id,))
    else:
        cur.execute("""
            SELECT r.* FROM resources r
            WHERE r.id = %s
              AND r.account_id IN (
                SELECT account_id FROM user_account_access WHERE user_id = %s
              )
        """, (resource_id, str(current_user["id"])))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Resource not found")
    return dict(row)


@router.get("/{resource_id}/snapshots")
def get_resource_snapshots(
    resource_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    cur = db.cursor()
    if current_user["role"] == "admin":
        cur.execute("SELECT id FROM resources WHERE id = %s", (resource_id,))
    else:
        cur.execute("""
            SELECT id FROM resources
            WHERE id = %s
              AND account_id IN (
                SELECT account_id FROM user_account_access WHERE user_id = %s
              )
        """, (resource_id, str(current_user["id"])))
    if not cur.fetchone():
        raise HTTPException(status_code=404, detail="Resource not found")

    cur.execute(
        "SELECT * FROM resource_snapshots WHERE resource_id = %s ORDER BY synced_at DESC LIMIT 50",
        (resource_id,),
    )
    return [dict(r) for r in cur.fetchall()]
