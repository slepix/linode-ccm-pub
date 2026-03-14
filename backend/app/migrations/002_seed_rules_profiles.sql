-- Ensure the unique partial index exists before seeding (idempotent)
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

-- Seed built-in compliance rules (29 rules)
INSERT INTO compliance_rules (name, description, resource_types, condition_type, condition_config, severity, is_active, is_builtin)
VALUES
  ('Linodes Must Have a Firewall', 'Every Linode instance should be protected by at least one active firewall.', ARRAY['linode'], 'firewall_attached', '{}', 'critical', true, true),
  ('No Unrestricted Inbound Traffic', 'Firewall rules should not allow unrestricted inbound access on sensitive ports.', ARRAY['firewall'], 'no_open_inbound', '{"sensitive_ports":[22,3389,3306,5432,6379,27017]}', 'critical', true, true),
  ('Firewall Must Be Attached', 'A firewall that is not attached to any Linode provides no value.', ARRAY['firewall'], 'firewall_has_targets', '{}', 'info', true, true),
  ('LKE Clusters Should Have Multiple Nodes', 'Kubernetes clusters should have more than one node for high availability.', ARRAY['lke_cluster'], 'min_node_count', '{"min_count":2}', 'warning', true, true),
  ('Resources Should Have Tags', 'Resources must have owner, environment, and cost-center tags for accountability.', ARRAY['linode','volume','nodebalancer','lke_cluster','database'], 'has_tags', '{"required_tags":[{"key":"owner","value":"*"},{"key":"environment","value":"*"},{"key":"cost-center","value":"*"}]}', 'info', true, true),
  ('Volumes Should Be Attached', 'Unattached volumes still incur cost but provide no value.', ARRAY['volume'], 'volume_attached', '{}', 'info', true, true),
  ('No Unrestricted Database Access', 'Managed databases should not have 0.0.0.0/0 or ::/0 in their IP allow list.', ARRAY['database'], 'db_allowlist_check', '{"forbidden_cidrs":["0.0.0.0/0","::/0"],"require_non_empty":false}', 'critical', true, true),
  ('Databases Must Not Have Public Access Enabled', 'Managed databases with public_access enabled are reachable from outside the VPC.', ARRAY['database'], 'db_public_access', '{"allow_public_access":false}', 'critical', true, true),
  ('Linode Backups Enabled', 'Verifies that automated backups are enabled for every Linode instance.', ARRAY['linode'], 'linode_backups_enabled', '{}', 'critical', true, true),
  ('Linode Disk Encryption Enabled', 'Verifies that disk encryption is enabled on every Linode instance.', ARRAY['linode'], 'linode_disk_encryption', '{}', 'critical', true, true),
  ('Linode Deletion Lock Configured', 'Verifies that at least one deletion lock is configured.', ARRAY['linode'], 'linode_lock_configured', '{"required_lock_types":[]}', 'warning', true, true),
  ('Linode Instance Not Offline', 'Flags any Linode instance in an offline state.', ARRAY['linode'], 'linode_not_offline', '{}', 'warning', true, true),
  ('Linode Backup Recency', 'Verifies that a successful backup has occurred within the configured number of days.', ARRAY['linode'], 'linode_backup_recency', '{"max_age_days":7}', 'warning', true, true),
  ('LKE Control Plane ACL Configured', 'Verifies the LKE cluster control plane has an ACL enabled and does not allow unrestricted access.', ARRAY['lke_cluster'], 'lke_control_plane_acl', '{}', 'critical', true, true),
  ('Volume Encryption Enabled', 'Block storage volumes must have disk encryption enabled.', ARRAY['volume'], 'volume_encryption_enabled', '{}', 'critical', true, true),
  ('LKE Control Plane High Availability', 'LKE cluster control plane HA must be enabled for production resilience.', ARRAY['lke_cluster'], 'lke_control_plane_ha', '{}', 'warning', true, true),
  ('LKE Audit Logs Enabled', 'LKE control plane audit logging must be enabled.', ARRAY['lke_cluster'], 'lke_audit_logs_enabled', '{}', 'warning', true, true),
  ('Object Storage Bucket ACL', 'Object storage bucket ACL must not allow public access.', ARRAY['object_storage'], 'bucket_acl_check', '{"required_acl":"","forbidden_acls":["public-read","public-read-write","authenticated-read"]}', 'critical', true, true),
  ('All Users Must Have TFA Enabled', 'Every user on the account must have two-factor authentication enabled.', ARRAY[]::text[], 'tfa_users', '{}', 'critical', true, true),
  ('Account Login IP Restriction', 'Account logins must only be permitted from a configured IP allow list.', ARRAY[]::text[], 'login_allowed_ips', '{}', 'warning', true, true),
  ('Resources in Approved Regions', 'All resources must be deployed only in approved geographic regions.', ARRAY['linode','volume','lke_cluster','database','nodebalancer','object_storage'], 'approved_regions', '{"approved_regions":[]}', 'warning', true, true),
  ('Firewall Policy Requirements', 'Firewall inbound and outbound policies must meet configurable security requirements.', ARRAY['linode'], 'firewall_rules_check', '{"required_inbound_policy":"DROP","required_outbound_policy":"","blocked_ports":[],"allowed_source_ips":[],"require_no_open_ports":false}', 'warning', true, true),
  ('NodeBalancer Protocol Check', 'NodeBalancer ports must use only HTTPS protocol.', ARRAY['nodebalancer'], 'nodebalancer_protocol_check', '{"allowed_protocols":["https"]}', 'warning', true, true),
  ('NodeBalancer Allowed Ports', 'NodeBalancer must only listen on approved ports.', ARRAY['nodebalancer'], 'nodebalancer_port_allowlist', '{"allowed_ports":[443]}', 'warning', true, true),
  ('Firewall Rules Must Not Allow All Ports', 'Detects firewall rules that allow traffic on all ports.', ARRAY['firewall'], 'firewall_all_ports_allowed', '{"check_inbound":true,"check_outbound":false,"actions":["ACCEPT"]}', 'warning', true, true),
  ('Firewall Rules Must Have Descriptions', 'All inbound and outbound firewall rules must have a non-empty description.', ARRAY['firewall'], 'firewall_rule_descriptions', '{}', 'warning', true, true),
  ('Object Storage Bucket CORS', 'Checks whether CORS is enabled or disabled on object storage buckets.', ARRAY['object_storage'], 'bucket_cors_check', '{"require_cors_disabled":false,"require_cors_enabled":false}', 'info', true, true),
  ('No RFC-1918 Lateral Movement via Firewall', 'Detects inbound firewall rules that allow sensitive port traffic from RFC-1918 private IP ranges.', ARRAY['firewall'], 'firewall_rfc1918_lateral', '{"sensitive_ports":[22,3389,3306,5432,5984,6379,9200,27017]}', 'warning', true, true),
  ('No Duplicate Firewall Rules', 'Detects duplicate firewall rules in the same direction.', ARRAY['firewall'], 'firewall_no_duplicate_rules', '{}', 'info', true, true)
