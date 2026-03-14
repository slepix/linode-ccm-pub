from fastapi import APIRouter, Depends, HTTPException
from app.auth import require_admin, prune_expired_tokens
from app.database import get_db
from app.migrations.run_migrations import run as run_migrations
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


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
