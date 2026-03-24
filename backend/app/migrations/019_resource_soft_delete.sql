/*
  # Resource soft-delete

  ## Summary
  Adds a `deleted_at` column to the `resources` table so that resources removed
  from Linode are marked as deleted rather than lingering in the list indefinitely.

  ## Changes
  - `resources`: new nullable `deleted_at TIMESTAMPTZ` column (NULL = active)
  - Index on `deleted_at` for efficient filtering of live vs deleted rows

  ## Notes
  - Existing rows are unaffected (deleted_at stays NULL = still active)
  - The sync engine sets deleted_at = NOW() for any resource not returned by the
    Linode API in the most recent sync for that account
  - A re-appearing resource (e.g. restored) has deleted_at cleared back to NULL
  - All read queries filter WHERE deleted_at IS NULL
*/

ALTER TABLE resources ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_resources_deleted_at ON resources(deleted_at);
