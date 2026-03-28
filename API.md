# Linode CCM — API Reference

Base URL: `http://<your-host>/api`

All protected endpoints require an `Authorization: Bearer <token>` header. Tokens are obtained from the login or register endpoints. Tokens may also be passed via the `auth_token` cookie.

---

## Authentication

### Roles

| Role | Description |
|------|-------------|
| `admin` | Full access: user management, accounts, migrations, settings |
| `power_user` | Can create/manage accounts, trigger refresh, adjust compliance profiles |
| `auditor` | Read-only access to accounts they have been explicitly granted |

---

## Endpoints

### Auth

#### `GET /api/auth/registration-open`
Returns whether registration is currently open.

**Auth:** None

**Response:**
```json
{ "open": true }
```

---

#### `POST /api/auth/register`
Register the first admin user. Only works when no users exist or `ALLOW_REGISTRATION=true`.

**Auth:** None

**Body:**
```json
{
  "email": "admin@example.com",
  "password": "secret",
  "full_name": "Alice"
}
```

**Response:**
```json
{
  "token": "<jwt>",
  "user": {
    "id": "uuid",
    "email": "admin@example.com",
    "full_name": "Alice",
    "role": "admin"
  }
}
```

Also sets an `auth_token` cookie.

---

#### `POST /api/auth/login`
Authenticate and receive a JWT token.

**Auth:** None

**Body:**
```json
{
  "email": "admin@example.com",
  "password": "secret",
  "totp_code": "123456"
}
```

`totp_code` is only required when 2FA is enabled on the account.

**Response (2FA not enabled or code provided):**
```json
{
  "token": "<jwt>",
  "user": {
    "id": "uuid",
    "email": "admin@example.com",
    "full_name": "Alice",
    "role": "admin",
    "can_view_costs": true,
    "can_view_compliance": true
  }
}
```

**Response (2FA required, code not provided) — HTTP 202:**
```json
{ "requires_totp": true }
```

Also sets an `auth_token` cookie on success.

---

#### `POST /api/auth/logout`
Revoke the current session token.

**Auth:** Required (Bearer token or cookie)

**Response:**
```json
{ "logged_out": true }
```

Also clears the `auth_token` cookie.

---

#### `GET /api/auth/me`
Get the currently authenticated user.

**Auth:** Required

**Response:**
```json
{
  "id": "uuid",
  "email": "admin@example.com",
  "full_name": "Alice",
  "role": "admin",
  "can_view_costs": true,
  "can_view_compliance": true
}
```

---

#### `POST /api/auth/change-password`
Change the current user's password.

**Auth:** Required

**Body:**
```json
{
  "current_password": "old-secret",
  "new_password": "new-secret"
}
```

**Response:**
```json
{ "ok": true }
```

---

#### `GET /api/auth/2fa/status`
Check whether 2FA is currently enabled for the authenticated user.

**Auth:** Required

**Response:**
```json
{ "enabled": true }
```

---

#### `POST /api/auth/2fa/setup`
Generate a TOTP secret and QR code URI to configure an authenticator app.

**Auth:** Required

**Response:**
```json
{
  "secret": "BASE32SECRET",
  "qr_code": "data:image/png;base64,...",
  "uri": "otpauth://totp/LCCM:admin@example.com?secret=...&issuer=LCCM"
}
```

---

#### `POST /api/auth/2fa/enable`
Enable 2FA after verifying the authenticator app is configured correctly.

**Auth:** Required

**Body:**
```json
{ "code": "123456" }
```

**Response:**
```json
{ "enabled": true }
```

---

#### `POST /api/auth/2fa/disable`
Disable 2FA for the current user.

**Auth:** Required

**Body:**
```json
{ "code": "123456" }
```

**Response:**
```json
{ "disabled": true }
```

---

#### `POST /api/auth/2fa/admin-disable/{user_id}`
Admin endpoint to disable 2FA for any user without requiring their TOTP code.

