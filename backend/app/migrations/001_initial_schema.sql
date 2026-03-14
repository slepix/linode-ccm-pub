-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- org_users
CREATE TABLE IF NOT EXISTS org_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL DEFAULT '',
    full_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'auditor' CHECK (role IN ('admin', 'power_user', 'auditor')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    can_view_costs BOOLEAN NOT NULL DEFAULT TRUE,
    can_view_compliance BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- linode_accounts
CREATE TABLE IF NOT EXISTS linode_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    api_token TEXT NOT NULL,
    webhook_api_key TEXT,
    last_sync_at TIMESTAMPTZ,
    last_evaluated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- resources
CREATE TABLE IF NOT EXISTS resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
    resource_id TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    label TEXT,
    region TEXT,
    status TEXT,
    specs JSONB,
    pricing JSONB,
    plan_type TEXT,
    monthly_cost NUMERIC NOT NULL DEFAULT 0,
    resource_created_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_resources_account_id ON resources(account_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_account_resource ON resources(account_id, resource_id, resource_type);

-- compliance_rules
CREATE TABLE IF NOT EXISTS compliance_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID REFERENCES linode_accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    resource_types TEXT[] NOT NULL DEFAULT '{}',
    condition_type TEXT NOT NULL,
    condition_config JSONB NOT NULL DEFAULT '{}',
    severity TEXT NOT NULL DEFAULT 'warning',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_compliance_rules_account_id ON compliance_rules(account_id);

-- compliance_profiles
CREATE TABLE IF NOT EXISTS compliance_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    tier TEXT,
    is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
    version TEXT,
    icon TEXT,
    rule_condition_types TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- account_compliance_profiles
CREATE TABLE IF NOT EXISTS account_compliance_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES compliance_profiles(id) ON DELETE CASCADE,
    activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- compliance_results
CREATE TABLE IF NOT EXISTS compliance_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL REFERENCES compliance_rules(id) ON DELETE CASCADE,
    resource_id UUID REFERENCES resources(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'not_applicable',
    detail TEXT,
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_note TEXT,
    acknowledged_by UUID REFERENCES org_users(id) ON DELETE SET NULL,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_compliance_results_account_id ON compliance_results(account_id);
CREATE INDEX IF NOT EXISTS idx_cr_resource_id ON compliance_results(resource_id);
CREATE INDEX IF NOT EXISTS idx_cr_rule_id ON compliance_results(rule_id);

-- compliance_score_history
CREATE TABLE IF NOT EXISTS compliance_score_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total_results INTEGER NOT NULL DEFAULT 0,
    compliant_count INTEGER NOT NULL DEFAULT 0,
    non_compliant_count INTEGER NOT NULL DEFAULT 0,
    not_applicable_count INTEGER NOT NULL DEFAULT 0,
    acknowledged_count INTEGER NOT NULL DEFAULT 0,
    compliance_score NUMERIC(5,2),
    total_rules_evaluated INTEGER NOT NULL DEFAULT 0,
    rule_breakdown JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_compliance_score_history_account_evaluated ON compliance_score_history(account_id, evaluated_at DESC);

-- resource_compliance_history
CREATE TABLE IF NOT EXISTS resource_compliance_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    results JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rch_account_id ON resource_compliance_history(account_id);
CREATE INDEX IF NOT EXISTS idx_rch_resource_id ON resource_compliance_history(resource_id);

-- compliance_result_notes
CREATE TABLE IF NOT EXISTS compliance_result_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    compliance_result_id UUID NOT NULL REFERENCES compliance_results(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    created_by UUID REFERENCES org_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_compliance_result_notes_account_id ON compliance_result_notes(account_id);
CREATE INDEX IF NOT EXISTS idx_crn_compliance_result_id ON compliance_result_notes(compliance_result_id);

-- account_rule_overrides
CREATE TABLE IF NOT EXISTS account_rule_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
    rule_id UUID NOT NULL REFERENCES compliance_rules(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    applied_by_profile_id UUID REFERENCES compliance_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(account_id, rule_id)
);

-- resource_snapshots
CREATE TABLE IF NOT EXISTS resource_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
    resource_type TEXT NOT NULL,
    label TEXT NOT NULL,
    region TEXT,
    plan_type TEXT,
    monthly_cost NUMERIC NOT NULL DEFAULT 0,
    status TEXT,
    specs JSONB,
    diff JSONB,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_resource_snapshots_resource_id ON resource_snapshots(resource_id);
CREATE INDEX IF NOT EXISTS idx_resource_snapshots_account_id ON resource_snapshots(account_id);
CREATE INDEX IF NOT EXISTS idx_resource_snapshots_synced_at ON resource_snapshots(synced_at);

-- resource_relationships
CREATE TABLE IF NOT EXISTS resource_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL,
    metadata JSONB,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_resource_relationships_account_id ON resource_relationships(account_id);
CREATE INDEX IF NOT EXISTS idx_resource_relationships_source_id ON resource_relationships(source_id);
CREATE INDEX IF NOT EXISTS idx_resource_relationships_target_id ON resource_relationships(target_id);

-- linode_events
CREATE TABLE IF NOT EXISTS linode_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
    event_id BIGINT NOT NULL,
    action TEXT NOT NULL,
    entity_id TEXT,
    entity_type TEXT,
    entity_label TEXT,
    entity_url TEXT,
    secondary_entity_id TEXT,
    secondary_entity_type TEXT,
    secondary_entity_label TEXT,
    message TEXT,
    status TEXT,
    username TEXT,
    duration NUMERIC,
    percent_complete INTEGER,
    seen BOOLEAN NOT NULL DEFAULT FALSE,
    event_created TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(account_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_linode_events_account_id ON linode_events(account_id);
CREATE INDEX IF NOT EXISTS idx_linode_events_event_created ON linode_events(event_created);

-- user_account_access
CREATE TABLE IF NOT EXISTS user_account_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES org_users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
    granted_by UUID REFERENCES org_users(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    can_view_costs BOOLEAN NOT NULL DEFAULT TRUE,
    can_view_compliance BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE(user_id, account_id)
);
