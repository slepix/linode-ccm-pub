from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import json
import logging
import queue
import secrets
import threading

logger = logging.getLogger(__name__)

from app.database import get_db, get_conn
from app.auth import get_current_user, require_power_or_admin
from app.config import settings
from app.services.sync_engine import sync_account
from app.services.evaluator import evaluate_account
from app.services.crypto import decrypt_token

router = APIRouter(tags=["refresh"])


class RefreshRequest(BaseModel):
    account_id: Optional[str] = None
    skip_sync: bool = False
    skip_eval: bool = False


def _check_api_auth(request: Request) -> bool:
    expected = settings.REFRESH_API_SECRET
    if not expected:
        return False
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return False
    candidate = auth[7:]
    if not candidate:
        return False
    return secrets.compare_digest(candidate.encode(), expected.encode())


@router.post("/api/refresh")
def refresh_post(body: RefreshRequest, request: Request, db=Depends(get_db),
                 current_user=Depends(require_power_or_admin)):
    return _do_refresh(body.account_id, body.skip_sync, body.skip_eval, db)


@router.get("/api/refresh")
def refresh_get(
    request: Request,
    account_id: Optional[str] = Query(None),
    skip_sync: bool = Query(False),
    skip_eval: bool = Query(False),
    db=Depends(get_db),
):
    if not _check_api_auth(request):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return _do_refresh(account_id, skip_sync, skip_eval, db)


@router.get("/api/refresh/stream")
def refresh_stream(
    request: Request,
    account_id: Optional[str] = Query(None),
    skip_sync: bool = Query(False),
    skip_eval: bool = Query(False),
    current_user=Depends(require_power_or_admin),
):
    q: queue.Queue = queue.Queue()

    def run():
        try:
            with get_conn() as thread_db:
                cur = thread_db.cursor()
                if account_id:
                    cur.execute("SELECT id, api_token FROM linode_accounts WHERE id = %s", (account_id,))
                else:
                    cur.execute("SELECT id, api_token FROM linode_accounts")
                accounts = [dict(r) for r in cur.fetchall()]

            if not accounts:
                q.put(json.dumps({"type": "error", "message": "No accounts found"}))
                q.put(None)
                return

            results = []
            for acc in accounts:
                acc_id = str(acc["id"])
                token = decrypt_token(acc["api_token"])
                acc_result: dict = {"account_id": acc_id}
                log_proxy = _QueueLog(q, acc_id)
                try:
                    if not skip_sync:
                        q.put(json.dumps({"type": "phase", "phase": "sync", "account_id": acc_id}))
                        with get_conn() as sync_db:
                            count = sync_account(acc_id, token, sync_db, log_proxy)
                        acc_result["sync"] = {"success": True, "count": count}
                        q.put(json.dumps({"type": "sync_done", "count": count}))
                    if not skip_eval:
                        q.put(json.dumps({"type": "phase", "phase": "evaluate", "account_id": acc_id}))
                        with get_conn() as eval_db:
                            eval_result = evaluate_account(acc_id, token, eval_db, log_proxy)
                        acc_result["eval"] = eval_result
                        q.put(json.dumps({"type": "eval_done", "result": eval_result}))
                except Exception as e:
                    logger.exception("Sync/eval error for account %s", acc_id)
                    q.put(json.dumps({"type": "log", "message": f"[{acc_id[:8]}] ERROR: Sync failed. See server logs."}))
                    acc_result["error"] = "Sync failed. See server logs."
                results.append(acc_result)

            q.put(json.dumps({
                "type": "done",
                "accounts_processed": len(accounts),
                "results": results,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }))
        except Exception as e:
            logger.exception("Unexpected error in refresh stream")
            q.put(json.dumps({"type": "error", "message": "An unexpected error occurred. See server logs."}))
        finally:
            q.put(None)

    def generate():
        t = threading.Thread(target=run, daemon=True)
        t.start()
        while True:
            item = q.get()
            if item is None:
                break
            yield f"data: {item}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


class _QueueLog(list):
    def __init__(self, q: queue.Queue, acc_id: str):
        super().__init__()
        self._q = q
        self._acc_id = acc_id

    def append(self, item):
        super().append(item)
        self._q.put(json.dumps({"type": "log", "message": item}))


@router.get("/health")
def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


def _do_refresh(account_id: Optional[str], skip_sync: bool, skip_eval: bool, db) -> dict:
    cur = db.cursor()
    if account_id:
        cur.execute("SELECT id, api_token FROM linode_accounts WHERE id = %s", (account_id,))
        accounts = [dict(r) for r in cur.fetchall()]
    else:
        cur.execute("SELECT id, api_token FROM linode_accounts")
        accounts = [dict(r) for r in cur.fetchall()]

    if not accounts:
        raise HTTPException(status_code=404, detail="No accounts found")

    log = []
    results = []
    for acc in accounts:
        acc_id = str(acc["id"])
        token = decrypt_token(acc["api_token"])
        acc_result: dict = {"account_id": acc_id}
        try:
            if not skip_sync:
                count = sync_account(acc_id, token, db, log)
                acc_result["sync"] = {"success": True, "count": count}
            if not skip_eval:
                eval_result = evaluate_account(acc_id, token, db, log)
                acc_result["eval"] = eval_result
        except Exception as e:
            logger.exception("Sync/eval error for account %s", acc_id)
            log.append(f"[{acc_id[:8]}] ERROR: Sync failed. See server logs.")
            acc_result["error"] = "Sync failed. See server logs."
        results.append(acc_result)

    return {
        "success": True,
        "accounts_processed": len(accounts),
        "results": results,
        "log": log,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
