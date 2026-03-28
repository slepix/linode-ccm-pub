"""
MCP (Model Context Protocol) server router.

Implements the MCP 2024-11-05 specification over HTTP with two transports:
  - HTTP+SSE  (GET /api/mcp/sse  streams events; POST /api/mcp/message sends client→server)
  - Streamable HTTP (POST /api/mcp  – single round-trip, used by Claude Desktop stdio bridge)

Authentication: Bearer mcp_<key>  OR  X-MCP-Key: <key>
"""

import json
import uuid
import asyncio
import bcrypt
from datetime import datetime, timezone
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from fastapi.responses import StreamingResponse, JSONResponse
from app.database import get_db

router = APIRouter(prefix="/api/mcp", tags=["mcp"])

_PROTOCOL_VERSION = "2024-11-05"
_SERVER_INFO = {"name": "Akamai CCM MCP", "version": "1.0.0"}

_ACCOUNT_REF_PROPS = {
    "account_id": {
        "type": "string",
        "description": "UUID of the Linode account. Use this OR account_name.",
    },
    "account_name": {
        "type": "string",
        "description": "Human-readable name of the account (e.g. 'production', 'staging'). Case-insensitive, partial match accepted. Use this OR account_id.",
    },
}

_TOOLS = [
    {
        "name": "list_accounts",
        "description": (
            "List all Linode cloud accounts managed by this CCM instance. "
            "Returns each account's id and name. Call this first if you need to look up an account by name."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_compliance_score",
        "description": (
            "Get the current compliance score and summary for a Linode account. "
            "Provide either account_id (UUID) or account_name (human-readable name such as 'production')."
        ),
        "inputSchema": {
            "type": "object",
            "properties": _ACCOUNT_REF_PROPS,
            "required": [],
        },
    },
    {
        "name": "list_compliance_results",
        "description": (
            "List compliance check results for a Linode account, optionally filtered by status or severity. "
            "Provide either account_id (UUID) or account_name (e.g. 'production')."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                **_ACCOUNT_REF_PROPS,
                "status": {
                    "type": "string",
                    "enum": ["compliant", "non_compliant", "not_applicable"],
                    "description": "Filter by compliance status.",
                },
                "severity": {
                    "type": "string",
                    "enum": ["critical", "warning", "info"],
                    "description": "Filter by rule severity.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum results to return (default 50, max 200).",
                    "default": 50,
                },
            },
            "required": [],
        },
    },
    {
        "name": "list_resources",
        "description": (
            "List cloud resources (Linodes, NodeBalancers, Volumes, etc.) for an account. "
            "Provide either account_id (UUID) or account_name (e.g. 'production')."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                **_ACCOUNT_REF_PROPS,
                "resource_type": {
                    "type": "string",
                    "description": "Filter by resource type (e.g. linode, nodebalancer, volume).",
                },
                "region": {"type": "string", "description": "Filter by region slug."},
            },
            "required": [],
        },
    },
    {
        "name": "get_resource",
        "description": "Get full details of a single resource including specs.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "resource_id": {"type": "string", "description": "UUID of the resource."},
            },
            "required": ["resource_id"],
        },
    },
    {
        "name": "list_events",
        "description": (
            "List recent Linode cloud events (audit log) for an account. "
            "Provide either account_id (UUID) or account_name (e.g. 'production')."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                **_ACCOUNT_REF_PROPS,
                "limit": {
                    "type": "integer",
                    "description": "Maximum events to return (default 50, max 200).",
                    "default": 50,
                },
            },
            "required": [],
        },
    },
    {
        "name": "trigger_sync",
        "description": (
            "Trigger a manual sync and compliance evaluation for all accounts or a specific account. "
            "Provide either account_id (UUID) or account_name (e.g. 'production'), or omit both to sync all. "
            "Requires admin or power_user role."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                **_ACCOUNT_REF_PROPS,
                "skip_eval": {
                    "type": "boolean",
                    "description": "Skip compliance evaluation after sync (default false).",
                    "default": False,
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_reports",
        "description": (
            "List compliance reports generated for an account. "
            "Provide either account_id (UUID) or account_name (e.g. 'production')."
        ),
        "inputSchema": {
            "type": "object",
            "properties": _ACCOUNT_REF_PROPS,
            "required": [],
        },
    },
    {
        "name": "get_account_status",
        "description": (
            "Get the last sync time and last compliance check time for one or all accounts. "
            "Useful for checking how fresh the data is. "
            "Omit both account_id and account_name to get the status of all accessible accounts."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "account_id": {
                    "type": "string",
                    "description": "UUID of the account (optional). Omit to get all accounts.",
                },
                "account_name": {
                    "type": "string",
                    "description": "Name of the account (optional, e.g. 'production'). Omit to get all accounts.",
                },
            },
            "required": [],
        },
    },
]


