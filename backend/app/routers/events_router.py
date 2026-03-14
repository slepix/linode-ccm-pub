from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from app.database import get_db
from app.auth import get_current_user

router = APIRouter(prefix="/api/events", tags=["events"])


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
def list_events(
    account_id: str = Query(...),
    action: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    username: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0, le=100000),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if not _user_can_access(current_user, account_id, db):
        raise HTTPException(status_code=403, detail="Access denied")

    cur = db.cursor()
    conditions = ["account_id = %s"]
    params = [account_id]

    if action:
        conditions.append("action ILIKE %s")
        params.append(f"%{action}%")
    if entity_type:
        conditions.append("entity_type = %s")
        params.append(entity_type)
    if status:
        conditions.append("status = %s")
        params.append(status)
    if username:
        conditions.append("username ILIKE %s")
        params.append(f"%{username}%")

    params.extend([limit, offset])
    cur.execute(f"""
        SELECT * FROM linode_events
        WHERE {' AND '.join(conditions)}
        ORDER BY event_created DESC NULLS LAST
        LIMIT %s OFFSET %s
    """, params)
    return [dict(r) for r in cur.fetchall()]
