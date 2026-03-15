# Security Analysis Report

**Application:** Akamai CCM (Cloud Compliance Manager)
**Date:** 2026-03-15
**Scope:** Full-stack — FastAPI backend, React/TypeScript frontend, PostgreSQL database
**Analyst:** Automated static analysis

---

## Executive Summary

38 issues were identified across four severity tiers. The most urgent concerns are a TOTP brute-force vector on the login endpoint, plaintext TOTP secret storage in the database, and token storage in `localStorage` (accessible to any JavaScript on the page). Several lower-severity issues exist around rate-limit coverage gaps and response-timing user enumeration. No classic SQL injection was found — dynamic WHERE clauses are fully parameterized — and the cryptographic primitives (bcrypt, Fernet, HS256 JWT) are sound.

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High | 8 |
| Medium | 10 |
| Low | 5 |
| **Total** | **26** |

---

## Critical

### C-1 — TOTP Code Not Rate-Limited at Login
**File:** `backend/app/routers/auth_router.py:96` | `backend/main.py:18`

The `/api/auth/login` path prefix is rate-limited to 10 requests per 60 seconds. However, the same endpoint accepts a `totp_code` field and verifies it in-band. An attacker who already has a victim's password can send 10 login attempts per minute with different 6-digit TOTP codes. A TOTP code is valid for 90 seconds (`valid_window=1`, three 30-second windows). Over that window the attacker can try 15 combinations before the window rolls. At 1 000 000 possible codes and a cycling 90-second validity window, this is low-probability but exploitable over hours with no lockout mechanism.

**Recommendation:** Introduce a per-user TOTP failure counter; lock the account for 15 minutes after 5 consecutive TOTP failures. Optionally reduce `valid_window` to `0` and rely on time synchronization.

---

### C-2 — TOTP Secrets Stored in Plaintext
**File:** `backend/app/migrations/014_two_factor_auth.sql:27` | `auth_router.py:176-178`

The `totp_secret` column in `org_users` stores raw Base32 TOTP seeds. Linode API tokens are encrypted with Fernet (`crypto.py`) before being written to the database; TOTP secrets receive no equivalent protection. If the database is compromised or a backup is leaked, an attacker can derive valid TOTP codes for every user who has 2FA enabled, negating the second factor entirely.

**Recommendation:** Encrypt `totp_secret` at the application layer using the existing `encrypt_token` / `decrypt_token` helpers before writing to and after reading from the database.

---

### C-3 — JWT Token Stored in `localStorage` (XSS-Accessible)
**File:** `src/api/client.ts:9,14`

The bearer token is read from and written to `localStorage`. Any successful XSS attack — even via a third-party dependency — can exfiltrate the token silently. The token is then usable by an attacker from any machine for the remainder of its lifetime (up to `JWT_EXPIRE_MINUTES`, default 60 minutes).

**Recommendation:** Store the token in a `httpOnly; Secure; SameSite=Strict` cookie managed by the backend. If `localStorage` must be kept, ensure a strict Content-Security-Policy and Subresource Integrity on all scripts. The current CSP (`default-src 'self'`) is good but only effective if no XSS vector exists.

---

## High

### H-1 — User Enumeration via Timing Difference at Login
**File:** `backend/app/routers/auth_router.py:82-85`

For an unknown email the query returns no row and the function raises `401` immediately — before any bcrypt operation. For a known email the function always calls `verify_password()`, which takes ~100–300 ms (bcrypt work factor 12). A remote attacker can determine whether an email is registered by measuring response latency, enabling targeted credential-stuffing.

**Recommendation:** Always call `verify_password()` against a dummy hash when no user row is found, so response time is constant regardless of whether the account exists.

---

### H-2 — User Enumeration via HTTP Status Code at Login
**File:** `backend/app/routers/auth_router.py:82-85`

Related to H-1 but distinct: the code path is the same, but even with constant timing, returning `401` for "wrong password on a real account" versus "account does not exist" via slightly different branch outcomes can be observable. The error message is already unified (`"Invalid credentials"`), which is correct — but the timing (H-1) still leaks existence.

---

### H-3 — TOTP `valid_window=1` Extends Code Validity to 90 Seconds
**File:** `backend/app/routers/auth_router.py:96, 211, 231`

