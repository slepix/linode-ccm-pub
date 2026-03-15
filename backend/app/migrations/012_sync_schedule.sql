/*
  # Sync Schedule Settings

  Adds a global settings table to store admin-configurable application settings,
  starting with the auto-sync schedule.

  1. New Tables
    - `app_settings`
      - `key` (text, primary key) — setting name
      - `value` (text) — setting value (stored as text, interpreted by the app)
      - `updated_at` (timestamptz) — last modified timestamp
      - `updated_by` (uuid) — user who last modified the setting

  2. Default Data
    - Inserts a default `sync_interval_minutes` setting of 60 minutes
    - Minimum enforced at the application layer (5 minutes)

  3. Notes
    - Single-row-per-key pattern, easy to extend with new settings
    - No RLS needed as this is a server-side internal table accessed only via authenticated API
*/

CREATE TABLE IF NOT EXISTS app_settings (
    key text PRIMARY KEY,
    value text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid
);

INSERT INTO app_settings (key, value) VALUES ('sync_interval_minutes', '60')
ON CONFLICT (key) DO NOTHING;
