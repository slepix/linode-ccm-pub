/*
  # Per-Account Sync Interval

  Adds an optional sync interval override to each Linode account so that
  individual accounts can have different automatic sync frequencies.

  1. Modified Tables
    - `linode_accounts`
      - `sync_interval_minutes` (integer, nullable) — when set, overrides the
        global `app_settings.sync_interval_minutes` for this account. NULL means
        "use the global default".

  2. Notes
    - No RLS changes; this table is server-side only.
    - The scheduled endpoint now evaluates each account independently using its
      own last_sync_at and its own interval (falling back to the global default).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'linode_accounts' AND column_name = 'sync_interval_minutes'
  ) THEN
    ALTER TABLE linode_accounts ADD COLUMN sync_interval_minutes integer;
  END IF;
END $$;
