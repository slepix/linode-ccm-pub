from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.auth import get_current_user, require_admin, require_power_or_admin

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


class AccountCreate(BaseModel):
    name: str
    api_token: str
    webhook_api_key: Optional[str] = None
    sync_interval_minutes: Optional[int] = None


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    api_token: Optional[str] = None
    webhook_api_key: Optional[str] = None
    sync_interval_minutes: Optional[int] = None


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
def list_accounts(current_user=Depends(get_current_user), db=Depends(get_db)):
    cur = db.cursor()
    if current_user["role"] == "admin":
        cur.execute("""
            SELECT id, name, last_sync_at, last_evaluated_at, sync_interval_minutes,
                   created_at, updated_at
            FROM linode_accounts ORDER BY name
        """)
    else:
        cur.execute("""
            SELECT la.id, la.name, la.last_sync_at, la.last_evaluated_at,
                   la.sync_interval_minutes, la.created_at, la.updated_at
            FROM linode_accounts la
            JOIN user_account_access uaa ON uaa.account_id = la.id
            WHERE uaa.user_id = %s
            ORDER BY la.name
        """, (str(current_user["id"]),))

    rows = cur.fetchall()
    return [dict(r) for r in rows]


_DEFAULT_PROFILE_NAME = "Cloud Secure Baseline"


@router.post("")
def create_account(body: AccountCreate, current_user=Depends(require_power_or_admin), db=Depends(get_db)):
    from app.services.crypto import encrypt_token
    cur = db.cursor()
    cur.execute(
        """INSERT INTO linode_accounts (name, api_token, webhook_api_key, sync_interval_minutes)
           VALUES (%s, %s, %s, %s) RETURNING id, name, sync_interval_minutes, created_at, updated_at""",
        (body.name, encrypt_token(body.api_token),
         encrypt_token(body.webhook_api_key) if body.webhook_api_key else None,
         body.sync_interval_minutes),
    )
    row = dict(cur.fetchone())
    account_id = row["id"]

    cur.execute("SELECT id FROM compliance_profiles WHERE name = %s", (_DEFAULT_PROFILE_NAME,))
    profile = cur.fetchone()
    if profile:
        cur.execute(
            """INSERT INTO account_compliance_profiles (account_id, profile_id, is_active)
               VALUES (%s, %s, TRUE)
               ON CONFLICT (account_id, profile_id) DO UPDATE SET is_active = TRUE""",
            (account_id, str(profile["id"])),
        )

    db.commit()
    return row


@router.get("/{account_id}")
def get_account(account_id: str, current_user=Depends(get_current_user), db=Depends(get_db)):
    if not _user_can_access(current_user, account_id, db):
        raise HTTPException(status_code=403, detail="Access denied")
    cur = db.cursor()
    cur.execute(
        "SELECT id, name, last_sync_at, last_evaluated_at, sync_interval_minutes, created_at, updated_at FROM linode_accounts WHERE id = %s",
        (account_id,),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Account not found")
    return dict(row)


_ACCOUNT_ALLOWED_COLUMNS = frozenset({"name", "api_token", "webhook_api_key", "sync_interval_minutes", "updated_at"})


@router.put("/{account_id}")
def update_account(account_id: str, body: AccountUpdate, current_user=Depends(require_power_or_admin), db=Depends(get_db)):
    if not _user_can_access(current_user, account_id, db):
        raise HTTPException(status_code=403, detail="Access denied")
    from app.services.crypto import encrypt_token
    cur = db.cursor()
    field_map: list[tuple[str, object]] = []
    if body.name is not None:
        field_map.append(("name", body.name))
    if body.api_token is not None:
        field_map.append(("api_token", encrypt_token(body.api_token)))
    if body.webhook_api_key is not None:
        field_map.append(("webhook_api_key", encrypt_token(body.webhook_api_key)))
    if "sync_interval_minutes" in body.model_fields_set:
        field_map.append(("sync_interval_minutes", body.sync_interval_minutes))
    if not field_map:
        raise HTTPException(status_code=400, detail="Nothing to update")
    for col, _ in field_map:
        if col not in _ACCOUNT_ALLOWED_COLUMNS:
            raise HTTPException(status_code=400, detail="Invalid field")
    set_clause = ", ".join(f"{col} = %s" for col, _ in field_map) + ", updated_at = NOW()"
    values = [v for _, v in field_map] + [account_id]
    cur.execute(
        f"UPDATE linode_accounts SET {set_clause} WHERE id = %s RETURNING id, name, sync_interval_minutes, updated_at",
        values,
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Account not found")
    return dict(row)


@router.delete("/{account_id}")
def delete_account(account_id: str, current_user=Depends(require_admin), db=Depends(get_db)):
    cur = db.cursor()
    cur.execute("DELETE FROM linode_accounts WHERE id = %s RETURNING id", (account_id,))
    if not cur.fetchone():
        raise HTTPException(status_code=404, detail="Account not found")
    return {"deleted": True}
