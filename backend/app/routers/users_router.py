from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from typing import Optional, Literal
from app.database import get_db
from app.auth import get_current_user, require_admin, hash_password, validate_password

router = APIRouter(prefix="/api/users", tags=["users"])

_VALID_ROLES = frozenset({"admin", "power_user", "auditor"})


class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str = ""
    role: Literal["admin", "power_user", "auditor"] = "auditor"
    can_view_compliance: bool = True


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[Literal["admin", "power_user", "auditor"]] = None
    is_active: Optional[bool] = None
    can_view_compliance: Optional[bool] = None
    password: Optional[str] = None


class AccountAccessGrant(BaseModel):
    account_id: str
    can_view_compliance: bool = True


@router.get("")
def list_users(current_user=Depends(require_admin), db=Depends(get_db)):
    cur = db.cursor()
    cur.execute("""
        SELECT id, email, full_name, role, is_active, can_view_compliance,
               COALESCE(totp_enabled, FALSE) as totp_enabled, created_at, updated_at
        FROM org_users ORDER BY full_name
    """)
    return [dict(r) for r in cur.fetchall()]


@router.post("")
def create_user(body: UserCreate, current_user=Depends(require_admin), db=Depends(get_db)):
    cur = db.cursor()
    cur.execute("SELECT id FROM org_users WHERE email = %s", (body.email.lower(),))
    if cur.fetchone():
        raise HTTPException(status_code=409, detail="Email already registered")
    validate_password(body.password)
    pw_hash = hash_password(body.password)
    cur.execute("""
        INSERT INTO org_users (email, password_hash, full_name, role, is_active, can_view_compliance)
        VALUES (%s,%s,%s,%s,TRUE,%s)
        RETURNING id, email, full_name, role, is_active
    """, (body.email.lower(), pw_hash, body.full_name, body.role, body.can_view_compliance))
    return dict(cur.fetchone())


_USER_ALLOWED_COLUMNS = frozenset({"full_name", "role", "is_active", "can_view_compliance", "password_hash", "updated_at"})


@router.put("/{user_id}")
def update_user(user_id: str, body: UserUpdate, current_user=Depends(require_admin), db=Depends(get_db)):
    if str(current_user["id"]) == user_id and body.is_active is False:
        raise HTTPException(status_code=400, detail="You cannot disable your own account")

    cur = db.cursor()

    if body.is_active is False:
        cur.execute(
            "SELECT id FROM org_users WHERE role = 'admin' AND is_active = TRUE AND id != %s",
            (user_id,),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=400, detail="Cannot disable the only active admin account")

    field_map: list[tuple[str, object]] = []
    if body.full_name is not None:
        field_map.append(("full_name", body.full_name))
    if body.role is not None:
        field_map.append(("role", body.role))
    if body.is_active is not None:
        field_map.append(("is_active", body.is_active))
    if body.can_view_compliance is not None:
        field_map.append(("can_view_compliance", body.can_view_compliance))
    if body.password:
        validate_password(body.password)
        field_map.append(("password_hash", hash_password(body.password)))
    if not field_map:
        raise HTTPException(status_code=400, detail="Nothing to update")
    for col, _ in field_map:
        if col not in _USER_ALLOWED_COLUMNS:
            raise HTTPException(status_code=400, detail="Invalid field")
    set_clause = ", ".join(f"{col} = %s" for col, _ in field_map) + ", updated_at = NOW()"
    values = [v for _, v in field_map] + [user_id]
    cur.execute(
        f"UPDATE org_users SET {set_clause} WHERE id = %s RETURNING id, email, full_name, role, is_active",
        values,
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return dict(row)


@router.delete("/{user_id}")
def delete_user(user_id: str, current_user=Depends(require_admin), db=Depends(get_db)):
    if str(current_user["id"]) == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    cur = db.cursor()
    cur.execute("DELETE FROM org_users WHERE id = %s RETURNING id", (user_id,))
    if not cur.fetchone():
        raise HTTPException(status_code=404, detail="User not found")
    return {"deleted": True}


@router.get("/{user_id}/access")
def get_user_access(user_id: str, current_user=Depends(require_admin), db=Depends(get_db)):
    cur = db.cursor()
    cur.execute("""
        SELECT uaa.*, la.name as account_name
        FROM user_account_access uaa
        JOIN linode_accounts la ON la.id = uaa.account_id
        WHERE uaa.user_id = %s
    """, (user_id,))
    return [dict(r) for r in cur.fetchall()]


@router.post("/{user_id}/access")
def grant_access(user_id: str, body: AccountAccessGrant, current_user=Depends(require_admin), db=Depends(get_db)):
    cur = db.cursor()
    cur.execute("""
        INSERT INTO user_account_access (user_id, account_id, granted_by, can_view_compliance)
        VALUES (%s,%s,%s,%s)
        ON CONFLICT (user_id, account_id) DO UPDATE
        SET can_view_compliance=%s
        RETURNING id
    """, (user_id, body.account_id, str(current_user["id"]),
          body.can_view_compliance,
          body.can_view_compliance))
    return {"granted": True}


@router.delete("/{user_id}/access/{account_id}")
def revoke_access(user_id: str, account_id: str, current_user=Depends(require_admin), db=Depends(get_db)):
    cur = db.cursor()
    cur.execute("DELETE FROM user_account_access WHERE user_id=%s AND account_id=%s RETURNING id",
                (user_id, account_id))
    if not cur.fetchone():
        raise HTTPException(status_code=404, detail="Access not found")
    return {"revoked": True}
