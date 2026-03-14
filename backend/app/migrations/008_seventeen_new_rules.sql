/*
  # Add 17 New Compliance Rules

  ## Summary
  Adds 17 genuinely new compliance rules with no overlap against existing rules.
  Covers Linode compute, firewall, database, LKE, NodeBalancer, DNS domains, and account/user checks.

  ## New Rules

  ### Linode / Compute (3)
  - `linode_watchdog_enabled` - Lassie watchdog auto-reboot must be enabled
  - `linode_alerts_configured` - CPU, I/O, and network alert thresholds must be set above 0
  - `linode_private_ip_only` - Flags instances with a public IP but no private IP configured

  ### Firewall (1)
  - `firewall_no_icmp_inbound` - Detects unrestricted inbound ICMP ACCEPT rules from 0.0.0.0/0

  ### Database (4)
  - `db_ssl_required` - Verifies SSL connections are enforced on the database
  - `db_encrypted` - Verifies database encryption at rest is enabled
  - `db_cluster_size_min` - Checks database cluster has at least a minimum node count
  - `db_version_minimum` - Flags databases running below a configured minimum engine version

  ### LKE / Kubernetes (3)
  - `lke_version_minimum` - Flags clusters running below a configured minimum Kubernetes version
  - `lke_in_vpc` - Checks LKE cluster is attached to a VPC
  - `lke_node_pool_type_restriction` - Enforces allowed/forbidden node pool instance types per pool

  ### NodeBalancer (1)
  - `nodebalancer_connection_throttle` - Verifies connection throttle is configured on all ports

  ### Domains / DNS (3)
  - `domain_active` - Flags domains with non-active status
  - `domain_ttl_minimum` - Flags domains with a TTL below a configured minimum
  - `domain_has_soa_email` - Flags domains missing an SOA administrative contact email

  ### Account / Users (1)
  - `user_ssh_keys_configured` - All non-proxy users must have at least one SSH key registered
*/

INSERT INTO compliance_rules (name, description, resource_types, condition_type, condition_config, severity, is_active, is_builtin)
VALUES
  (
    'Linode Watchdog (Lassie) Enabled',
    'The Lassie watchdog service monitors Linode instances and automatically reboots them if they crash or become unresponsive.',
    ARRAY['linode'],
    'linode_watchdog_enabled',
    '{}',
    'warning',
    true,
    true
  ),
  (
    'Linode Alerts Configured',
    'CPU, I/O, and network alert thresholds must be set above zero so that anomalous activity triggers notifications.',
    ARRAY['linode'],
    'linode_alerts_configured',
    '{"required_alerts":["cpu","io","network_in","network_out"]}',
    'info',
    true,
    true
  ),
  (
    'Linode Has Private IP Configured',
    'Flags Linode instances that have a public IPv4 address but no private IP, indicating the instance is not using private networking.',
    ARRAY['linode'],
    'linode_private_ip_only',
    '{}',
    'info',
    true,
    true
  ),
  (
    'No Unrestricted Inbound ICMP',
    'Detects inbound firewall ACCEPT rules that allow unrestricted ICMP traffic from 0.0.0.0/0 or ::/0. Open ICMP can facilitate reconnaissance and amplification attacks.',
    ARRAY['firewall'],
    'firewall_no_icmp_inbound',
    '{}',
    'warning',
    true,
    true
  ),
  (
    'Database SSL Connection Required',
    'Managed databases must enforce SSL connections to protect data in transit.',
    ARRAY['database'],
    'db_ssl_required',
    '{}',
    'critical',
    true,
    true
  ),
  (
    'Database Encrypted at Rest',
    'Managed databases must have encryption at rest enabled to protect stored data.',
    ARRAY['database'],
    'db_encrypted',
    '{}',
    'critical',
    true,
    true
  ),
  (
    'Database Minimum Cluster Size',
    'Database clusters should have at least a minimum number of nodes for high availability and failover.',
    ARRAY['database'],
    'db_cluster_size_min',
    '{"min_size":2}',
    'warning',
    true,
    true
  ),
  (
    'Database Engine Version Minimum',
    'Flags databases running below a configured minimum engine version. Configure min_versions as an object mapping engine name to minimum version, e.g. {"mysql":"8.0","postgresql":"14.0"}.',
    ARRAY['database'],
    'db_version_minimum',
    '{"min_versions":{}}',
    'warning',
    true,
    true
  ),
  (
    'LKE Kubernetes Version Minimum',
    'Flags LKE clusters running below a configured minimum Kubernetes version to prevent use of EOL versions.',
    ARRAY['lke_cluster'],
    'lke_version_minimum',
    '{"min_version":""}',
    'warning',
    true,
    true
  ),
  (
    'LKE Cluster in VPC',
    'LKE clusters should be attached to a VPC for network isolation. This is distinct from the Linode instance VPC check.',
    ARRAY['lke_cluster'],
    'lke_in_vpc',
    '{}',
    'warning',
    true,
    true
  ),
  (
    'LKE Node Pool Instance Type Restriction',
    'Restricts LKE node pools to approved instance types. Configure forbidden_prefixes or allowed_prefixes per pool.',
    ARRAY['lke_cluster'],
    'lke_node_pool_type_restriction',
    '{"forbidden_prefixes":[],"allowed_prefixes":[]}',
    'info',
    true,
    true
  ),
  (
    'NodeBalancer Connection Throttle Configured',
    'NodeBalancer ports should have client_conn_throttle set above zero to mitigate DDoS and connection exhaustion attacks.',
    ARRAY['nodebalancer'],
    'nodebalancer_connection_throttle',
    '{"min_throttle":1}',
    'warning',
    true,
    true
  ),
  (
    'Domain Must Be Active',
    'Flags DNS domains that are not in active status. Inactive or disabled domains may indicate orphaned resources.',
    ARRAY['domain'],
    'domain_active',
    '{"allowed_statuses":["active"]}',
    'info',
    true,
    true
  ),
  (
    'Domain TTL Minimum',
    'Flags DNS domains with a TTL below a minimum threshold. Very low TTLs increase DNS infrastructure load and can be exploited.',
    ARRAY['domain'],
    'domain_ttl_minimum',
    '{"min_ttl_sec":300}',
    'info',
    true,
    true
  ),
  (
    'Domain Has SOA Email Configured',
    'DNS domains must have a valid SOA administrative contact email configured for operational accountability.',
    ARRAY['domain'],
    'domain_has_soa_email',
    '{}',
    'info',
    true,
    true
  ),
  (
    'All Users Must Have SSH Keys',
    'Every non-proxy account user should have at least one SSH public key registered to enable key-based authentication.',
    ARRAY[]::text[],
    'user_ssh_keys_configured',
    '{"exclude_user_types":["proxy"]}',
    'info',
    true,
    true
  )
ON CONFLICT (condition_type) WHERE is_builtin = true AND account_id IS NULL DO NOTHING;

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
  'bucket_versioning','bucket_encryption','inactive_users','user_restricted_access',
  'linode_watchdog_enabled','linode_alerts_configured','linode_private_ip_only',
  'firewall_no_icmp_inbound',
  'db_ssl_required','db_encrypted','db_cluster_size_min','db_version_minimum',
  'lke_version_minimum','lke_in_vpc','lke_node_pool_type_restriction',
  'nodebalancer_connection_throttle',
  'domain_active','domain_ttl_minimum','domain_has_soa_email',
  'user_ssh_keys_configured'
]
WHERE slug = 'all-rules' AND is_builtin = true;