def _verify_api_key(raw: str, db) -> Optional[dict]:
    """Verify an MCP API key and return the associated user, or None."""
    prefix = raw[:12]
    cur = db.cursor()
    cur.execute("""
        SELECT k.id, k.key_hash, k.is_active, k.expires_at,
               u.id as user_id, u.email, u.full_name, u.role, u.is_active as user_active
        FROM mcp_api_keys k
        JOIN org_users u ON u.id = k.user_id
        WHERE k.key_prefix = %s
    """, (prefix,))
    rows = cur.fetchall()
    for row in rows:
        if not row["is_active"] or not row["user_active"]:
            continue
        if row["expires_at"] and row["expires_at"] < datetime.now(timezone.utc):
            continue
        try:
            if bcrypt.checkpw(raw.encode(), row["key_hash"].encode()):
                cur.execute(
                    "UPDATE mcp_api_keys SET last_used_at = NOW() WHERE id = %s",
                    (str(row["id"]),),
                )
                db.commit()
                return {
                    "id": str(row["user_id"]),
                    "email": row["email"],
                    "full_name": row["full_name"],
                    "role": row["role"],
                }
        except Exception:
            continue
    return None


def _mcp_enabled(db) -> bool:
    cur = db.cursor()
    cur.execute("SELECT value FROM app_settings WHERE key = 'mcp_enabled'")
    row = cur.fetchone()
    if not row:
        return True
    return (row["value"] or "true").lower() not in ("false", "0", "no")


def _get_mcp_user(request: Request, db) -> dict:
    """Extract and validate an MCP API key from the request."""
    if not _mcp_enabled(db):
        raise HTTPException(status_code=403, detail="MCP access is disabled")

    raw_key: Optional[str] = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        raw_key = auth_header[7:].strip()
    if not raw_key:
        raw_key = request.headers.get("X-MCP-Key", "").strip()

    if not raw_key or not raw_key.startswith("mcp_"):
        raise HTTPException(status_code=401, detail="Valid MCP API key required")

    user = _verify_api_key(raw_key, db)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired MCP API key")
    return user


def _user_can_access_account(user: dict, account_id: str, db) -> bool:
    if user["role"] == "admin":
        return True
    cur = db.cursor()
    cur.execute(
        "SELECT id FROM user_account_access WHERE user_id = %s AND account_id = %s",
        (str(user["id"]), account_id),
    )
    return cur.fetchone() is not None