**Auth:** Required — `admin`

**Response:**
```json
{ "disabled": true }
```

---

### Accounts

#### `GET /api/accounts`
List all accounts accessible to the authenticated user.

**Auth:** Required

**Response:** Array of account objects:
```json
[
  {
    "id": "uuid",
    "name": "Production",
    "sync_interval_minutes": 360,
    "last_sync_at": "2026-01-01T00:00:00Z",
    "last_evaluated_at": "2026-01-01T00:00:00Z",
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-01-01T00:00:00Z"
  }
]
```

---

#### `POST /api/accounts`
Create a new account.

**Auth:** Required — `power_user` or `admin`

**Body:**
```json
{
  "name": "Production",
  "api_token": "linode-api-token",
  "webhook_api_key": "optional-key",
  "sync_interval_minutes": 360
}
```

`sync_interval_minutes` overrides the global sync schedule for this account. Omit to use the global default.

**Response:**
```json
{
  "id": "uuid",
  "name": "Production",
  "sync_interval_minutes": 360,
  "created_at": "2026-01-01T00:00:00Z",
  "updated_at": "2026-01-01T00:00:00Z"
}
```

---

#### `GET /api/accounts/{account_id}`
Get details for a specific account.

**Auth:** Required

**Response:**
```json
{
  "id": "uuid",
  "name": "Production",
  "api_token": "linode-api-token",
  "webhook_api_key": "optional-key",
  "sync_interval_minutes": 360,
  "last_sync_at": "2026-01-01T00:00:00Z",
  "last_evaluated_at": "2026-01-01T00:00:00Z",
  "created_at": "2026-01-01T00:00:00Z",
  "updated_at": "2026-01-01T00:00:00Z"
}
```

---

#### `PUT /api/accounts/{account_id}`
Update an account.

**Auth:** Required — `power_user` or `admin`

**Body** (all fields optional):
```json
{
  "name": "New Name",
  "api_token": "new-token",
  "webhook_api_key": "new-key",
  "sync_interval_minutes": 720
}
```

**Response:** Updated account object.

---

#### `DELETE /api/accounts/{account_id}`
Delete an account and all associated data.

**Auth:** Required — `admin`

**Response:**
```json
{ "deleted": true }
```

---

### Resources

#### `GET /api/resources`
List resources for an account.

**Auth:** Required

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `account_id` | string | Yes | Account ID |
| `resource_type` | string | No | Filter by type (e.g. `linode`, `nodebalancer`, `volume`, `database`, `firewall`, `vpc`, `lke_cluster`, `object_storage`) |
| `region` | string | No | Filter by region |
| `include_deleted` | boolean | No | Include soft-deleted resources (default `false`) |

**Response:** Array of resource objects.

---

#### `GET /api/resources/{resource_id}`
Get details for a specific resource.

**Auth:** Required

**Response:** Resource object with all fields.

---

#### `GET /api/resources/{resource_id}/snapshots`
Get the 50 most recent sync snapshots for a resource.

**Auth:** Required

**Response:** Array of snapshot objects ordered by most recent first.

---

### Compliance

#### `GET /api/compliance/results`
List compliance check results for an account.

**Auth:** Required

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `account_id` | string | Yes | Account ID |
| `status` | string | No | `compliant`, `non_compliant`, or `not_applicable` |
| `severity` | string | No | `critical`, `warning`, or `info` |
| `resource_type` | string | No | Filter by resource type |
| `rule_id` | string | No | Filter by rule ID |
| `search` | string | No | Search rule name, resource label, or detail |

**Response:**
```json
[
  {
    "id": "uuid",
    "rule_id": "uuid",
    "resource_id": "uuid",
    "account_id": "uuid",
    "status": "non_compliant",
    "detail": "Private IP not enabled",
    "acknowledged": false,
    "acknowledged_at": null,
    "acknowledged_note": null,
    "acknowledged_by": null,
    "acknowledged_by_name": null,
    "evaluated_at": "2026-01-01T00:00:00Z",
    "created_at": "2026-01-01T00:00:00Z",
    "rule": { "id": "uuid", "name": "Private IP Required", "severity": "critical" },
    "resource": { "id": "uuid", "label": "web-01", "resource_type": "linode" }
  }
]
```

