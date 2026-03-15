/*
  # Sync Profile Rule Condition Types

  ## Summary
  Updates built-in compliance profile rule_condition_types arrays to include rules
  added after each profile was originally seeded. Specifically adds the two VPC rules
  (vpc_has_description, vpc_subnet_rfc1918) introduced in migration 013 to the profiles
  where they are relevant.

  ## Profiles Updated

  ### Cloud Secure Hardened (cloud-secure-hardened)
  - Added: vpc_has_description, vpc_subnet_rfc1918
  - VPC hygiene rules belong in the hardened/strict profile which already covers
    network segmentation (linode_in_vpc, lke_in_vpc).

  ### All Rules (all-rules)
  - Not changed here — the backend now resolves this profile dynamically from the
    compliance_rules table at query time, so it always reflects the live ruleset.

  ## Notes
  1. Uses array_append to avoid rewriting the full array, preserving any manual
     additions made directly in the database.
  2. Only appends if the condition_type is not already present (idempotent).
  3. Only touches is_builtin = true profiles to avoid overwriting customer-customised profiles.
*/

DO $$
DECLARE
  vpc_rules TEXT[] := ARRAY['vpc_has_description', 'vpc_subnet_rfc1918'];
  ct TEXT;
  profile_slugs TEXT[];
BEGIN
  profile_slugs := ARRAY['cloud-secure-hardened'];

  FOREACH ct IN ARRAY vpc_rules LOOP
    UPDATE compliance_profiles
    SET rule_condition_types = array_append(rule_condition_types, ct)
    WHERE slug = ANY(profile_slugs)
      AND is_builtin = true
      AND NOT (rule_condition_types @> ARRAY[ct]);
  END LOOP;
END $$;