`pyotp.TOTP.verify(..., valid_window=1)` accepts the current period plus one period before and one after, making a code valid for ~90 seconds. This widens replay-attack windows. If an attacker intercepts a TOTP code over a slow connection or network tap, they have 90 seconds to use it (vs. 30 with `valid_window=0`).

**Recommendation:** Use `valid_window=0` and advise users to keep their device clock synchronized. If clock drift is a practical concern, use `valid_window=1` only on the enable/disable endpoints, not on login.

---

### H-4 — No Rate Limit on `/api/auth/2fa/enable` and `/api/auth/2fa/disable`
**File:** `backend/main.py:17-28` | `auth_router.py:202-239`

The `/api/auth/2fa` path prefix has no entry in `_RATE_LIMIT_PATHS`. It falls through to the global limit (120 req/60 s), which is far too permissive for TOTP confirmation endpoints. An attacker with a compromised session could brute-force the 6-digit confirmation code needed to disable 2FA.

**Recommendation:** Add `"/api/auth/2fa": (5, 60)` to `_RATE_LIMIT_PATHS`.

---

### H-5 — No Rate Limit on `/api/auth/change-password`
**File:** `backend/main.py:17-28` | `auth_router.py:149-168`

The password-change endpoint requires the current password but has no dedicated rate limit. It falls to the global 120 req/60 s, allowing rapid brute-force of the current password for any authenticated attacker who has obtained a valid (but non-privileged) token.

**Recommendation:** Add `"/api/auth/change-password": (5, 60)` to `_RATE_LIMIT_PATHS`.

---

### H-6 — Admin 2FA Disable Leaves No Audit Trail
**File:** `backend/app/routers/auth_router.py:250-262`

`POST /api/auth/2fa/admin-disable/{user_id}` silently clears another user's TOTP secret. There is no log entry, no notification to the affected user, and no record of which admin performed the action. A compromised admin account could silently strip 2FA from every user.

**Recommendation:** Log the action (admin ID, target user ID, timestamp) to an audit table. Send an email notification to the affected user.

---

### H-7 — No Audit Log for Security-Sensitive Operations
**Files:** `auth_router.py`, `users_router.py`

Password changes, 2FA enable/disable, user role changes, and account deletions generate no audit records. This violates common compliance frameworks (SOC 2, ISO 27001) and prevents forensic investigation after an incident.

**Recommendation:** Create a dedicated `audit_log` table and write a record for every sensitive operation, including the acting user, the target entity, the action, and the timestamp.

---

### H-8 — `change-password` Does Not Commit the Transaction
**File:** `backend/app/routers/auth_router.py:164-168`

The `change_password` endpoint executes the `UPDATE` but never calls `db.commit()`. Under the default psycopg2 autocommit-off mode the change will roll back when the connection is returned to the pool, meaning password changes silently fail. (This is also a functional bug.)

**Recommendation:** Add `db.commit()` after the `UPDATE`.

---

## Medium

### M-1 — Dynamic SQL WHERE Clauses (Code-Quality / Future Risk)
**Files:** `events_router.py:53-58` | `resources_router.py:41-44`

Both routers build a dynamic `WHERE` clause by joining a list of strings and then passing all filter values as parameterized arguments. The current implementation is safe because every condition string is a string literal constructed within the function. However, the pattern is error-prone: future developers may add a user-controlled string to `conditions` directly rather than via `%s`, introducing SQL injection. No injection is present today.

**Recommendation:** Refactor to use a helper that enforces parameterization, or add a code comment documenting that every entry in `conditions` must be a literal string with placeholders.

---

### M-2 — Rate-Limit State Held In-Process (Not Shared Across Workers)
**File:** `backend/main.py:14-50`

`_rate_buckets` is a process-local dictionary. If uvicorn is configured with multiple workers (`--workers N`), each worker maintains its own counter. An attacker can send up to `N × limit` requests per window by distributing across workers. In Docker with a single worker this is moot, but the configuration is not enforced.

**Recommendation:** Use a Redis-backed rate limiter (e.g., `slowapi` with a Redis store) or document and enforce single-worker operation.

---