---

#### `GET /api/compliance/score`
Get the current compliance score for an account.

**Auth:** Required

**Query Parameters:**

| Parameter | Type | Required |
|-----------|------|----------|
| `account_id` | string | Yes |

**Response:**
```json
{
  "account_id": "uuid",
  "compliance_score": 85.3,
  "compliant_count": 142,
  "non_compliant_count": 25,
  "total_checks": 167,
  "evaluated_at": "2026-01-01T00:00:00Z",
  "rule_breakdown": {
    "critical": { "compliant": 40, "non_compliant": 10 },
    "warning": { "compliant": 60, "non_compliant": 10 },
    "info": { "compliant": 42, "non_compliant": 5 }
  }
}
```

---

#### `GET /api/compliance/score/history`
Get compliance score history for an account.

**Auth:** Required

**Query Parameters:**

| Parameter | Type | Required | Default | Max |
|-----------|------|----------|---------|-----|
| `account_id` | string | Yes | — | — |
| `limit` | integer | No | 30 | 500 |

**Response:** Array of score history objects ordered by most recent first.

---

#### `PUT /api/compliance/results/{result_id}/acknowledge`
Acknowledge or un-acknowledge a compliance result.

**Auth:** Required

**Body:**
```json
{
  "acknowledged": true,
  "acknowledged_note": "Approved by security team"
}
```

**Response:**
```json
{
  "id": "uuid",
  "acknowledged": true,
  "acknowledged_at": "2026-01-01T00:00:00Z",
  "acknowledged_note": "Approved by security team"
}
```

---

#### `PUT /api/compliance/results/bulk-acknowledge`
Acknowledge or un-acknowledge multiple compliance results in one request.

**Auth:** Required

**Body:**
```json
{
  "result_ids": ["uuid1", "uuid2"],
  "acknowledged": true,
  "acknowledged_note": "Batch approved"
}
```

**Response:**
```json
{ "ok": true, "updated": 2 }
```

---

#### `POST /api/compliance/results/{result_id}/notes`
Add a note to a compliance result.

**Auth:** Required

**Body:**
```json
{ "note": "Reviewed on 2026-01-01" }
```

**Response:**
```json
{
  "id": "uuid",
  "note": "Reviewed on 2026-01-01",
  "created_at": "2026-01-01T00:00:00Z"
}
```

---

#### `GET /api/compliance/results/{result_id}/notes`
Get all notes for a compliance result.

**Auth:** Required

**Response:**
```json
[
  {
    "id": "uuid",
    "compliance_result_id": "uuid",
    "note": "Reviewed on 2026-01-01",
    "created_at": "2026-01-01T00:00:00Z",
    "author_name": "Alice"
  }
]
```

---

#### `GET /api/compliance/resources/{resource_id}/timeline`
Get the compliance history for a specific resource.

**Auth:** Required

**Query Parameters:**

| Parameter | Type | Required |
|-----------|------|----------|
| `account_id` | string | Yes |

**Response:**
```json
{
  "snapshots": [
    {
      "snapshot_time": "2026-01-01T00:00:00Z",
      "compliant": 8,
      "non_compliant": 2,
      "not_applicable": 1,
      "total": 11,
      "compliance_score": 72.7
    }
  ],
  "rule_history": [
    {
      "rule_id": "uuid",
      "rule_name": "Private IP Required",
      "severity": "critical",
      "resource_types": ["linode"],
      "snapshot_time": "2026-01-01T00:00:00Z",
      "status": "non_compliant",
      "detail": "Private IP not enabled"
    }
  ]
}
```

---

#### `GET /api/compliance/rules`
List all compliance rules.

