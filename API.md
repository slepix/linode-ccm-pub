# Linode CCM — API Reference

Base URL: `http://<your-host>/api`

All protected endpoints require an `Authorization: Bearer <token>` header. Tokens are obtained from the login or register endpoints.

---

## Authentication

### Roles

| Role | Description |
|------|-------------|
| `admin` | Full access: user management, accounts, migrations |
| `power_user` | Can create accounts and trigger refresh operations |
| `auditor` | Read-only access to accounts they have been granted |

---

## Endpoints

### Auth

#### `GET /api/auth/registration-open`
Returns whether first-time registration is open (i.e., no users exist yet).

**Auth:** None

**Response:**
```json
{ "open": true }
```

---

#### `POST /api/auth/register`
Register the first admin user. Only works when no users exist.

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

---

#### `POST /api/auth/login`
Authenticate and receive a JWT token.

**Auth:** None

**Body:**
```json
{
  "email": "admin@example.com",
  "password": "secret"
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
    "role": "admin",
    "can_view_costs": true,
    "can_view_compliance": true
  }
}
```

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
  "webhook_api_key": "optional-key"
}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "Production",
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
  "webhook_api_key": "new-key"
}
```

**Response:** Updated account object.

---

#### `DELETE /api/accounts/{account_id}`
Delete an account.

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
| `resource_type` | string | No | Filter by type (e.g. `linode`, `nodebalancer`) |
| `region` | string | No | Filter by region |

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

**Response:** Array of snapshot objects.

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

**Response:** Latest score history record.

---

#### `GET /api/compliance/score/history`
Get compliance score history for an account.

**Auth:** Required

**Query Parameters:**

| Parameter | Type | Required | Default |
|-----------|------|----------|---------|
| `account_id` | string | Yes | — |
| `limit` | integer | No | 30 |

**Response:** Array of score history objects.

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
Acknowledge or un-acknowledge multiple compliance results.

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
Get compliance timeline for a resource.

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
| `account_id` | string | No | If provided, includes account-specific rule overrides |

**Response:** Array of rule objects.

---

#### `GET /api/compliance/rules/overrides`
Get rule overrides for an account.

**Auth:** Required

**Query Parameters:**

| Parameter | Type | Required |
|-----------|------|----------|
| `account_id` | string | Yes |

**Response:** Array of override objects.

---

#### `PUT /api/compliance/rules/{rule_id}/override`
Enable or disable a rule for an account.

**Auth:** Required — `admin`

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
Set rule configuration override for an account.

**Auth:** Required — `admin`

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
Set active profiles for an account.

**Auth:** Required — `admin`

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
Activate or deactivate a profile for an account.

**Auth:** Required — `admin`

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
Create a new compliance report.

**Auth:** Required

**Body:**
```json
{
  "account_id": "uuid",
  "title": "Q1 2026 Compliance Report",
  "description": "Quarterly review",
  "period_start": "2026-01-01T00:00:00Z",
  "period_end": "2026-03-31T23:59:59Z",
  "quarter": "Q1 2026"
}
```

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

| Parameter | Type | Required | Default |
|-----------|------|----------|---------|
| `account_id` | string | Yes | — |
| `action` | string | No | — |
| `entity_type` | string | No | — |
| `status` | string | No | — |
| `username` | string | No | — |
| `limit` | integer | No | 200 |
| `offset` | integer | No | 0 |

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

**Response:** User object.

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
Delete a user.

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
Trigger a sync via GET request (useful for webhooks/cron).

**Auth:** Optional — requires `REFRESH_API_SECRET` token via `?token=` param or Authorization header if configured.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `account_id` | string | No | Specific account to refresh |
| `token` | string | No | API secret token |
| `skip_sync` | boolean | No | Skip sync phase |
| `skip_eval` | boolean | No | Skip evaluation phase |

**Response:** Same as `POST /api/refresh`.

---

#### `GET /api/refresh/stream`
Stream sync progress as Server-Sent Events (SSE).

**Auth:** Required — `power_user` or `admin`

**Query Parameters:**

| Parameter | Type | Required |
|-----------|------|----------|
| `account_id` | string | No |
| `skip_sync` | boolean | No |
| `skip_eval` | boolean | No |

**Response:** `Content-Type: text/event-stream`

Event types:
- `phase` — Phase started (`sync` or `evaluate`)
- `sync_done` — Sync completed with resource count
- `eval_done` — Evaluation completed
- `log` — Log message string
- `done` — Final summary object
- `error` — Error message string

---

### Admin

#### `POST /api/admin/run-migrations`
Run pending database migrations.

**Auth:** Required — `admin`

**Response:**
```json
{ "success": true, "message": "Migrations completed" }
```

---

### Health

#### `GET /health`
Health check endpoint.

**Auth:** None

**Response:**
```json
{ "status": "ok", "timestamp": "2026-01-01T00:00:00Z" }
```