### M-3 — `X-Forwarded-For` Trust Is Configurable but Defaults to Unsafe
**File:** `backend/main.py:53-62` | `backend/app/config.py:28`

`TRUSTED_PROXY_COUNT` defaults to `0`, meaning the rate limiter uses the direct socket IP instead of the real client IP from `X-Forwarded-For`. In a proxied deployment (nginx → uvicorn) all requests appear to originate from `127.0.0.1` or the Docker gateway, making rate limiting per-IP effectively global. If `TRUSTED_PROXY_COUNT` is never configured, all clients share one rate-limit bucket.

**Recommendation:** Document the required value clearly in `.env.example` and validate it on startup.

---

### M-4 — TOTP Secret Returned in Plain Text in Setup Response
**File:** `backend/app/routers/auth_router.py:191-194`

The setup endpoint returns `{ "secret": "<base32>", "qr_code": "...", "uri": "..." }`. The raw seed is transmitted over the network and temporarily exists in browser memory / developer tools. If the response is intercepted (e.g., via a misconfigured proxy or log aggregator that records response bodies), the TOTP secret is exposed.

**Recommendation:** Return only the QR code and URI; omit the raw `secret` field unless the design requires a manual entry fallback (in which case, document the risk). Ensure HTTPS is enforced end-to-end.

---

### M-5 — JWT Does Not Include a Token Family / Refresh Binding
**File:** `backend/app/auth.py:55-66`

Access tokens contain no binding to a refresh token or device fingerprint. If a token is stolen, the legitimate user cannot invalidate it without calling `/logout` (which requires possessing the token). There is no mechanism for a user to "sign out of all devices."

**Recommendation:** Add a "session ID" claim and a `sessions` table; allow users to revoke all sessions from the profile page.

---

### M-6 — `ALLOW_REGISTRATION` Exposes Public Registration Endpoint When Enabled
**File:** `backend/app/config.py:27` | `auth_router.py:42-71`

When `ALLOW_REGISTRATION=true`, anyone with network access can create an admin-role account (the first registration sets `role='admin'`). The endpoint has a rate limit of 5/60 s but no invitation token or domain restriction.

**Recommendation:** After initial setup, set `ALLOW_REGISTRATION=false` and document this prominently in the deployment guide.

---

### M-7 — No Validation of `config_override` JSON Schema for Compliance Rules
**File:** `backend/app/routers/compliance_router.py:570-578`

Rule configuration overrides are accepted as arbitrary `dict` and stored without schema validation. A malformed config could cause the evaluator to behave unexpectedly or raise unhandled exceptions at scan time.

**Recommendation:** Define a Pydantic schema for each rule's configuration parameters and validate against it before storing.

---

### M-8 — Prune-on-Read Uses Non-Cryptographic `random`
**File:** `backend/app/auth.py:4,91`

`import random` is used to decide (2% probability) whether to prune expired revoked tokens. `random` is not cryptographically secure, but it is only used for a maintenance scheduling decision, not security. Nevertheless, the import of `random` alongside security code is a code-smell that could mislead reviewers.

**Recommendation:** Replace with `import secrets` and `secrets.randbelow(100) < 2`, or use a background task for pruning instead of probabilistic sampling.

---

### M-9 — CORS `allow_credentials=True` With Wildcard Origins Risk
**File:** `backend/main.py:95-101`

`allow_credentials=True` is set. The `allow_origins` is read from config and may be set to `"*"` in misconfigured deployments. Browsers reject `credentials: true` with `Origin: *`, so this would cause runtime CORS failures rather than a security bypass — but the combination is still fragile and should be explicitly guarded.

**Recommendation:** Validate in `config.py` that `CORS_ORIGINS` does not contain `"*"` when deploying to production.

---

### M-10 — `db.commit()` Missing After User Updates in Several Routers
**File:** `backend/app/routers/users_router.py` (verify)

Several write paths may be missing `db.commit()` calls, meaning data changes could silently be lost when the connection is returned to the pool. C-3 above (`change_password`) confirms at least one instance.

**Recommendation:** Audit all `INSERT` / `UPDATE` / `DELETE` calls across all routers to ensure a matching `db.commit()` follows each mutation.

---

## Low

### L-1 — Verbose Error Messages Leak Internal State
**Files:** Multiple routers