def _resolve_account_id(arguments: dict, user: dict, db) -> tuple[Optional[str], Optional[dict]]:
    """
    Resolve account_id from either 'account_id' or 'account_name' in arguments.
    Returns (account_id, error_response). If error_response is not None, return it immediately.
    """
    account_id = arguments.get("account_id", "").strip()
    account_name = arguments.get("account_name", "").strip()

    if account_id:
        if not _user_can_access_account(user, account_id, db):
            return None, {"content": [{"type": "text", "text": "Access denied to this account."}], "isError": True}
        return account_id, None

    if account_name:
        cur = db.cursor()
        if user["role"] == "admin":
            cur.execute(
                "SELECT id, name FROM linode_accounts WHERE name ILIKE %s ORDER BY name LIMIT 5",
                (f"%{account_name}%",),
            )
        else:
            cur.execute("""
                SELECT a.id, a.name FROM linode_accounts a
                JOIN user_account_access uaa ON uaa.account_id = a.id
                WHERE uaa.user_id = %s AND a.name ILIKE %s
                ORDER BY a.name LIMIT 5
            """, (str(user["id"]), f"%{account_name}%"))
        matches = cur.fetchall()

        if not matches:
            accounts = _accessible_accounts(user, db)
            names = ", ".join(f'"{a["name"]}"' for a in accounts) or "none"
            return None, {
                "content": [{
                    "type": "text",
                    "text": (
                        f'No account found matching "{account_name}". '
                        f"Available accounts: {names}. "
                        "Please retry with the exact name or use account_id."
                    ),
                }],
                "isError": True,
            }

        if len(matches) > 1:
            names = ", ".join(f'"{r["name"]}"' for r in matches)
            return None, {
                "content": [{
                    "type": "text",
                    "text": (
                        f'Multiple accounts match "{account_name}": {names}. '
                        "Please be more specific or use account_id."
                    ),
                }],
                "isError": True,
            }

        resolved_id = str(matches[0]["id"])
        if not _user_can_access_account(user, resolved_id, db):
            return None, {"content": [{"type": "text", "text": "Access denied to this account."}], "isError": True}
        return resolved_id, None

    return None, {
        "content": [{"type": "text", "text": "Please provide either account_id or account_name."}],
        "isError": True,
    }


def _accessible_accounts(user: dict, db) -> list:
    cur = db.cursor()
    if user["role"] == "admin":
        cur.execute("SELECT id, name, last_sync_at, last_evaluated_at FROM linode_accounts ORDER BY name")
    else:
        cur.execute("""
            SELECT a.id, a.name, a.last_sync_at, a.last_evaluated_at
            FROM linode_accounts a
            JOIN user_account_access uaa ON uaa.account_id = a.id
            WHERE uaa.user_id = %s
            ORDER BY a.name
        """, (str(user["id"]),))
    rows = cur.fetchall()
    result = []
    for r in rows:
        row = dict(r)
        for f in ("last_sync_at", "last_evaluated_at"):
            if row.get(f) and hasattr(row[f], "isoformat"):
                row[f] = row[f].isoformat()
        result.append(row)
    return result


