from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from app.database import get_db
from app.auth import get_current_user

router = APIRouter(prefix="/api/resources", tags=["resources"])


def _user_can_access(user: dict, account_id: str, db) -> bool:
    if user["role"] == "admin":
        return True
    cur = db.cursor()
    cur.execute(
        "SELECT id FROM user_account_access WHERE user_id = %s AND account_id = %s",
        (str(user["id"]), account_id),
    )
    return cur.fetchone() is not None


@router.get("")
def list_resources(
    account_id: str = Query(...),
    resource_type: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    include_deleted: bool = Query(False),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if not _user_can_access(current_user, account_id, db):
        raise HTTPException(status_code=403, detail="Access denied")

    cur = db.cursor()
    conditions = ["account_id = %s"]
    params = [account_id]
    if not include_deleted:
        conditions.append("deleted_at IS NULL")
    else:
        conditions.append("deleted_at IS NOT NULL")
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


@router.get("/{resource_id}")
def get_resource(resource_id: str, current_user=Depends(get_current_user), db=Depends(get_db)):
    cur = db.cursor()
    if current_user["role"] == "admin":
        cur.execute("SELECT * FROM resources WHERE id = %s AND deleted_at IS NULL", (resource_id,))
    else:
        cur.execute("""
            SELECT r.* FROM resources r
            WHERE r.id = %s
              AND r.deleted_at IS NULL
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
        cur.execute("SELECT id FROM resources WHERE id = %s AND deleted_at IS NULL", (resource_id,))
    else:
        cur.execute("""
            SELECT id FROM resources
            WHERE id = %s
              AND deleted_at IS NULL
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
