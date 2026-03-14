-- revoked_tokens: JWT revocation blocklist keyed by jti claim
CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti TEXT PRIMARY KEY,
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires_at ON revoked_tokens(expires_at);

-- account_compliance_profiles: add missing is_active column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'account_compliance_profiles' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE account_compliance_profiles ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;
END $$;

-- account_compliance_profiles: add missing UNIQUE constraint required by ON CONFLICT clauses
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'account_compliance_profiles'
          AND constraint_type = 'UNIQUE'
          AND constraint_name = 'account_compliance_profiles_account_id_profile_id_key'
    ) THEN
        ALTER TABLE account_compliance_profiles ADD CONSTRAINT account_compliance_profiles_account_id_profile_id_key UNIQUE (account_id, profile_id);
    END IF;
END $$;

-- account_rule_overrides: add missing created_by column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'account_rule_overrides' AND column_name = 'created_by'
    ) THEN
        ALTER TABLE account_rule_overrides ADD COLUMN created_by UUID REFERENCES org_users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- account_rule_configs: new table for per-account rule configuration overrides
CREATE TABLE IF NOT EXISTS account_rule_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
    rule_id UUID NOT NULL REFERENCES compliance_rules(id) ON DELETE CASCADE,
    config_override JSONB NOT NULL DEFAULT '{}',
    created_by UUID REFERENCES org_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(account_id, rule_id)
);
CREATE INDEX IF NOT EXISTS idx_account_rule_configs_account_id ON account_rule_configs(account_id);

-- reports: new table for generated compliance reports
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    quarter TEXT,
    status TEXT NOT NULL DEFAULT 'generating',
    created_by UUID REFERENCES org_users(id) ON DELETE SET NULL,
    snapshot JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reports_account_id ON reports(account_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