**Auth:** Required

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `account_id` | string | No | If provided, includes account-specific override status |

**Response:** Array of rule objects.

---

#### `GET /api/compliance/rules/overrides`
Get all rule overrides for an account.

**Auth:** Required

**Query Parameters:**

| Parameter | Type | Required |
|-----------|------|----------|
| `account_id` | string | Yes |

**Response:** Array of rule override objects.

---

#### `PUT /api/compliance/rules/{rule_id}/override`
Enable or disable a rule for a specific account.

**Auth:** Required — `power_user` or `admin`

**Query Parameters:**

| Parameter | Type | Required |
|-----------|------|----------|
| `account_id` | string | Yes |

**Body:**
```json
{ "is_active": false }
```

**Response:**
```json
{ "ok": true, "rule_id": "uuid", "is_active": false }
```

---

#### `GET /api/compliance/rules/{rule_id}/config`
Get rule configuration override for an account.

**Auth:** Required

**Query Parameters:**

| Parameter | Type | Required |
|-----------|------|----------|
| `account_id` | string | Yes |

**Response:**
```json
{
  "rule_id": "uuid",
  "account_id": "uuid",
  "config_override": { "allowed_types": ["g6-standard-2"] }
}
```

---

#### `PUT /api/compliance/rules/{rule_id}/config`
Set a rule configuration override for an account.

**Auth:** Required — `power_user` or `admin`

**Body:**
```json
{
  "account_id": "uuid",
  "config_override": { "allowed_types": ["g6-standard-2"] }
}
```

**Response:** Config object with `id`, `account_id`, `rule_id`, `config_override`, `created_by`, `updated_at`.

---

#### `GET /api/compliance/profiles`
List all compliance profiles.

**Auth:** Required

**Response:** Array of profile objects with `id`, `name`, `description`, `tier`, `rule_condition_types`.

---

#### `GET /api/compliance/profiles/active`
Get active profiles for an account.

**Auth:** Required

**Query Parameters:**

| Parameter | Type | Required |
|-----------|------|----------|
| `account_id` | string | Yes |

**Response:** Array of active profile objects.

---

#### `PUT /api/compliance/profiles/active`
Set the full list of active profiles for an account (replaces existing selection).

**Auth:** Required — `power_user` or `admin`

**Query Parameters:**

| Parameter | Type | Required |
|-----------|------|----------|
| `account_id` | string | Yes |

**Body:**
```json
{ "profile_ids": ["uuid1", "uuid2"] }
```

**Response:**
```json
{ "ok": true, "profile_ids": ["uuid1", "uuid2"] }
```

---

#### `PUT /api/compliance/profiles/{profile_id}/activate`
Activate or deactivate a single profile for an account.

**Auth:** Required — `power_user` or `admin`

**Body:**
```json
{ "account_id": "uuid", "active": true }
```

**Response:**
```json
{ "ok": true }
```

---

### Reports

#### `GET /api/reports`
List reports for an account.

**Auth:** Required

**Query Parameters:**

| Parameter | Type | Required |
|-----------|------|----------|
| `account_id` | string | Yes |

**Response:** Array of report objects with summary snapshots.

---

#### `POST /api/reports`
Create a new compliance report snapshot.

**Auth:** Required

**Body:**
```json
{
  "account_id": "uuid",
  "title": "Q1 2026 Compliance Report",
  "description": "Quarterly review",
  "period_start": "2026-01-01T00:00:00Z",
  "period_end": "2026-03-31T23:59:59Z",
  "quarter": "Q1 2026",
  "include_deleted": false
}
```

`include_deleted` — when `true`, soft-deleted resources are included in the snapshot (default `false`).

**Response:** Full report object including generated snapshot.

---

#### `GET /api/reports/{report_id}`
Get a specific report with full snapshot data.

**Auth:** Required

