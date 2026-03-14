/*
  # Add New Security Profiles: Cloud Secure Baseline, Cloud Secure Hardened, Trust & Availability Standard

  ## Summary
  Adds three new built-in compliance profiles that map closely to industry standards
  without using their trademarked names directly.

  ## New Profiles

  ### 1. Cloud Secure Baseline (slug: cloud-secure-baseline)
  Mirrors CIS Benchmark Level 1. Low-friction, high-impact controls every cloud account
  should satisfy regardless of size or maturity. Focuses on the most critical access
  control, network perimeter, and data protection fundamentals.

  Rules: 18 rules covering identity, network perimeter, encryption, and secure DB access.

  ### 2. Cloud Secure Hardened (slug: cloud-secure-hardened)
  Mirrors CIS Benchmark Level 2. All Baseline controls plus deeper defense-in-depth
  for production workloads: network segmentation, audit logging, firewall hygiene,
  backup recency, instance hardening, and storage hygiene.

  Rules: 43 rules — a strict superset of Cloud Secure Baseline.

  ### 3. Trust & Availability Standard (slug: trust-availability-standard)
  Mirrors SOC 2 Trust Service Criteria (Security CC6/CC7, Availability A1,
  Confidentiality C1). Maps controls to the five TSC pillars for audit evidence.

  Rules: 29 rules across security, availability, confidentiality, and monitoring pillars.

  ## Notes
  - Uses ON CONFLICT (slug) DO NOTHING — safe to re-run
  - Does not modify existing profiles
  - All rule_condition_types reference rules that already exist in the database
*/

INSERT INTO compliance_profiles (name, slug, description, tier, is_builtin, version, icon, rule_condition_types)
VALUES
  (
    'Cloud Secure Baseline',
    'cloud-secure-baseline',
    'Low-friction, high-impact controls every cloud account should satisfy. Covers identity assurance, network perimeter, encryption fundamentals, and secure database access. Equivalent in scope to CIS Benchmark Level 1.',
    'foundation',
    true,
    '1.0',
    'shield',
    ARRAY[
      'tfa_users',
      'login_allowed_ips',
      'inactive_users',
      'user_restricted_access',
      'firewall_attached',
      'no_open_inbound',
      'firewall_all_ports_allowed',
      'firewall_no_icmp_inbound',
      'linode_backups_enabled',
      'linode_disk_encryption',
      'volume_encryption_enabled',
      'bucket_acl_check',
      'bucket_encryption',
      'db_allowlist_check',
      'db_public_access',
      'db_ssl_required',
      'db_encrypted',
      'lke_control_plane_acl'
    ]
  ),
  (
    'Cloud Secure Hardened',
    'cloud-secure-hardened',
    'Defense-in-depth controls for production workloads. Builds on Cloud Secure Baseline with network segmentation, audit logging, firewall hygiene, instance hardening, backup recency, and storage lifecycle controls. Equivalent in scope to CIS Benchmark Level 2.',
    'standard',
    true,
    '1.0',
    'shield-check',
    ARRAY[
      'tfa_users',
      'login_allowed_ips',
      'inactive_users',
      'user_restricted_access',
      'user_ssh_keys_configured',
      'firewall_attached',
      'no_open_inbound',
      'firewall_all_ports_allowed',
      'firewall_no_icmp_inbound',
      'firewall_rules_check',
      'firewall_cidr_too_broad',
      'firewall_rfc1918_lateral',
      'firewall_outbound_dangerous_ports',
      'firewall_rule_descriptions',
      'firewall_no_duplicate_rules',
      'linode_in_vpc',
      'lke_in_vpc',
      'nodebalancer_protocol_check',
      'nodebalancer_connection_throttle',
      'linode_backups_enabled',
      'linode_backup_recency',
      'linode_disk_encryption',
      'linode_lock_configured',
      'linode_watchdog_enabled',
      'linode_alerts_configured',
      'volume_encryption_enabled',
      'bucket_acl_check',
      'bucket_encryption',
      'bucket_versioning',
      'db_allowlist_check',
      'db_public_access',
      'db_ssl_required',
      'db_encrypted',
      'db_backup_recency',
      'db_cluster_size_min',
      'db_maintenance_window',
      'lke_control_plane_acl',
      'lke_control_plane_ha',
      'lke_audit_logs_enabled',
      'lke_node_pool_min_size',
      'min_node_count',
      'has_tags',
      'approved_regions'
    ]
  ),
  (
    'Trust & Availability Standard',
    'trust-availability-standard',
    'Maps controls to the five SOC 2 Trust Service Criteria: Security (CC6/CC7), Availability (A1), Confidentiality (C1), and Monitoring. Designed to provide evidence for SOC 2 Type I and Type II audits without directly naming the standard.',
    'standard',
    true,
    '1.0',
    'file-check',
    ARRAY[
      'tfa_users',
      'login_allowed_ips',
      'inactive_users',
      'user_restricted_access',
      'firewall_attached',
      'no_open_inbound',
      'firewall_rules_check',
      'lke_control_plane_acl',
      'lke_audit_logs_enabled',
      'bucket_acl_check',
      'db_allowlist_check',
      'db_public_access',
      'linode_backups_enabled',
      'linode_backup_recency',
      'linode_watchdog_enabled',
      'lke_control_plane_ha',
      'db_cluster_size_min',
      'db_backup_recency',
      'min_node_count',
      'linode_disk_encryption',
      'volume_encryption_enabled',
      'db_encrypted',
      'db_ssl_required',
      'bucket_encryption',
      'bucket_versioning',
      'linode_lock_configured',
      'linode_alerts_configured',
      'has_tags',
      'db_maintenance_window'
    ]
  )
ON CONFLICT (slug) DO NOTHING;