ON CONFLICT (condition_type) WHERE is_builtin = true AND account_id IS NULL DO NOTHING;

-- Seed compliance profiles
INSERT INTO compliance_profiles (name, slug, description, tier, is_builtin, version, icon, rule_condition_types)
VALUES
  ('Level 1 - Foundation', 'cis-l1', 'Foundational, low-friction controls that every cloud account should satisfy.', 'foundation', true, '1.0', 'shield', ARRAY['firewall_attached','no_open_inbound','linode_backups_enabled','db_allowlist_check','db_public_access','tfa_users','has_tags','volume_attached','lke_control_plane_acl']),
  ('Level 2 - Standard', 'cis-l2', 'Deeper technical controls for production workloads requiring defense in depth.', 'standard', true, '1.0', 'shield-check', ARRAY['firewall_attached','firewall_rules_check','firewall_has_targets','no_open_inbound','linode_backups_enabled','linode_backup_recency','linode_disk_encryption','linode_lock_configured','volume_encryption_enabled','db_allowlist_check','db_public_access','tfa_users','login_allowed_ips','has_tags','approved_regions','min_node_count','lke_control_plane_ha','lke_control_plane_acl','lke_audit_logs_enabled','bucket_acl_check']),
  ('SOC 2 Readiness', 'soc2', 'Maps controls to SOC 2 Trust Service Criteria (Security CC6/CC7, Availability A1, Confidentiality C1).', 'standard', true, '1.0', 'file-check', ARRAY['firewall_attached','no_open_inbound','linode_backups_enabled','linode_backup_recency','linode_disk_encryption','linode_lock_configured','volume_encryption_enabled','db_allowlist_check','db_public_access','tfa_users','login_allowed_ips','lke_audit_logs_enabled','lke_control_plane_acl','bucket_acl_check','has_tags']),
  ('PCI-DSS Baseline', 'pci-dss', 'Controls aligned to PCI DSS v4.0 Requirements 1, 2, 3, 7, and 10.', 'strict', true, '1.0', 'credit-card', ARRAY['firewall_attached','firewall_rules_check','no_open_inbound','linode_backups_enabled','linode_backup_recency','linode_disk_encryption','linode_lock_configured','volume_encryption_enabled','db_allowlist_check','db_public_access','tfa_users','login_allowed_ips','approved_regions','lke_control_plane_ha','lke_control_plane_acl','lke_audit_logs_enabled','bucket_acl_check','nodebalancer_protocol_check','nodebalancer_port_allowlist']),
  ('Minimal / Dev', 'minimal-dev', 'Lightweight profile for development/staging. Only critical blocking issues are flagged.', 'foundation', true, '1.0', 'wrench', ARRAY['firewall_attached','no_open_inbound','db_allowlist_check','db_public_access','tfa_users']),
  ('All Rules', 'all-rules', 'Enables every available compliance rule for full visibility.', 'strict', true, '1.0', 'shield-check', ARRAY['firewall_attached','no_open_inbound','firewall_has_targets','min_node_count','has_tags','volume_attached','db_allowlist_check','db_public_access','linode_backups_enabled','linode_disk_encryption','linode_lock_configured','linode_not_offline','linode_backup_recency','lke_control_plane_acl','volume_encryption_enabled','lke_control_plane_ha','lke_audit_logs_enabled','bucket_acl_check','tfa_users','login_allowed_ips','approved_regions','firewall_rules_check','nodebalancer_protocol_check','nodebalancer_port_allowlist','firewall_all_ports_allowed','firewall_rule_descriptions','bucket_cors_check','firewall_rfc1918_lateral','firewall_no_duplicate_rules'])
ON CONFLICT (slug) DO NOTHING;