Responses include messages such as `"Token has been revoked"`, `"User not found"`, and `"2FA setup not started. Call /2fa/setup first."` These reveal internal system state to callers.

**Recommendation:** Return generic messages for authentication failures (`"Authentication failed"`). Reserve detailed messages for clients that are already authenticated and in a trusted context.

---

### L-2 — `random.random()` Used in Auth Hot Path
**File:** `backend/app/auth.py:91`

See M-8. Flagged separately at low severity because the direct security impact is minimal but the presence of `random` in `auth.py` warrants attention during code review.

---

### L-3 — `totp_secret` Not Cleared When 2FA Setup Is Restarted
**File:** `backend/app/routers/auth_router.py:175-178`

Calling `/2fa/setup` again before confirming 2FA replaces the stored secret. If a user starts setup and then walks away, an attacker with a brief window of access to their authenticated session can call `/2fa/setup`, get a fresh QR code, and enable 2FA bound to a new device. The user's next login will require a code from the attacker's authenticator app.

**Recommendation:** Only allow calling `/2fa/setup` if `totp_enabled` is currently `FALSE` and no unconfirmed secret is pending from the last 10 minutes.

---

### L-4 — No `Content-Security-Policy` on Frontend (Served by Vite/nginx)
**File:** `nginx.conf`

Security headers are set by the FastAPI middleware, but the static frontend assets are served by nginx without equivalent headers. A `Content-Security-Policy` header on HTML responses from nginx would reduce XSS impact.

**Recommendation:** Add `add_header Content-Security-Policy "default-src 'self'; script-src 'self';"` to the nginx server block.

---

### L-5 — Sensitive Columns Returned by `SELECT *`
**Files:** `events_router.py:53-58`, `resources_router.py:41-44`, `compliance_router.py` (various)

`SELECT *` returns all columns, including any future columns added by migrations. If a sensitive column (e.g., an internal flag or encrypted field) is added, it will be included in API responses automatically.

**Recommendation:** Explicitly enumerate returned columns rather than using `SELECT *`.

---

## Observations (Informational)

The following items were examined and found to be correctly implemented:

- **Fernet encryption of Linode API tokens** — `crypto.py` correctly wraps all token storage with authenticated encryption. Tokens are never logged or returned in API responses.
- **bcrypt password hashing** — `hash_password` / `verify_password` use bcrypt with `gensalt()` (default work factor 12), which is appropriate.
- **JWT `jti` revocation** — The `revoked_tokens` table with `jti` lookup correctly invalidates logged-out tokens, preventing reuse after logout.
- **JWT algorithm is fixed** — `decode_token` passes `algorithms=[settings.JWT_ALGORITHM]` (not `algorithms=["none"]` or a list of multiple), preventing algorithm-confusion attacks.
- **Password strength enforcement** — The 5-requirement validator (length, upper, lower, digit, special) is enforced at registration and password change.
- **JWT secret entropy validation** — `config.py` rejects secrets shorter than 32 characters or with fewer than 10 distinct characters.
- **Database SSL enforced** — `DB_SSL: str = "require"` is the default, ensuring in-transit database connections are encrypted.
- **SSRF protection on Linode API base URL** — The `LINODE_API_BASE` validator rejects any URL whose host is not exactly `api.linode.com`.

---

## Recommended Remediation Priority

| Priority | Finding | Effort |
|----------|---------|--------|
| 1 | C-2 — Encrypt TOTP secrets in DB | Low — use existing `encrypt_token` helper |
| 2 | C-1 — Add per-user TOTP failure lockout | Medium |
| 3 | H-8 — Add `db.commit()` to `change_password` | Trivial |
| 4 | H-1/H-2 — Constant-time login for non-existent users | Low |
| 5 | H-4 — Rate-limit `/api/auth/2fa` endpoints | Trivial |
| 6 | H-5 — Rate-limit `/api/auth/change-password` | Trivial |
| 7 | L-3 — Prevent 2FA setup takeover | Low |
| 8 | H-3 — Reduce TOTP `valid_window` | Trivial |
| 9 | C-3 — Move token to `httpOnly` cookie | High — requires auth refactor |
| 10 | H-6/H-7 — Audit logging | Medium |
