from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, validator
from app.auth import require_admin, prune_expired_tokens
from app.database import get_db
from app.migrations.run_migrations import run as run_migrations
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])

_MIN_SYNC_INTERVAL = 5


class SyncScheduleUpdate(BaseModel):
    interval_minutes: int

    @validator("interval_minutes")
    def validate_interval(cls, v):
        if v < _MIN_SYNC_INTERVAL:
            raise ValueError(f"Minimum sync interval is {_MIN_SYNC_INTERVAL} minutes")
        return v


@router.post("/run-migrations")
def trigger_migrations(current_user=Depends(require_admin)):
    try:
        run_migrations()
        return {"success": True, "message": "Migrations completed successfully"}
    except Exception as e:
        logger.error("Migration failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Migration failed. Check server logs for details.")


@router.post("/prune-tokens")
def trigger_prune_tokens(current_user=Depends(require_admin), db=Depends(get_db)):
    deleted = prune_expired_tokens(db)
    return {"success": True, "deleted": deleted}


@router.get("/settings/sync-schedule")
def get_sync_schedule(current_user=Depends(require_admin), db=Depends(get_db)):
    cur = db.cursor()
    cur.execute("SELECT value FROM app_settings WHERE key = 'sync_interval_minutes'")
    row = cur.fetchone()
    if not row:
        return {"interval_minutes": 60}
    return {"interval_minutes": int(row["value"])}


@router.put("/settings/sync-schedule")
def update_sync_schedule(
    body: SyncScheduleUpdate,
    current_user=Depends(require_admin),
    db=Depends(get_db),
):
    cur = db.cursor()
    cur.execute(
        """
        INSERT INTO app_settings (key, value, updated_at, updated_by)
        VALUES ('sync_interval_minutes', %s, now(), %s)
        ON CONFLICT (key) DO UPDATE
            SET value = EXCLUDED.value,
                updated_at = EXCLUDED.updated_at,
                updated_by = EXCLUDED.updated_by
        """,
        (str(body.interval_minutes), current_user["id"]),
    )
    db.commit()
    return {"success": True, "interval_minutes": body.interval_minutes}
