import io
import base64
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr
from typing import Optional
from app.database import get_db
from app.auth import (
    hash_password, verify_password, create_token, decode_token,
    get_current_user, validate_password, revoke_token, AUTH_COOKIE_NAME,
)
from app.config import settings
from jwt.exceptions import InvalidTokenError
import pyotp
import qrcode
import qrcode.image.svg

_TOTP_MAX_FAILURES = 5
_TOTP_LOCKOUT_MINUTES = 15


def _check_totp_lockout(cur, user_id: str) -> None:
    cur.execute(
        "SELECT totp_fail_count, totp_locked_until FROM org_users WHERE id = %s",
        (user_id,),
    )
    row = cur.fetchone()
    if not row:
        return
    locked_until = row["totp_locked_until"]
    if locked_until:
        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) < locked_until:
            remaining = int((locked_until - datetime.now(timezone.utc)).total_seconds() / 60) + 1
            raise HTTPException(
                status_code=429,
                detail=f"Too many failed attempts. Try again in {remaining} minute(s).",
            )


def _record_totp_failure(cur, db, user_id: str) -> None:
    cur.execute(
        "SELECT totp_fail_count FROM org_users WHERE id = %s",
        (user_id,),
    )
    row = cur.fetchone()
    new_count = (row["totp_fail_count"] if row else 0) + 1
    if new_count >= _TOTP_MAX_FAILURES:
        locked_until = datetime.now(timezone.utc) + timedelta(minutes=_TOTP_LOCKOUT_MINUTES)
        cur.execute(
            "UPDATE org_users SET totp_fail_count = %s, totp_locked_until = %s WHERE id = %s",
            (new_count, locked_until, user_id),
        )
    else:
        cur.execute(
            "UPDATE org_users SET totp_fail_count = %s WHERE id = %s",
            (new_count, user_id),
        )
    db.commit()


def _reset_totp_failures(cur, db, user_id: str) -> None:
    cur.execute(
        "UPDATE org_users SET totp_fail_count = 0, totp_locked_until = NULL WHERE id = %s",
        (user_id,),
    )
    db.commit()

router = APIRouter(prefix="/api/auth", tags=["auth"])

bearer_scheme = HTTPBearer(auto_error=False)

_IS_SECURE = not settings.CORS_ORIGINS.startswith("http://localhost")


def _set_auth_cookie(response: JSONResponse, token: str) -> None:
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=_IS_SECURE,
        samesite="strict",
        max_age=settings.JWT_EXPIRE_MINUTES * 60,
        path="/",
    )


class LoginRequest(BaseModel):
    email: str
    password: str
    totp_code: Optional[str] = None


class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str = ""


@router.get("/registration-open")
def registration_open(db=Depends(get_db)):
    if not settings.ALLOW_REGISTRATION:
        return {"open": False}
    cur = db.cursor()
    cur.execute("SELECT COUNT(*) as cnt FROM org_users")
    row = cur.fetchone()
    return {"open": row["cnt"] == 0}


@router.post("/register")
def register(body: RegisterRequest, db=Depends(get_db)):
    if not settings.ALLOW_REGISTRATION:
        raise HTTPException(status_code=403, detail="Registration is closed. Ask an admin to invite you.")
    cur = db.cursor()
    cur.execute("SELECT COUNT(*) as cnt FROM org_users")
    row = cur.fetchone()
    if row["cnt"] > 0:
        raise HTTPException(status_code=403, detail="Registration is closed. Ask an admin to invite you.")

    cur.execute("SELECT id FROM org_users WHERE email = %s", (body.email.lower(),))
    if cur.fetchone():
        raise HTTPException(status_code=409, detail="Email already registered")

    validate_password(body.password)
    pw_hash = hash_password(body.password)
    cur.execute(
        """INSERT INTO org_users (email, password_hash, full_name, role, is_active)
           VALUES (%s, %s, %s, 'admin', TRUE)
           RETURNING id, email, full_name, role""",
        (body.email.lower(), pw_hash, body.full_name),
    )
    user = dict(cur.fetchone())
    db.commit()
    token = create_token(str(user["id"]), user["email"], user["role"])
    resp = JSONResponse(content={"token": token, "user": user})
    _set_auth_cookie(resp, token)
    return resp


@router.post("/login")
def login(body: LoginRequest, db=Depends(get_db)):
    cur = db.cursor()
    cur.execute(
        """SELECT id, email, full_name, role, is_active, password_hash,
                  can_view_compliance, totp_enabled, totp_secret
           FROM org_users WHERE email = %s AND is_active = TRUE""",
        (body.email.lower(),),
    )
    user = cur.fetchone()
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user = dict(user)

    if user.get("totp_enabled") and user.get("totp_secret"):
        if not body.totp_code:
            return JSONResponse(
                status_code=202,
                content={"requires_totp": True},
            )
        user_id = str(user["id"])
        _check_totp_lockout(cur, user_id)
        from app.services.crypto import decrypt_token as _dec
        totp_secret = _dec(user["totp_secret"]) if user["totp_secret"] else None
        totp = pyotp.TOTP(totp_secret)
        if not totp.verify(body.totp_code, valid_window=0):
            _record_totp_failure(cur, db, user_id)
            raise HTTPException(status_code=401, detail="Invalid authenticator code")
        _reset_totp_failures(cur, db, user_id)

    token = create_token(str(user["id"]), user["email"], user["role"])
    payload = {
        "token": token,
        "user": {
            "id": str(user["id"]),
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"],
            "can_view_compliance": user["can_view_compliance"],
        },
    }
    resp = JSONResponse(content=payload)
    _set_auth_cookie(resp, token)
    return resp


