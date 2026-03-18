import secrets
import string
import uuid
import bcrypt
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.database import get_db
from app.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/mcp/keys", tags=["mcp"])

_KEY_LENGTH = 48
_KEY_PREFIX_LEN = 8
_KEY_ALPHABET = string.ascii_letters + string.digits


def _gen_raw_key() -> str:
    return "mcp_" + "".join(secrets.choice(_KEY_ALPHABET) for _ in range(_KEY_LENGTH))


def _hash_key(raw: str) -> str:
    return bcrypt.hashpw(raw.encode(), bcrypt.gensalt()).decode()


def _verify_key(raw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(raw.encode(), hashed.encode())
    except Exception:
        return False


def _mcp_enabled(db) -> bool:
    cur = db.cursor()
    cur.execute("SELECT value FROM app_settings WHERE key = 'mcp_enabled'")
    row = cur.fetchone()
    if not row:
        return True
    return (row["value"] or "true").lower() not in ("false", "0", "no")


class CreateKeyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    expires_at: Optional[datetime] = None


class UpdateKeyRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    is_active: Optional[bool] = None


@router.get("")
def list_keys(current_user=Depends(get_current_user), db=Depends(get_db)):
    cur = db.cursor()
    if current_user["role"] == "admin":
        cur.execute("""
            SELECT k.id, k.user_id, k.name, k.key_prefix, k.is_active,
                   k.last_used_at, k.expires_at, k.created_at,
                   u.email as user_email, u.full_name as user_full_name
            FROM mcp_api_keys k
            JOIN org_users u ON u.id = k.user_id
            ORDER BY k.created_at DESC
        """)
    else:
        cur.execute("""
            SELECT k.id, k.user_id, k.name, k.key_prefix, k.is_active,
                   k.last_used_at, k.expires_at, k.created_at,
                   u.email as user_email, u.full_name as user_full_name
            FROM mcp_api_keys k
            JOIN org_users u ON u.id = k.user_id
            WHERE k.user_id = %s
            ORDER BY k.created_at DESC
        """, (str(current_user["id"]),))
    rows = cur.fetchall()
    result = []
    for r in rows:
        row = dict(r)
        for field in ("last_used_at", "expires_at", "created_at"):
            if row.get(field) and hasattr(row[field], "isoformat"):
                row[field] = row[field].isoformat()
        result.append(row)
    return result


@router.post("")
def create_key(body: CreateKeyRequest, current_user=Depends(get_current_user), db=Depends(get_db)):
    if not _mcp_enabled(db):
        raise HTTPException(status_code=403, detail="MCP access is disabled by the administrator")

    raw = _gen_raw_key()
    hashed = _hash_key(raw)
    prefix = raw[:_KEY_PREFIX_LEN + 4]

    cur = db.cursor()
    cur.execute("""
        INSERT INTO mcp_api_keys (user_id, name, key_hash, key_prefix, expires_at)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id, created_at
    """, (str(current_user["id"]), body.name, hashed, prefix, body.expires_at))
    row = cur.fetchone()
    db.commit()

    return {
        "id": str(row["id"]),
        "name": body.name,
        "key_prefix": prefix,
        "raw_key": raw,
        "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
        "note": "Store this key safely. It will not be shown again.",
    }


@router.put("/{key_id}")
def update_key(
    key_id: str,
    body: UpdateKeyRequest,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    cur = db.cursor()
    cur.execute("SELECT user_id FROM mcp_api_keys WHERE id = %s", (key_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Key not found")

    if current_user["role"] != "admin" and str(row["user_id"]) != str(current_user["id"]):
        raise HTTPException(status_code=403, detail="Access denied")

    fields = {}
    if body.name is not None:
        fields["name"] = body.name
    if body.is_active is not None:
        fields["is_active"] = body.is_active

    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clauses = ", ".join(f"{k} = %s" for k in fields)
    values = list(fields.values()) + [key_id]
    cur.execute(f"UPDATE mcp_api_keys SET {set_clauses} WHERE id = %s RETURNING id, name, is_active", values)
    updated = cur.fetchone()
    db.commit()
    return dict(updated)


@router.delete("/{key_id}")
def delete_key(
    key_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    cur = db.cursor()
    cur.execute("SELECT user_id FROM mcp_api_keys WHERE id = %s", (key_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Key not found")

    if current_user["role"] != "admin" and str(row["user_id"]) != str(current_user["id"]):
        raise HTTPException(status_code=403, detail="Access denied")

    cur.execute("DELETE FROM mcp_api_keys WHERE id = %s", (key_id,))
    db.commit()
    return {"ok": True}


@router.get("/settings")
def get_mcp_settings(current_user=Depends(require_admin), db=Depends(get_db)):
    cur = db.cursor()
    cur.execute("SELECT value FROM app_settings WHERE key = 'mcp_enabled'")
    row = cur.fetchone()
    enabled = True
    if row:
        enabled = (row["value"] or "true").lower() not in ("false", "0", "no")
    return {"mcp_enabled": enabled}


@router.put("/settings")
def update_mcp_settings(
    body: dict,
    current_user=Depends(require_admin),
    db=Depends(get_db),
):
    enabled = body.get("mcp_enabled")
    if not isinstance(enabled, bool):
        raise HTTPException(status_code=400, detail="mcp_enabled must be a boolean")
    cur = db.cursor()
    cur.execute("""
        INSERT INTO app_settings (key, value) VALUES ('mcp_enabled', %s)
        ON CONFLICT (key) DO UPDATE SET value = %s, updated_at = NOW()
    """, (str(enabled).lower(), str(enabled).lower()))
    db.commit()
    return {"mcp_enabled": enabled}
