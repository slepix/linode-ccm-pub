/*
  # Add Two-Factor Authentication (2FA) Support

  ## Summary
  Adds TOTP-based two-factor authentication columns to org_users so users can
  optionally enable an authenticator app (Google Authenticator, Authy, etc.) for login.

  ## Modified Tables

  ### org_users
  - `totp_secret` (text, nullable) — encrypted TOTP secret key; NULL means 2FA not configured
  - `totp_enabled` (boolean, default false) — whether 2FA is actively enforced on login

  ## Notes
  1. `totp_secret` is stored but only activated when `totp_enabled` is TRUE
  2. During setup the secret is stored before confirmation; it is only enabled once the
     user proves they can generate a valid code
  3. Disabling 2FA clears both fields
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'org_users' AND column_name = 'totp_secret'
  ) THEN
    ALTER TABLE org_users ADD COLUMN totp_secret TEXT DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'org_users' AND column_name = 'totp_enabled'
  ) THEN
    ALTER TABLE org_users ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;
