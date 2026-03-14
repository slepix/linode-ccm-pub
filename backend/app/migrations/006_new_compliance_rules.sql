/*
  # Add 13 New Compliance Rules

  ## Summary
  Adds 13 new built-in compliance rules across all resource types, expanding coverage
  with security, cost governance, and operational best-practice checks.

  ## New Rules

  ### Linode / Compute (3 new)
  - `linode_in_vpc` - Flags Linode instances not attached to any VPC (network isolation)
  - `linode_instance_type_restriction` - Flags forbidden or non-approved instance types
  - `linode_age_check` - Flags long-running instances older than a configurable threshold

  ### Firewall (3 new)
  - `firewall_outbound_dangerous_ports` - Detects ACCEPT rules allowing outbound on SMTP/mail ports
  - `firewall_cidr_too_broad` - Flags inbound ACCEPT rules with overly broad IPv4 CIDRs
  - `firewall_rule_count` - Flags firewalls with too many rules (complexity risk)

  ### LKE (1 new)
  - `lke_node_pool_min_size` - Checks that each individual node pool meets a minimum node count

  ### Database (2 new)
  - `db_backup_recency` - Flags databases whose last recorded backup exceeds a threshold
  - `db_maintenance_window` - Flags databases with no maintenance window configured

  ### Object Storage (2 new)
  - `bucket_versioning` - Flags buckets without versioning enabled
  - `bucket_encryption` - Flags buckets without server-side encryption

  ### Account / Identity (2 new)
  - `inactive_users` - Flags users who have not logged in within a configurable number of days
  - `user_restricted_access` - Flags users with unrestricted (super-admin) account access

  ## Notes
  - Uses ON CONFLICT DO NOTHING to be fully idempotent
  - "All Rules" profile is updated to include all new condition types
*/

INSERT INTO compliance_rules (name, description, resource_types, condition_type, condition_config, severity, is_active, is_builtin)
VALUES
  (
    'Linode Not in VPC',
    'Linode instances should be attached to a VPC for network isolation and security.',
    ARRAY['linode'],
    'linode_in_vpc',
    '{}',
    'warning',
    true,
    true
  ),
  (
    'Linode Instance Type Restriction',
    'Restricts Linode instances to approved plan types. Configure forbidden_prefixes (e.g. ["g1-gpu"]) or allowed_prefixes to enforce governance.',
    ARRAY['linode'],
    'linode_instance_type_restriction',
    '{"forbidden_prefixes":[],"allowed_prefixes":[]}',
    'info',
    true,
    true
  ),
  (
    'Linode Age / Stale Instance Check',
    'Flags Linode instances older than a configurable number of days to prevent forgotten or orphaned resources.',
    ARRAY['linode'],
    'linode_age_check',
    '{"max_age_days":365}',
    'info',
    true,
    true
  ),
  (
    'Firewall Allows Outbound on Dangerous Ports',
    'Detects firewall ACCEPT rules that allow outbound traffic on dangerous ports such as SMTP (25, 465, 587) which can enable spam relaying.',
    ARRAY['firewall'],
    'firewall_outbound_dangerous_ports',
    '{"dangerous_ports":[25,465,587]}',
    'warning',
    true,
    true
  ),
  (
    'Firewall Inbound CIDR Too Broad',
    'Flags inbound ACCEPT rules with IPv4 CIDR blocks broader than a configurable prefix length (e.g., /8 or larger).',
    ARRAY['firewall'],
    'firewall_cidr_too_broad',
    '{"max_prefix_ipv4":8,"check_inbound":true,"check_outbound":false}',
    'warning',
    true,
    true
  ),
  (
    'Firewall Has Too Many Rules',
    'Flags firewalls with more than a configurable number of rules as a complexity and management risk indicator.',
    ARRAY['firewall'],
    'firewall_rule_count',
    '{"max_rules":50}',
    'info',
    true,
    true
  ),
  (
    'LKE Node Pool Minimum Size',
    'Checks that every individual node pool in an LKE cluster meets the minimum required node count, not just the cluster total.',
    ARRAY['lke_cluster'],
    'lke_node_pool_min_size',
    '{"min_per_pool":2}',
    'warning',
    true,
    true
  ),
  (
    'Database Backup Recency',
    'Verifies that a successful backup has occurred within the configured number of days for managed databases.',
    ARRAY['database'],
    'db_backup_recency',
    '{"max_age_days":7}',
    'warning',
    true,
    true
  ),
  (
    'Database Maintenance Window Configured',
    'Flags managed databases that do not have a maintenance window configured.',
    ARRAY['database'],
    'db_maintenance_window',
    '{}',
    'info',
    true,
    true
  ),
  (
    'Object Storage Bucket Versioning',
    'Flags object storage buckets that do not have versioning enabled. Versioning protects against accidental deletion and overwrites.',
    ARRAY['object_storage'],
    'bucket_versioning',
    '{"allow_suspended":false}',
    'warning',
    true,
    true
  ),
  (
    'Object Storage Bucket Encryption',
    'Flags object storage buckets that do not have server-side encryption enabled.',
    ARRAY['object_storage'],
    'bucket_encryption',
    '{}',
    'critical',
    true,
    true
  ),
  (
    'Inactive User Check',
    'Flags users who have not logged in within a configurable number of days. Inactive accounts increase the risk of unauthorized access.',
    ARRAY[]::text[],
    'inactive_users',
    '{"max_inactive_days":90,"exclude_user_types":["proxy"]}',
    'warning',
    true,
    true
  ),
  (
    'Users Must Have Restricted Access',
    'Flags users with unrestricted (super-admin) account access. All users except account owners should have restricted permissions.',
    ARRAY[]::text[],
    'user_restricted_access',
    '{"exclude_user_types":["proxy"],"exclude_usernames":[]}',
    'warning',
    true,
    true
  )
ON CONFLICT (condition_type) WHERE is_builtin = true AND account_id IS NULL DO NOTHING;

-- Update the "All Rules" profile to include all new condition types
UPDATE compliance_profiles
SET rule_condition_types = ARRAY[
  'firewall_attached','no_open_inbound','firewall_has_targets','min_node_count','has_tags',
  'volume_attached','db_allowlist_check','db_public_access','linode_backups_enabled',
  'linode_disk_encryption','linode_lock_configured','linode_not_offline','linode_backup_recency',
  'lke_control_plane_acl','volume_encryption_enabled','lke_control_plane_ha','lke_audit_logs_enabled',
  'bucket_acl_check','tfa_users','login_allowed_ips','approved_regions','firewall_rules_check',
  'nodebalancer_protocol_check','nodebalancer_port_allowlist','firewall_all_ports_allowed',
  'firewall_rule_descriptions','bucket_cors_check','firewall_rfc1918_lateral',
  'firewall_no_duplicate_rules',
  'linode_in_vpc','linode_instance_type_restriction','linode_age_check',
  'firewall_outbound_dangerous_ports','firewall_cidr_too_broad','firewall_rule_count',
  'lke_node_pool_min_size','db_backup_recency','db_maintenance_window',
  'bucket_versioning','bucket_encryption','inactive_users','user_restricted_access'
]
WHERE slug = 'all-rules' AND is_builtin = true;
