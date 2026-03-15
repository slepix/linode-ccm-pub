from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid
import random
import jwt
from jwt.exceptions import InvalidTokenError
import bcrypt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings
from app.database import get_db
import psycopg2.extras

AUTH_COOKIE_NAME = "auth_token"

_PRUNE_PROBABILITY = 0.02


def prune_expired_tokens(db) -> int:
    cur = db.cursor()
    cur.execute(
        "DELETE FROM revoked_tokens WHERE expires_at < NOW()"
    )
    deleted = cur.rowcount
    db.commit()
    return deleted

bearer_scheme = HTTPBearer(auto_error=False)

_PASSWORD_MIN_LEN = 12
_PASSWORD_REQUIREMENTS = [
    (lambda p: len(p) >= _PASSWORD_MIN_LEN, f"at least {_PASSWORD_MIN_LEN} characters"),
    (lambda p: any(c.isupper() for c in p), "at least one uppercase letter"),
    (lambda p: any(c.islower() for c in p), "at least one lowercase letter"),
    (lambda p: any(c.isdigit() for c in p), "at least one digit"),
    (lambda p: any(c in "!@#$%^&*()-_=+[]{}|;:',.<>?/" for c in p), "at least one special character"),
]


def validate_password(password: str) -> None:
    failures = [msg for check, msg in _PASSWORD_REQUIREMENTS if not check(password)]
    if failures:
        raise HTTPException(
            status_code=400,
            detail=f"Password must contain: {', '.join(failures)}.",
        )


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_token(user_id: str, email: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(
        token,
        settings.JWT_SECRET,
        algorithms=[settings.JWT_ALGORITHM],
        options={"require": ["exp", "sub", "iat", "jti"]},
    )


def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db=Depends(get_db),
):
    raw_token: Optional[str] = None
    if credentials:
        raw_token = credentials.credentials
    else:
        raw_token = request.cookies.get(AUTH_COOKIE_NAME)

    if not raw_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = decode_token(raw_token)
        user_id = payload.get("sub")
        jti = payload.get("jti")
    except InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    if random.random() < _PRUNE_PROBABILITY:
        prune_expired_tokens(db)

    cur = db.cursor()
    cur.execute("SELECT 1 FROM revoked_tokens WHERE jti = %s", (jti,))
    if cur.fetchone():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has been revoked")

    cur.execute(
        "SELECT id, email, full_name, role, is_active, can_view_costs, can_view_compliance FROM org_users WHERE id = %s AND is_active = TRUE",
        (user_id,),
    )
    user = cur.fetchone()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return dict(user)


def revoke_token(jti: str, expires_at: datetime, db) -> None:
    cur = db.cursor()
    cur.execute(
        "INSERT INTO revoked_tokens (jti, expires_at) VALUES (%s, %s) ON CONFLICT (jti) DO NOTHING",
        (jti, expires_at),
    )
    cur.execute("DELETE FROM revoked_tokens WHERE expires_at < NOW()")
    db.commit()


def require_admin(user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


def require_power_or_admin(user=Depends(get_current_user)):
    if user["role"] not in ("admin", "power_user"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    return user
