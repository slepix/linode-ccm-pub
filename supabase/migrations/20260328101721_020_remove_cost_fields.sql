/*
  # Remove cost-related fields

  Drops the cost and pricing columns that were never enforced or displayed.

  ## Changes

  ### org_users table
  - Drop `can_view_costs` column

  ### user_account_access table
  - Drop `can_view_costs` column

  ### resources table
  - Drop `monthly_cost` column
  - Drop `pricing` column

  ### resource_snapshots table
  - Drop `monthly_cost` column
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'org_users' AND column_name = 'can_view_costs'
  ) THEN
    ALTER TABLE org_users DROP COLUMN can_view_costs;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_account_access' AND column_name = 'can_view_costs'
  ) THEN
    ALTER TABLE user_account_access DROP COLUMN can_view_costs;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'resources' AND column_name = 'monthly_cost'
  ) THEN
    ALTER TABLE resources DROP COLUMN monthly_cost;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'resources' AND column_name = 'pricing'
  ) THEN
    ALTER TABLE resources DROP COLUMN pricing;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'resource_snapshots' AND column_name = 'monthly_cost'
  ) THEN
    ALTER TABLE resource_snapshots DROP COLUMN monthly_cost;
  END IF;
END $$;
