import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import psycopg2
from app.config import settings


def _table_exists(cur, table_name: str) -> bool:
    cur.execute(
        "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = %s",
        (table_name,),
    )
    return cur.fetchone() is not None


_MIGRATION_GUARD_TABLES = {
    "001_initial_schema.sql": "resources",
    "002_seed_rules_profiles.sql": "compliance_profiles",
    "003_profiles_overrides_improvements.sql": "account_rule_overrides",
    "004_unique_builtin_rules.sql": "compliance_rules",
    "005_account_rule_configs.sql": "account_rule_configs",
    "006_new_compliance_rules.sql": "compliance_rules",
    "007_reports.sql": "reports",
    "008_seventeen_new_rules.sql": "compliance_rules",
    "009_new_security_profiles.sql": "compliance_profiles",
    "010_security_schema_fixes.sql": "compliance_results",
    "011_revoked_tokens.sql": "revoked_tokens",
    "012_sync_schedule.sql": "app_settings",
    "013_vpc_rules.sql": "compliance_rules",
    "014_two_factor_auth.sql": "org_users",
    "015_totp_lockout.sql": "org_users",
    "016_sync_profile_rule_counts.sql": "compliance_profiles",
}


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

        guard_table = _MIGRATION_GUARD_TABLES.get(sql_file.name)
        if guard_table and _table_exists(cur, guard_table):
            print(f"Marking {sql_file.name} as applied (table '{guard_table}' already exists)")
            cur.execute("INSERT INTO schema_migrations (filename) VALUES (%s)", (sql_file.name,))
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
