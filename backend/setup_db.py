#!/usr/bin/env python3
"""
Database setup script.

Connects to PostgreSQL using root/superuser credentials, then:
  1. Creates a new application database
  2. Creates a dedicated application user with a random password
  3. Grants least-privilege permissions
  4. Runs all migration and seed SQL files against the new database
  5. Prints the resulting .env connection block and optionally writes it

Usage:
  python setup_db.py \
    --host <host> \
    --port <port> \
    --root-user <superuser> \
    --root-password <password> \
    [--db-name <new_db_name>] \
    [--app-user <new_user_name>] \
    [--ssl-mode require] \
    [--write-env]          # append/overwrite DB_* lines in ../backend/.env
"""

import argparse
import os
import re
import secrets
import string
import sys
from pathlib import Path

try:
    import psycopg2
    from psycopg2 import sql
    from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
except ImportError:
    sys.exit("psycopg2 is not installed. Run: pip install psycopg2-binary")

_IDENTIFIER_RE = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]{0,62}$')


def _validate_identifier(value: str, label: str) -> str:
    if not _IDENTIFIER_RE.match(value):
        sys.exit(
            f"ERROR: {label} '{value}' contains invalid characters. "
            "Use only letters, digits, and underscores, starting with a letter or underscore."
        )
    return value


MIGRATIONS_DIR = Path(__file__).parent / "app" / "migrations"


def generate_password(length: int = 32) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#%^&*()-_=+"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def connect(host, port, user, password, dbname, sslmode):
    return psycopg2.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        dbname=dbname,
        sslmode=sslmode,
    )


def db_exists(cur, name: str) -> bool:
    cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (name,))
    return cur.fetchone() is not None


def role_exists(cur, name: str) -> bool:
    cur.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (name,))
    return cur.fetchone() is not None


def create_database_and_user(args, app_password: str):
    _validate_identifier(args.app_user, "--app-user")
    _validate_identifier(args.db_name, "--db-name")

    print(f"\n[1/3] Connecting to '{args.admin_db}' as root user '{args.root_user}'...")
    root_conn = connect(
        args.host, args.port, args.root_user, args.root_password,
        args.admin_db, args.ssl_mode,
    )
    root_conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = root_conn.cursor()

    if role_exists(cur, args.app_user):
        print(f"  Role '{args.app_user}' already exists — skipping creation.")
    else:
        print(f"  Creating role '{args.app_user}'...")
        cur.execute(
            sql.SQL(
                "CREATE ROLE {} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %s"
            ).format(sql.Identifier(args.app_user)),
            (app_password,),
        )
        print(f"  Role '{args.app_user}' created.")

    if db_exists(cur, args.db_name):
        print(f"  Database '{args.db_name}' already exists — skipping creation.")
    else:
        print(f"  Creating database '{args.db_name}' owned by '{args.app_user}'...")
        cur.execute(
            sql.SQL("CREATE DATABASE {} OWNER {}").format(
                sql.Identifier(args.db_name),
                sql.Identifier(args.app_user),
            )
        )
        print(f"  Database '{args.db_name}' created.")

    cur.close()
    root_conn.close()


def grant_permissions(args, app_password: str):
    print(f"\n[2/3] Granting permissions in '{args.db_name}'...")
    app_conn = connect(
        args.host, args.port, args.root_user, args.root_password,
        args.db_name, args.ssl_mode,
    )
    app_conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = app_conn.cursor()

    db_id = sql.Identifier(args.db_name)
    user_id = sql.Identifier(args.app_user)

    statements = [
        sql.SQL("GRANT CONNECT ON DATABASE {} TO {}").format(db_id, user_id),
        sql.SQL("GRANT USAGE ON SCHEMA public TO {}").format(user_id),
        sql.SQL("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {}").format(user_id),
        sql.SQL("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {}").format(user_id),
        sql.SQL("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {}").format(user_id),
        sql.SQL("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO {}").format(user_id),
    ]

    for stmt in statements:
        cur.execute(stmt)

    cur.close()
    app_conn.close()
    print("  Permissions granted.")


def run_migrations(args):
    print(f"\n[3/3] Running migrations against '{args.db_name}'...")
    conn = connect(
        args.host, args.port, args.root_user, args.root_password,
        args.db_name, args.ssl_mode,
    )
    conn.autocommit = True
    cur = conn.cursor()

    sql_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not sql_files:
        print("  No SQL migration files found — skipping.")
    else:
        for sql_file in sql_files:
            print(f"  Running {sql_file.name}...")
            cur.execute(sql_file.read_text())
            print(f"    OK")

    cur.close()
    conn.close()
    print("  Migrations complete.")


def build_env_block(args, app_password: str) -> str:
    return (
        f"DB_HOST={args.host}\n"
        f"DB_PORT={args.port}\n"
        f"DB_NAME={args.db_name}\n"
        f"DB_USER={args.app_user}\n"
        f"DB_PASSWORD={app_password}\n"
        f"DB_SSL={args.ssl_mode}\n"
    )


def write_env(env_block: str):
    env_path = Path(__file__).parent / ".env"
    existing = env_path.read_text() if env_path.exists() else ""

    db_keys = {"DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD", "DB_SSL"}
    cleaned_lines = [
        line for line in existing.splitlines()
        if not any(line.startswith(k + "=") for k in db_keys)
    ]
    cleaned = "\n".join(cleaned_lines).strip()
    new_content = (cleaned + "\n\n" + env_block).lstrip("\n")
    env_path.write_text(new_content)
    print(f"\n  Written to {env_path}")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Bootstrap a new app database and user from root credentials."
    )
    parser.add_argument("--host", required=True, help="PostgreSQL host")
    parser.add_argument("--port", default=5432, type=int, help="PostgreSQL port (default: 5432)")
    parser.add_argument("--root-user", required=True, help="Superuser / root username")
    parser.add_argument("--root-password", required=True, help="Superuser password")
    parser.add_argument("--admin-db", default="postgres",
                        help="Existing admin database to connect to first (default: postgres)")
    parser.add_argument("--db-name", default="appdb",
                        help="Name for the new application database (default: appdb)")
    parser.add_argument("--app-user", default="appuser",
                        help="Name for the new application user (default: appuser)")
    parser.add_argument("--ssl-mode", default="require",
                        choices=["disable", "allow", "prefer", "require", "verify-ca", "verify-full"],
                        help="SSL mode (default: require)")
    parser.add_argument("--write-env", action="store_true",
                        help="Write DB_* variables into backend/.env")
    return parser.parse_args()


def main():
    args = parse_args()
    app_password = generate_password()

    try:
        create_database_and_user(args, app_password)
        grant_permissions(args, app_password)
        run_migrations(args)
    except psycopg2.Error as exc:
        print(f"\nERROR: {exc}", file=sys.stderr)
        sys.exit(1)

    env_block = build_env_block(args, app_password)

    print("\n" + "=" * 60)
    print("SUCCESS — New connection details:")
    print("=" * 60)
    print(env_block)

    if args.write_env:
        write_env(env_block)
        print("DB_* lines have been written to backend/.env")
    else:
        print("Tip: re-run with --write-env to automatically update backend/.env")

    print("=" * 60)


if __name__ == "__main__":
    main()
