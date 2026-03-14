from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from typing import Optional
from app.database import get_db
from app.auth import (
    hash_password, verify_password, create_token, decode_token,
    get_current_user, validate_password, revoke_token,
)
from app.config import settings
from jwt.exceptions import InvalidTokenError

router = APIRouter(prefix="/api/auth", tags=["auth"])

bearer_scheme = HTTPBearer(auto_error=False)


class LoginRequest(BaseModel):
    email: str
    password: str


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
    token = create_token(str(user["id"]), user["email"], user["role"])
    return {"token": token, "user": user}


@router.post("/login")
def login(body: LoginRequest, db=Depends(get_db)):
    cur = db.cursor()
    cur.execute(
        "SELECT id, email, full_name, role, is_active, password_hash, can_view_costs, can_view_compliance FROM org_users WHERE email = %s AND is_active = TRUE",
        (body.email.lower(),),
    )
    user = cur.fetchone()
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user = dict(user)
    token = create_token(str(user["id"]), user["email"], user["role"])
    return {
        "token": token,
        "user": {
            "id": str(user["id"]),
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"],
            "can_view_costs": user["can_view_costs"],
            "can_view_compliance": user["can_view_compliance"],
        },
    }


@router.post("/logout")
def logout(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db=Depends(get_db),
):
    if not credentials:
        return {"logged_out": True}
    try:
        payload = decode_token(credentials.credentials)
        jti = payload.get("jti")
        exp = payload.get("exp")
        if jti and exp:
            expires_at = datetime.fromtimestamp(exp, tz=timezone.utc)
            revoke_token(jti, expires_at, db)
    except InvalidTokenError:
        pass
    return {"logged_out": True}


@router.get("/me")
def me(current_user=Depends(get_current_user)):
    return {
        "id": str(current_user["id"]),
        "email": current_user["email"],
        "full_name": current_user["full_name"],
        "role": current_user["role"],
        "can_view_costs": current_user["can_view_costs"],
        "can_view_compliance": current_user["can_view_compliance"],
    }
