/*
  # Add TOTP Brute-Force Lockout Fields

  ## Summary
  Adds two columns to org_users to track consecutive TOTP verification failures
  and enforce a temporary account lockout when the threshold is exceeded. This
  prevents brute-force attacks against the 6-digit TOTP code space.

  ## Modified Tables

  ### org_users
  - `totp_fail_count` (integer, default 0) — rolling count of consecutive TOTP
    failures since the last successful verification or the last lockout reset.
  - `totp_locked_until` (timestamptz, nullable) — when set to a future timestamp
    the user's TOTP verification is rejected until that time has passed, regardless
    of the code supplied.

  ## Security Notes
  1. The application increments `totp_fail_count` on each failed TOTP attempt.
  2. After 5 consecutive failures the account is locked for 15 minutes.
  3. On a successful TOTP verification both fields are reset to their defaults.
  4. The lockout applies to login, 2FA enable, and 2FA disable endpoints.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'org_users' AND column_name = 'totp_fail_count'
  ) THEN
    ALTER TABLE org_users ADD COLUMN totp_fail_count INTEGER NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'org_users' AND column_name = 'totp_locked_until'
  ) THEN
    ALTER TABLE org_users ADD COLUMN totp_locked_until TIMESTAMPTZ DEFAULT NULL;
  END IF;
END $$;
