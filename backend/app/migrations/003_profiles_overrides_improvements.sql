-- Add is_active column to account_compliance_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'account_compliance_profiles' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE account_compliance_profiles ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;
END $$;

-- Add unique constraint to account_compliance_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'account_compliance_profiles'
      AND constraint_type = 'UNIQUE'
      AND constraint_name = 'uq_account_compliance_profiles'
  ) THEN
    ALTER TABLE account_compliance_profiles
      ADD CONSTRAINT uq_account_compliance_profiles UNIQUE (account_id, profile_id);
  END IF;
END $$;

-- Add created_by column to account_rule_overrides
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'account_rule_overrides' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE account_rule_overrides
      ADD COLUMN created_by UUID REFERENCES org_users(id) ON DELETE SET NULL;
  END IF;
END $$;
