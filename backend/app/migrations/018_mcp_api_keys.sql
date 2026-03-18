/*
  # MCP API Keys

  Adds support for the Model Context Protocol (MCP) server integration.

  1. New Tables
    - `mcp_api_keys`
      - `id` (uuid, pk)
      - `user_id` (uuid, fk → org_users) — owner of this key
      - `name` (text) — human-friendly label
      - `key_hash` (text) — bcrypt hash of the raw key (raw key shown only once at creation)
      - `key_prefix` (text) — first 8 chars of raw key for display/identification
      - `is_active` (boolean, default true)
      - `last_used_at` (timestamptz, nullable)
      - `created_at` (timestamptz)
      - `expires_at` (timestamptz, nullable) — optional expiry

  2. Modified Tables
    - `app_settings` — new key `mcp_enabled` (default 'true')
      Controls whether the admin allows MCP access for this org.
      Individual keys can still be deactivated per user.

  3. Notes
    - The raw API key is never stored; only the bcrypt hash + display prefix.
    - Admins can see all keys; users see only their own.
    - MCP can be globally disabled via app_settings.mcp_enabled = 'false'.
*/

CREATE TABLE IF NOT EXISTS mcp_api_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES org_users(id) ON DELETE CASCADE,
  name          text NOT NULL DEFAULT '',
  key_hash      text NOT NULL,
  key_prefix    text NOT NULL,
  is_active     boolean NOT NULL DEFAULT TRUE,
  last_used_at  timestamptz,
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_user_id ON mcp_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_key_prefix ON mcp_api_keys(key_prefix);

INSERT INTO app_settings (key, value)
VALUES ('mcp_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
