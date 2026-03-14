import time
import psycopg2
import psycopg2.extras
from psycopg2.pool import ThreadedConnectionPool
from contextlib import contextmanager
from app.config import settings

_pool: ThreadedConnectionPool | None = None


def get_pool() -> ThreadedConnectionPool:
    global _pool
    if _pool is None:
        _pool = ThreadedConnectionPool(
            minconn=2,
            maxconn=30,
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            dbname=settings.DB_NAME,
            sslmode='require',
            cursor_factory=psycopg2.extras.RealDictCursor,
        )
    return _pool


@contextmanager
def get_conn():
    pool = get_pool()
    conn = None
    last_exc = None
    for attempt in range(5):
        try:
            conn = pool.getconn()
            break
        except Exception as e:
            last_exc = e
            if attempt < 4:
                time.sleep(0.2 * (2 ** attempt))
    if conn is None:
        raise last_exc
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


def get_db():
    with get_conn() as conn:
        yield conn