def _handle_tool_call(name: str, arguments: dict, user: dict, db) -> dict:
    """Execute a tool call and return a MCP content list."""
    try:
        if name == "list_accounts":
            accounts = _accessible_accounts(user, db)
            text = json.dumps(accounts, indent=2, default=str)
            return {"content": [{"type": "text", "text": text}]}

        elif name == "get_compliance_score":
            account_id, err = _resolve_account_id(arguments, user, db)
            if err:
                return err
            cur = db.cursor()
            cur.execute("""
                SELECT
                    cr.rule_id,
                    rule.severity,
                    CASE WHEN cr.acknowledged = TRUE THEN 'compliant' ELSE cr.status END as effective_status
                FROM compliance_results cr
                JOIN compliance_rules rule ON rule.id = cr.rule_id
                WHERE cr.account_id = %s AND cr.status != 'not_applicable'
            """, (account_id,))
            rows = cur.fetchall()
            if not rows:
                return {"content": [{"type": "text", "text": json.dumps({"account_id": account_id, "compliance_score": None, "message": "No results found"})}]}
            compliant = sum(1 for r in rows if r["effective_status"] == "compliant")
            non_compliant = sum(1 for r in rows if r["effective_status"] == "non_compliant")
            total = compliant + non_compliant
            score = round((compliant / total) * 100, 1) if total > 0 else None
            result = {
                "account_id": account_id,
                "compliance_score": score,
                "compliant_count": compliant,
                "non_compliant_count": non_compliant,
                "total_checks": total,
            }
            return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}

        elif name == "list_compliance_results":
            account_id, err = _resolve_account_id(arguments, user, db)
            if err:
                return err
            status_filter = arguments.get("status")
            severity_filter = arguments.get("severity")
            limit = min(int(arguments.get("limit", 50)), 200)
            cur = db.cursor()
            params = [account_id]
            extra = ""
            if status_filter:
                extra += " AND cr.status = %s"
                params.append(status_filter)
            if severity_filter:
                extra += " AND rule.severity = %s"
                params.append(severity_filter)
            params.append(limit)
            cur.execute(f"""
                SELECT cr.id, cr.status, cr.detail, cr.acknowledged, cr.evaluated_at,
                       rule.name as rule_name, rule.severity, rule.description as rule_description,
                       res.label as resource_label, res.resource_type, res.region
                FROM compliance_results cr
                JOIN compliance_rules rule ON rule.id = cr.rule_id
                LEFT JOIN resources res ON res.id = cr.resource_id
                WHERE cr.account_id = %s{extra}
                ORDER BY
                    CASE cr.status WHEN 'non_compliant' THEN 1 WHEN 'compliant' THEN 2 ELSE 3 END,
                    CASE rule.severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END
                LIMIT %s
            """, params)
            rows = [dict(r) for r in cur.fetchall()]
            for r in rows:
                for f in ("evaluated_at",):
                    if r.get(f) and hasattr(r[f], "isoformat"):
                        r[f] = r[f].isoformat()
            return {"content": [{"type": "text", "text": json.dumps(rows, indent=2, default=str)}]}

        elif name == "list_resources":
            account_id, err = _resolve_account_id(arguments, user, db)
            if err:
                return err
            cur = db.cursor()
            params = [account_id]
            extra = ""
            if arguments.get("resource_type"):
                extra += " AND resource_type = %s"
                params.append(arguments["resource_type"])
            if arguments.get("region"):
                extra += " AND region = %s"
                params.append(arguments["region"])
            cur.execute(f"""
                SELECT id, resource_id, resource_type, label, region, status,
                       last_synced_at
                FROM resources
                WHERE account_id = %s{extra}
                ORDER BY resource_type, label
                LIMIT 500
            """, params)
            rows = [dict(r) for r in cur.fetchall()]
            for r in rows:
                for f in ("last_synced_at",):
                    if r.get(f) and hasattr(r[f], "isoformat"):
                        r[f] = r[f].isoformat()
            return {"content": [{"type": "text", "text": json.dumps(rows, indent=2, default=str)}]}

        elif name == "get_resource":
            resource_id = arguments.get("resource_id", "")
            cur = db.cursor()
            cur.execute("""
                SELECT r.*, a.name as account_name
                FROM resources r
                JOIN linode_accounts a ON a.id = r.account_id
                WHERE r.id = %s
            """, (resource_id,))
            row = cur.fetchone()
            if not row:
                return {"content": [{"type": "text", "text": "Resource not found."}], "isError": True}
            row = dict(row)
            if not _user_can_access_account(user, str(row["account_id"]), db):
                return {"content": [{"type": "text", "text": "Access denied."}], "isError": True}
            for f in ("resource_created_at", "last_synced_at", "created_at", "updated_at"):
                if row.get(f) and hasattr(row[f], "isoformat"):
                    row[f] = row[f].isoformat()
            return {"content": [{"type": "text", "text": json.dumps(row, indent=2, default=str)}]}

        elif name == "list_events":
            account_id, err = _resolve_account_id(arguments, user, db)
            if err:
                return err
            limit = min(int(arguments.get("limit", 50)), 200)
            cur = db.cursor()
            cur.execute("""
                SELECT event_id, action, entity_id, entity_type, entity_label,
                       message, status, username, event_created
                FROM linode_events
                WHERE account_id = %s
                ORDER BY event_created DESC NULLS LAST
                LIMIT %s
            """, (account_id, limit))
            rows = [dict(r) for r in cur.fetchall()]
            for r in rows:
                if r.get("event_created") and hasattr(r["event_created"], "isoformat"):
                    r["event_created"] = r["event_created"].isoformat()
            return {"content": [{"type": "text", "text": json.dumps(rows, indent=2, default=str)}]}

        elif name == "trigger_sync":
            if user["role"] not in ("admin", "power_user"):
                return {"content": [{"type": "text", "text": "Insufficient permissions to trigger sync."}], "isError": True}
            import httpx
            import os
            base = os.getenv("MCP_INTERNAL_BASE", "http://localhost:8000")
            skip_eval = arguments.get("skip_eval", False)
            account_id = None
            if arguments.get("account_id") or arguments.get("account_name"):
                account_id, err = _resolve_account_id(arguments, user, db)
                if err:
                    return err
            params = {"skip_eval": str(skip_eval).lower()}
            if account_id:
                params["account_id"] = account_id
            try:
                secret = os.getenv("REFRESH_API_SECRET", "")
                resp = httpx.post(
                    f"{base}/api/refresh",
                    params=params,
                    headers={"X-Refresh-Secret": secret} if secret else {},
                    timeout=10.0,
                )
                if resp.status_code == 200:
                    return {"content": [{"type": "text", "text": "Sync triggered successfully."}]}
                return {"content": [{"type": "text", "text": f"Sync failed with status {resp.status_code}."}], "isError": True}
            except Exception as exc:
                return {"content": [{"type": "text", "text": f"Failed to trigger sync: {exc}"}], "isError": True}

        elif name == "get_reports":
            account_id, err = _resolve_account_id(arguments, user, db)
            if err:
                return err
            cur = db.cursor()
            cur.execute("""
                SELECT id, title, description, period_start, period_end, quarter, status, created_at
                FROM reports
                WHERE account_id = %s
                ORDER BY created_at DESC
                LIMIT 50
            """, (account_id,))
            rows = [dict(r) for r in cur.fetchall()]
            for r in rows:
                for f in ("period_start", "period_end", "created_at"):
                    if r.get(f) and hasattr(r[f], "isoformat"):
                        r[f] = r[f].isoformat()
            return {"content": [{"type": "text", "text": json.dumps(rows, indent=2, default=str)}]}

        elif name == "get_account_status":
            wants_specific = arguments.get("account_id") or arguments.get("account_name")
            if wants_specific:
                account_id, err = _resolve_account_id(arguments, user, db)
                if err:
                    return err
                cur = db.cursor()
                cur.execute("""
                    SELECT id, name, last_sync_at, last_evaluated_at
                    FROM linode_accounts
                    WHERE id = %s
                """, (account_id,))
                rows = [cur.fetchone()]
            else:
                rows = _accessible_accounts(user, db)
                cur = None

            results = []
            for r in rows:
                if r is None:
                    continue
                row = dict(r)
                last_sync = row.get("last_sync_at")
                last_eval = row.get("last_evaluated_at")
                results.append({
                    "account_id": str(row["id"]),
                    "account_name": row["name"],
                    "last_sync_at": last_sync.isoformat() if last_sync and hasattr(last_sync, "isoformat") else last_sync,
                    "last_compliance_check_at": last_eval.isoformat() if last_eval and hasattr(last_eval, "isoformat") else last_eval,
                    "sync_status": "never" if not last_sync else "ok",
                    "compliance_check_status": "never" if not last_eval else "ok",
                })

            return {"content": [{"type": "text", "text": json.dumps(results if len(results) != 1 else results[0], indent=2, default=str)}]}

        else:
            return {
                "content": [{"type": "text", "text": f"Unknown tool: {name}"}],
                "isError": True,
            }

    except HTTPException:
        raise
    except Exception as exc:
        return {"content": [{"type": "text", "text": f"Tool error: {exc}"}], "isError": True}