**Response:**
```json
{
  "id": "uuid",
  "account_id": "uuid",
  "title": "Q1 2026 Compliance Report",
  "status": "ready",
  "snapshot": {
    "account_name": "Production",
    "generated_at": "2026-03-14T00:00:00Z",
    "period_start": "2026-01-01T00:00:00Z",
    "period_end": "2026-03-31T23:59:59Z",
    "summary": {
      "total_checks": 167,
      "compliant": 106,
      "non_compliant": 61,
      "acknowledged": 5,
      "compliance_score": 63.5,
      "total_resources": 34,
      "resources_by_type": { "linode": 20, "nodebalancer": 14 }
    },
    "rule_summary": {},
    "results": [],
    "active_profiles": []
  }
}
```

---

#### `DELETE /api/reports/{report_id}`
Delete a report.

**Auth:** Required

**Response:**
```json
{ "success": true }
```

---

### Events

#### `GET /api/events`
List Linode events for an account.

**Auth:** Required

**Query Parameters:**

| Parameter | Type | Required | Default | Max |
|-----------|------|----------|---------|-----|
| `account_id` | string | Yes | — | — |
| `action` | string | No | — | — |
| `entity_type` | string | No | — | — |
| `status` | string | No | — | — |
| `username` | string | No | — | — |
| `limit` | integer | No | 200 | 1000 |
| `offset` | integer | No | 0 | — |

**Response:**
```json
[
  {
    "id": "uuid",
    "account_id": "uuid",
    "action": "linode_reboot",
    "entity_type": "linode",
    "status": "finished",
    "username": "alice",
    "event_created": "2026-01-01T00:00:00Z"
  }
]
```

---

### Users

#### `GET /api/users`
List all users.

**Auth:** Required — `admin`

**Response:** Array of user objects.

---

#### `POST /api/users`
Create a new user.

**Auth:** Required — `admin`

**Body:**
```json
{
  "email": "user@example.com",
  "password": "secret",
  "full_name": "Bob",
  "role": "auditor",
  "can_view_costs": true,
  "can_view_compliance": true
}
```

**Response:** User object (password not returned).

---

#### `PUT /api/users/{user_id}`
Update a user.

**Auth:** Required — `admin`

**Body** (all fields optional):
```json
{
  "full_name": "Bob Smith",
  "role": "power_user",
  "is_active": true,
  "can_view_costs": false,
  "can_view_compliance": true,
  "password": "new-secret"
}
```

**Response:** Updated user object.

---

#### `DELETE /api/users/{user_id}`
Delete a user. Admins cannot delete their own account.

**Auth:** Required — `admin`

**Response:**
```json
{ "deleted": true }
```

---

#### `GET /api/users/{user_id}/access`
Get account access grants for a user.

**Auth:** Required — `admin`

**Response:**
```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "account_id": "uuid",
    "account_name": "Production",
    "granted_by": "uuid",
    "can_view_costs": true,
    "can_view_compliance": true
  }
]
```

---

#### `POST /api/users/{user_id}/access`
Grant a user access to an account.

**Auth:** Required — `admin`

**Body:**
```json
{
  "account_id": "uuid",
  "can_view_costs": true,
  "can_view_compliance": true
}
```

**Response:**
```json
{ "granted": true }
```

---

#### `DELETE /api/users/{user_id}/access/{account_id}`
Revoke a user's access to an account.

**Auth:** Required — `admin`

**Response:**
```json
{ "revoked": true }
```

---

### Refresh / Sync

#### `POST /api/refresh`
Trigger a sync and/or compliance evaluation.

**Auth:** Required — `power_user` or `admin`

**Body:**
```json
{
  "account_id": "uuid",
  "skip_sync": false,
  "skip_eval": false
}
```

Omit `account_id` to process all accounts.

**Response:**
```json
{
  "success": true,
  "accounts_processed": 1,
  "results": [
    {
      "account_id": "uuid",
      "sync": { "success": true, "count": 34 },
      "eval": { "success": true }
    }
  ],
  "log": ["Synced 34 resources", "Evaluated compliance"],
  "completed_at": "2026-01-01T00:00:00Z"
}
```

