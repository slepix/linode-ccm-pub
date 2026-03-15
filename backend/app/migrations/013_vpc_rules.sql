/*
  # Add VPC Compliance Rules

  ## Summary
  Adds 2 new compliance rules targeting VPC resources directly. Previously, VPC-related
  rules only checked whether Linodes/LKE clusters were attached to a VPC. These new rules
  evaluate the VPC resources themselves.

  ## New Rules

  ### VPC (2)
  - `vpc_has_description` - VPCs must have a non-empty description for documentation purposes
  - `vpc_subnet_rfc1918` - All VPC subnets must use RFC1918 (private) IPv4 address ranges

  ## Security
  No RLS changes — this is a backend migration only (no Supabase tables affected).

  ## Notes
  1. Both rules target the `vpc` resource type
  2. Both rules are warning severity — misconfigured VPCs are a risk but not immediately critical
  3. Both rules are built-in and active by default
*/

INSERT INTO compliance_rules (name, description, resource_types, condition_type, condition_config, severity, is_active, is_builtin)
VALUES
  (
    'VPC Must Have a Description',
    'VPCs should have a meaningful description to document their purpose, ownership, and scope.',
    ARRAY['vpc'],
    'vpc_has_description',
    '{}',
    'info',
    true,
    true
  ),
  (
    'VPC Subnets Must Use RFC1918 Address Ranges',
    'All VPC subnets should use private (RFC1918) IPv4 CIDR ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) to prevent accidental public routing.',
    ARRAY['vpc'],
    'vpc_subnet_rfc1918',
    '{}',
    'warning',
    true,
    true
  );