def _make_response(id, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": id, "result": result}


def _make_error(id, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": id, "error": {"code": code, "message": message}}


def _dispatch_rpc(msg: dict, user: dict, db) -> dict:
    method = msg.get("method", "")
    params = msg.get("params") or {}
    id_ = msg.get("id")

    if method == "initialize":
        return _make_response(id_, {
            "protocolVersion": _PROTOCOL_VERSION,
            "serverInfo": _SERVER_INFO,
            "capabilities": {"tools": {}},
        })

    elif method == "tools/list":
        return _make_response(id_, {"tools": _TOOLS})

    elif method == "tools/call":
        tool_name = params.get("name", "")
        arguments = params.get("arguments") or {}
        result = _handle_tool_call(tool_name, arguments, user, db)
        return _make_response(id_, result)

    elif method == "ping":
        return _make_response(id_, {})

    else:
        return _make_error(id_, -32601, f"Method not found: {method}")


@router.post("")
async def mcp_streamable_http(request: Request, db=Depends(get_db)):
    """Streamable HTTP transport – single request/response round-trip."""
    user = _get_mcp_user(request, db)
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}}, status_code=400)

    if isinstance(body, list):
        responses = [_dispatch_rpc(msg, user, db) for msg in body]
        return JSONResponse(responses)

    response = _dispatch_rpc(body, user, db)
    return JSONResponse(response)


