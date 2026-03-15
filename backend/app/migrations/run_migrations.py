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

    _encrypt_plaintext_totp_secrets(conn)

    cur.close()
    conn.close()
    print("All migrations complete.")


def _encrypt_plaintext_totp_secrets(conn) -> None:
    from app.services.crypto import encrypt_token
    from cryptography.fernet import Fernet
    fernet = Fernet(settings.TOKEN_ENCRYPTION_KEY.encode())

    cur = conn.cursor()
    cur.execute("SELECT id, totp_secret FROM org_users WHERE totp_secret IS NOT NULL")
    rows = cur.fetchall()
    encrypted_count = 0
    for row in rows:
        user_id, secret = row[0], row[1]
        try:
            fernet.decrypt(secret.encode())
        except Exception:
            encrypted = encrypt_token(secret)
            cur.execute(
                "UPDATE org_users SET totp_secret = %s WHERE id = %s",
                (encrypted, user_id),
            )
            encrypted_count += 1
    conn.commit()
    if encrypted_count:
        print(f"Encrypted {encrypted_count} plaintext TOTP secret(s).")
    cur.close()


if __name__ == "__main__":
    run()
