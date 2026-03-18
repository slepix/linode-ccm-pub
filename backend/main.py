from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import settings
from app.routers import (
    auth_router, accounts_router, resources_router,
    compliance_router, refresh_router, users_router, events_router, admin_router,
    reports_router
)
from app.routers import mcp_keys_router, mcp_server_router
import time
import threading
from collections import defaultdict

_rate_lock = threading.Lock()
_rate_buckets: dict = defaultdict(list)

_RATE_LIMIT_PATHS = {
    "/api/auth/login": (10, 60),
    "/api/auth/register": (5, 60),
    "/api/refresh": (20, 60),
    "/api/users": (30, 60),
    "/api/accounts": (30, 60),
    "/api/admin": (10, 60),
    "/api/compliance": (60, 60),
    "/api/resources": (60, 60),
    "/api/events": (60, 60),
    "/api/reports": (30, 60),
    "/api/mcp": (120, 60),
}

_GLOBAL_RATE_LIMIT = (120, 60)


def _is_rate_limited(ip: str, path: str) -> bool:
    matched_prefix = next(
        (p for p in _RATE_LIMIT_PATHS if path == p or path.startswith(p + "/")),
        None,
    )
    limits = _RATE_LIMIT_PATHS[matched_prefix] if matched_prefix else _GLOBAL_RATE_LIMIT
    bucket_key = matched_prefix if matched_prefix else "__global__"
    max_requests, window_seconds = limits
    now = time.monotonic()
    key = f"{ip}:{bucket_key}"
    with _rate_lock:
        timestamps = _rate_buckets[key]
        cutoff = now - window_seconds
        _rate_buckets[key] = [t for t in timestamps if t > cutoff]
        if len(_rate_buckets[key]) >= max_requests:
            return True
        _rate_buckets[key].append(now)
    return False


def _get_client_ip(request: Request) -> str:
    direct_ip = request.client.host if request.client else "unknown"
    if settings.TRUSTED_PROXY_COUNT <= 0:
        return direct_ip
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        ips = [ip.strip() for ip in forwarded_for.split(",")]
        index = max(len(ips) - settings.TRUSTED_PROXY_COUNT, 0)
        return ips[index]
    return direct_ip


app = FastAPI(title="Akamai CCM API", version="1.0.0")


_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "0",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'",
}


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    for header, value in _SECURITY_HEADERS.items():
        response.headers[header] = value
    return response


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    ip = _get_client_ip(request)
    if _is_rate_limited(ip, request.url.path):
        return JSONResponse(status_code=429, content={"detail": "Too many requests. Please slow down."})
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

app.include_router(auth_router.router)
app.include_router(accounts_router.router)
app.include_router(resources_router.router)
app.include_router(compliance_router.router)
app.include_router(refresh_router.router)
app.include_router(users_router.router)
app.include_router(events_router.router)
app.include_router(admin_router.router)
app.include_router(reports_router.router)
app.include_router(mcp_keys_router.router)
app.include_router(mcp_server_router.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