@router.get("/sse")
async def mcp_sse(request: Request, db=Depends(get_db)):
    """SSE transport — server pushes endpoint URL, client sends requests to /api/mcp/message."""
    user = _get_mcp_user(request, db)
    session_id = str(uuid.uuid4())

    async def event_stream() -> AsyncGenerator[str, None]:
        endpoint_url = str(request.base_url).rstrip("/") + f"/api/mcp/message?session={session_id}"
        yield f"event: endpoint\ndata: {json.dumps({'uri': endpoint_url})}\n\n"

        keepalive_interval = 15
        elapsed = 0
        while True:
            await asyncio.sleep(1)
            elapsed += 1
            if await request.is_disconnected():
                break
            if elapsed % keepalive_interval == 0:
                yield ": keepalive\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


_sse_sessions: dict[str, asyncio.Queue] = {}


@router.get("/sse/v2")
async def mcp_sse_v2(request: Request, db=Depends(get_db)):
    """SSE v2 — bidirectional session via shared queue."""
    user = _get_mcp_user(request, db)
    session_id = str(uuid.uuid4())
    queue: asyncio.Queue = asyncio.Queue()
    _sse_sessions[session_id] = queue

    async def event_stream() -> AsyncGenerator[str, None]:
        endpoint_url = str(request.base_url).rstrip("/") + f"/api/mcp/message?session={session_id}"
        yield f"event: endpoint\ndata: {json.dumps({'uri': endpoint_url})}\n\n"
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = queue.get_nowait()
                    yield f"event: message\ndata: {json.dumps(msg)}\n\n"
                except asyncio.QueueEmpty:
                    await asyncio.sleep(0.5)
        finally:
            _sse_sessions.pop(session_id, None)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/message")
async def mcp_message(request: Request, session: Optional[str] = None, db=Depends(get_db)):
    """Receive a client JSON-RPC message, dispatch it, and push response to SSE queue."""
    user = _get_mcp_user(request, db)
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}}, status_code=400)

    response = _dispatch_rpc(body, user, db)

    if session and session in _sse_sessions:
        await _sse_sessions[session].put(response)
        return JSONResponse({"ok": True})

    return JSONResponse(response)
