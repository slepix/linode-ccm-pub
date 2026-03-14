import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import psycopg2
from app.config import settings


def run():
    conn = psycopg2.connect(
        host=settings.DB_HOST,
        port=settings.DB_PORT,
        user=settings.DB_USER,
        password=settings.DB_PASSWORD,
        dbname=settings.DB_NAME,
        sslmode='require'
    )
    conn.autocommit = True
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            filename TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    migrations_dir = Path(__file__).parent
    sql_files = sorted(migrations_dir.glob("*.sql"))

    for sql_file in sql_files:
        cur.execute("SELECT 1 FROM schema_migrations WHERE filename = %s", (sql_file.name,))
        if cur.fetchone():
            print(f"Skipping {sql_file.name} (already applied)")
            continue

        print(f"Running {sql_file.name}...")
        sql = sql_file.read_text()
        cur.execute(sql)
        cur.execute("INSERT INTO schema_migrations (filename) VALUES (%s)", (sql_file.name,))
        print(f"  Done.")

    cur.close()
    conn.close()
    print("All migrations complete.")


if __name__ == "__main__":
    run()