@router.post("/logout")
def logout(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db=Depends(get_db),
):
    raw_token = credentials.credentials if credentials else request.cookies.get(AUTH_COOKIE_NAME)
    if raw_token:
        try:
            payload = decode_token(raw_token)
            jti = payload.get("jti")
            exp = payload.get("exp")
            if jti and exp:
                expires_at = datetime.fromtimestamp(exp, tz=timezone.utc)
                revoke_token(jti, expires_at, db)
        except InvalidTokenError:
            pass
    resp = JSONResponse(content={"logged_out": True})
    resp.delete_cookie(key=AUTH_COOKIE_NAME, path="/")
    return resp


@router.get("/me")
def me(current_user=Depends(get_current_user)):
    return {
        "id": str(current_user["id"]),
        "email": current_user["email"],
        "full_name": current_user["full_name"],
        "role": current_user["role"],
        "can_view_compliance": current_user["can_view_compliance"],
    }


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    cur = db.cursor()
    cur.execute("SELECT password_hash FROM org_users WHERE id = %s", (str(current_user["id"]),))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    if not verify_password(body.current_password, row["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    validate_password(body.new_password)
    new_hash = hash_password(body.new_password)
    cur.execute(
        "UPDATE org_users SET password_hash = %s, updated_at = NOW() WHERE id = %s",
        (new_hash, str(current_user["id"])),
    )
    return {"ok": True}


@router.post("/2fa/setup")
def setup_2fa(current_user=Depends(get_current_user), db=Depends(get_db)):
    from app.services.crypto import encrypt_token as _enc
    secret = pyotp.random_base32()
    encrypted_secret = _enc(secret)
    cur = db.cursor()
    cur.execute(
        "UPDATE org_users SET totp_secret = %s, totp_enabled = FALSE WHERE id = %s",
        (encrypted_secret, str(current_user["id"])),
    )
    db.commit()

    app_name = "Akamai CCM"
    email = current_user["email"]
    uri = pyotp.totp.TOTP(secret).provisioning_uri(name=email, issuer_name=app_name)

    factory = qrcode.image.svg.SvgPathImage
    img = qrcode.make(uri, image_factory=factory)
    buf = io.BytesIO()
    img.save(buf)
    qr_b64 = base64.b64encode(buf.getvalue()).decode()

    return {
        "secret": secret,
        "qr_code": f"data:image/svg+xml;base64,{qr_b64}",
        "uri": uri,
    }


class TotpVerifyRequest(BaseModel):
    code: str


@router.post("/2fa/enable")
def enable_2fa(body: TotpVerifyRequest, current_user=Depends(get_current_user), db=Depends(get_db)):
    from app.services.crypto import decrypt_token as _dec
    user_id = str(current_user["id"])
    cur = db.cursor()
    _check_totp_lockout(cur, user_id)
    cur.execute("SELECT totp_secret FROM org_users WHERE id = %s", (user_id,))
    row = cur.fetchone()
    if not row or not row["totp_secret"]:
        raise HTTPException(status_code=400, detail="2FA setup not started. Call /2fa/setup first.")

    totp = pyotp.TOTP(_dec(row["totp_secret"]))
    if not totp.verify(body.code, valid_window=0):
        _record_totp_failure(cur, db, user_id)
        raise HTTPException(status_code=400, detail="Invalid authenticator code. Please try again.")

    _reset_totp_failures(cur, db, user_id)
    cur.execute(
        "UPDATE org_users SET totp_enabled = TRUE WHERE id = %s",
        (user_id,),
    )
    db.commit()
    return {"enabled": True}


@router.post("/2fa/disable")
def disable_2fa(body: TotpVerifyRequest, current_user=Depends(get_current_user), db=Depends(get_db)):
    from app.services.crypto import decrypt_token as _dec
    user_id = str(current_user["id"])
    cur = db.cursor()
    _check_totp_lockout(cur, user_id)
    cur.execute("SELECT totp_secret, totp_enabled FROM org_users WHERE id = %s", (user_id,))
    row = cur.fetchone()
    if not row or not row["totp_enabled"]:
        raise HTTPException(status_code=400, detail="2FA is not enabled.")

    totp = pyotp.TOTP(_dec(row["totp_secret"]))
    if not totp.verify(body.code, valid_window=0):
        _record_totp_failure(cur, db, user_id)
        raise HTTPException(status_code=400, detail="Invalid authenticator code.")

    _reset_totp_failures(cur, db, user_id)
    cur.execute(
        "UPDATE org_users SET totp_secret = NULL, totp_enabled = FALSE WHERE id = %s",
        (user_id,),
    )
    db.commit()
    return {"disabled": True}


@router.get("/2fa/status")
def get_2fa_status(current_user=Depends(get_current_user), db=Depends(get_db)):
    cur = db.cursor()
    cur.execute("SELECT totp_enabled FROM org_users WHERE id = %s", (str(current_user["id"]),))
    row = cur.fetchone()
    return {"enabled": bool(row and row["totp_enabled"])}


@router.post("/2fa/admin-disable/{user_id}")
def admin_disable_2fa(user_id: str, current_user=Depends(get_current_user), db=Depends(get_db)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    cur = db.cursor()
    cur.execute(
        "UPDATE org_users SET totp_secret = NULL, totp_enabled = FALSE WHERE id = %s RETURNING id",
        (user_id,),
    )
    if not cur.fetchone():
        raise HTTPException(status_code=404, detail="User not found")
    db.commit()
    return {"disabled": True}
