DO $$
BEGIN
  DELETE FROM compliance_rules
  WHERE is_builtin = true
    AND account_id IS NULL
    AND id NOT IN (
      SELECT DISTINCT ON (condition_type) id
      FROM compliance_rules
      WHERE is_builtin = true AND account_id IS NULL
      ORDER BY condition_type, created_at ASC
    );
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_compliance_rules_builtin_condition_type
  ON compliance_rules (condition_type)
  WHERE is_builtin = true AND account_id IS NULL;