---

#### `GET /api/refresh`
Trigger a refresh via GET (useful for cron and webhooks).

**Auth:** `REFRESH_API_SECRET` via `?token=` query parameter or `Authorization: Bearer` header.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `account_id` | string | No | Specific account to refresh |
| `token` | string | No | API secret (alternative to Authorization header) |
| `skip_sync` | boolean | No | Skip sync phase |
| `skip_eval` | boolean | No | Skip evaluation phase |

**Response:** Same as `POST /api/refresh`.

---

#### `GET /api/refresh/scheduled`
Lightweight scheduled sync that only processes accounts that are actually due for a refresh based on their configured sync interval. Intended for use with high-frequency cron jobs.

**Auth:** `REFRESH_API_SECRET` via `?token=` query parameter or `Authorization: Bearer` header.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | No | API secret (alternative to Authorization header) |

**Response (all accounts fresh):**
```json
{
  "skipped": true,
  "reason": "All accounts are up to date",
  "accounts_due": 0,
  "accounts_fresh": 3
}
```

**Response (accounts processed):**
```json
{
  "skipped": false,
  "accounts_due": 2,
  "accounts_fresh": 1,
  "results": [...],
  "log": [...],
  "completed_at": "2026-01-01T00:00:00Z"
}
```

---

#### `GET /api/refresh/stream`
Trigger a refresh and stream progress as Server-Sent Events (SSE).

**Auth:** Required — `power_user` or `admin`

**Query Parameters:**

| Parameter | Type | Required |
|-----------|------|----------|
| `account_id` | string | No |
| `skip_sync` | boolean | No |
| `skip_eval` | boolean | No |

**Response:** `Content-Type: text/event-stream`

Event types:

| Event | Payload | Description |
|-------|---------|-------------|
| `phase` | `"sync"` or `"evaluate"` | Phase started |
| `sync_done` | `{ "count": 34 }` | Sync completed |
| `eval_done` | `{}` | Evaluation completed |
| `log` | string | Log message |
| `done` | summary object | Final result |
| `error` | string | Error message |

---

### Admin

#### `POST /api/admin/run-migrations`
Run any pending database migrations.

**Auth:** Required — `admin`

**Response:**
```json
{ "success": true, "message": "Migrations completed" }
```

---

#### `POST /api/admin/prune-tokens`
Delete expired and revoked JWT tokens from the database.

**Auth:** Required — `admin`

**Response:**
```json
{ "success": true, "deleted": 42 }
```

---

#### `GET /api/admin/settings/sync-schedule`
Get the global default sync interval.

**Auth:** Required — `admin`

**Response:**
```json
{ "interval_minutes": 360 }
```

---

#### `PUT /api/admin/settings/sync-schedule`
Update the global default sync interval (minimum 5 minutes). Individual accounts can override this with their own `sync_interval_minutes`.

**Auth:** Required — `admin`

**Body:**
```json
{ "interval_minutes": 360 }
```

**Response:**
```json
{ "success": true, "interval_minutes": 360 }
```

---

### MCP API Keys

The MCP key endpoints manage API keys used to authenticate with the MCP server.

#### `GET /api/mcp/keys`
List MCP API keys for the current user.

