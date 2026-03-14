CREATE TABLE IF NOT EXISTS account_rule_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES compliance_rules(id) ON DELETE CASCADE,
  config_override jsonb NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES org_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (account_id, rule_id)
);