**Auth:** Required

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "My AI Assistant",
    "key_prefix": "mcp_abc123",
    "is_active": true,
    "created_at": "2026-01-01T00:00:00Z",
    "expires_at": null
  }
]
```

Full key values are never returned after creation.

---

#### `POST /api/mcp/keys`
Create a new MCP API key.

**Auth:** Required

**Body:**
```json
{
  "name": "My AI Assistant",
  "expires_at": "2027-01-01T00:00:00Z"
}
```

`expires_at` is optional. Omit for a non-expiring key.

**Response:**
```json
{
  "id": "uuid",
  "name": "My AI Assistant",
  "key_prefix": "mcp_abc123",
  "raw_key": "mcp_abc123xxxxxxxxxxxxxxxx",
  "created_at": "2026-01-01T00:00:00Z",
  "note": "Save this key — it will not be shown again."
}
```

---

#### `PUT /api/mcp/keys/{key_id}`
Update a key's name or active status.

**Auth:** Required (key owner only)

**Body** (all fields optional):
```json
{
  "name": "Updated Name",
  "is_active": false
}
```

**Response:** Updated key object.

---

#### `DELETE /api/mcp/keys/{key_id}`
Delete an MCP API key.

**Auth:** Required (key owner only)

**Response:**
```json
{ "ok": true }
```

---

#### `GET /api/mcp/keys/settings`
Get global MCP settings.

**Auth:** Required — `admin`

**Response:**
```json
{ "mcp_enabled": true }
```

---

#### `PUT /api/mcp/keys/settings`
Enable or disable the MCP server globally.

**Auth:** Required — `admin`

**Body:**
```json
{ "mcp_enabled": true }
```

**Response:**
```json
{ "mcp_enabled": true }
```

---

### MCP Server

The MCP (Model Context Protocol) server allows AI assistants to interact with LCCM. All MCP endpoints authenticate via an MCP API key passed as a Bearer token (`Authorization: Bearer <mcp_key>`) or via the `X-MCP-Key` header.

#### `POST /api/mcp`
Streamable HTTP transport (MCP spec 2024-11-05). Accepts a single JSON-RPC 2.0 message or a batch array.

**Auth:** MCP API key

**Body:** JSON-RPC 2.0 request
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_compliance_score",
    "arguments": { "account_id": "uuid" }
  }
}
```

**Response:** JSON-RPC 2.0 response.

---

#### `GET /api/mcp/sse`
SSE transport (v1). Opens a Server-Sent Events stream and returns an endpoint URL for sending messages.

**Auth:** MCP API key

**Response:** `Content-Type: text/event-stream`

---

#### `GET /api/mcp/sse/v2`
SSE transport (v2) with bidirectional session support.

**Auth:** MCP API key

**Response:** `Content-Type: text/event-stream`

---

#### `POST /api/mcp/message`
Send a JSON-RPC message to an active SSE session.

**Auth:** MCP API key

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | string | No | Session ID for v2 SSE transport |

**Body:** JSON-RPC 2.0 request

**Response:** JSON-RPC 2.0 response, or acknowledgement if response is queued to SSE session.

---

#### MCP Tools

The following tools are available via the `tools/call` method:

| Tool | Description | Required role |
|------|-------------|---------------|
| `list_accounts` | List all accounts accessible to the key owner | Any |
| `get_compliance_score` | Get current compliance score for an account | Any |
| `list_compliance_results` | List compliance findings (filterable by status, severity, resource type) | Any |
| `list_resources` | List cloud resources for an account | Any |
| `get_resource` | Get details for a single resource | Any |
| `list_events` | List recent Linode events for an account | Any |
| `get_reports` | List compliance reports for an account | Any |
| `get_account_status` | Get sync and evaluation status for an account | Any |
| `trigger_sync` | Trigger a manual sync and evaluation | `power_user` or `admin` |

---

### Health

#### `GET /health`
Health check endpoint.

**Auth:** None

**Response:**
```json
{ "status": "ok", "timestamp": "2026-01-01T00:00:00Z" }
```

---

## Error Responses

All error responses follow this shape:

```json
{ "detail": "Error message describing what went wrong" }
```

Common HTTP status codes:

| Code | Meaning |
|------|---------|
| `400` | Bad request — invalid input |
| `401` | Unauthorized — missing or invalid token |
| `403` | Forbidden — insufficient role or no account access |
| `404` | Not found |
| `409` | Conflict — e.g. duplicate email |
| `422` | Validation error — request body failed schema validation |
| `500` | Internal server error |
