import React, { useEffect, useState, useCallback } from 'react';
import { Settings, X, Save, Loader2, Plus, Trash2, RotateCcw } from 'lucide-react';
import { complianceApi, ComplianceRule, RuleConfig } from '../api/compliance';

interface Props {
  rule: ComplianceRule;
  accountId: string;
  onClose: () => void;
}

const CONFIGURABLE_RULES: Record<string, RuleSchema> = {
  approved_regions: {
    label: 'Approved Regions',
    description: 'Only these regions are permitted for resources.',
    fields: [
      { key: 'approved_regions', type: 'string_array', label: 'Approved Regions', placeholder: 'e.g. us-east, eu-west' },
    ],
  },
  login_allowed_ips: {
    label: 'Allowed Login IPs',
    description: 'Logins from IPs outside this list are flagged as non-compliant.',
    fields: [
      { key: 'allowed_ips', type: 'string_array', label: 'Allowed IPs', placeholder: 'e.g. 192.168.1.1' },
    ],
  },
  no_open_inbound: {
    label: 'No Open Inbound',
    description: 'Ports considered sensitive for open inbound firewall rule detection.',
    fields: [
      { key: 'sensitive_ports', type: 'number_array', label: 'Sensitive Ports', placeholder: 'e.g. 22, 3306, 5432' },
    ],
  },
  has_tags: {
    label: 'Required Tags',
    description: 'Tags that resources must have. Use key:value format for exact value matching, or just a key to require any value.',
    fields: [
      { key: 'min_tags', type: 'number', label: 'Minimum Tag Count', placeholder: '1' },
      { key: 'required_tags', type: 'tag_array', label: 'Required Tags (key or key:value)' },
    ],
  },
  min_node_count: {
    label: 'Minimum Node Count',
    description: 'LKE clusters must have at least this many nodes.',
    fields: [
      { key: 'min_count', type: 'number', label: 'Minimum Node Count', placeholder: '2' },
    ],
  },
  db_allowlist_check: {
    label: 'Database IP Allowlist',
    description: 'Forbidden CIDRs that must not appear in the database allow list.',
    fields: [
      { key: 'forbidden_cidrs', type: 'string_array', label: 'Forbidden CIDRs', placeholder: 'e.g. 0.0.0.0/0' },
    ],
  },
  linode_age_check: {
    label: 'Linode Age / Stale Instance Check',
    description: 'Flags Linode instances older than a configurable number of days to prevent forgotten or orphaned resources.',
    fields: [
      { key: 'max_age_days', type: 'number', label: 'Max Age (days)', placeholder: '365' },
    ],
  },
  linode_backup_recency: {
    label: 'Backup Recency',
    description: 'Maximum age in days for the most recent successful backup.',
    fields: [
      { key: 'max_age_days', type: 'number', label: 'Max Age (days)', placeholder: '7' },
    ],
  },
  linode_instance_type_restriction: {
    label: 'Linode Instance Type Restriction',
    description: 'Restrict Linode instances to approved types using prefix matching.',
    fields: [
      { key: 'forbidden_prefixes', type: 'string_array', label: 'Forbidden Prefixes', placeholder: 'e.g. g5-' },
      { key: 'allowed_prefixes', type: 'string_array', label: 'Allowed Prefixes', placeholder: 'e.g. g6-' },
    ],
  },
  linode_alerts_configured: {
    label: 'Linode Alerts Configured',
    description: 'Alert types that must be configured with a threshold above zero.',
    fields: [
      { key: 'required_alerts', type: 'string_array', label: 'Required Alert Types', placeholder: 'e.g. cpu, io, network_in' },
    ],
  },
  firewall_rules_check: {
    label: 'Firewall Policy Check',
    description: 'Enforces required inbound and/or outbound firewall policies.',
    fields: [
      { key: 'required_inbound_policy', type: 'string', label: 'Required Inbound Policy', placeholder: 'DROP' },
      { key: 'required_outbound_policy', type: 'string', label: 'Required Outbound Policy (optional)', placeholder: 'ACCEPT' },
    ],
  },
  firewall_cidr_too_broad: {
    label: 'Firewall CIDR Too Broad',
    description: 'Flags inbound ACCEPT rules with a CIDR prefix length at or below the configured maximum (broader = smaller number).',
    fields: [
      { key: 'max_prefix_ipv4', type: 'number', label: 'Max Prefix Length (e.g. 8 = /8 and broader)', placeholder: '8' },
    ],
  },
  firewall_rule_count: {
    label: 'Firewall Rule Count Limit',
    description: 'Flags firewalls exceeding a maximum total number of inbound + outbound rules.',
    fields: [
      { key: 'max_rules', type: 'number', label: 'Max Total Rules', placeholder: '50' },
    ],
  },
  firewall_outbound_dangerous_ports: {
    label: 'Firewall Outbound Dangerous Ports',
    description: 'Outbound ACCEPT rules must not allow traffic on these ports (e.g. SMTP).',
    fields: [
      { key: 'dangerous_ports', type: 'number_array', label: 'Dangerous Ports', placeholder: 'e.g. 25, 465, 587' },
    ],
  },
  firewall_rfc1918_lateral: {
    label: 'Firewall RFC-1918 Lateral Movement',
    description: 'Sensitive ports that should not be reachable via RFC-1918 (private) inbound rules.',
    fields: [
      { key: 'sensitive_ports', type: 'number_array', label: 'Sensitive Ports', placeholder: 'e.g. 22, 3306, 5432' },
    ],
  },
  nodebalancer_protocol_check: {
    label: 'NodeBalancer Protocol Check',
    description: 'Allowed and forbidden protocols for NodeBalancer configs.',
    fields: [
      { key: 'allowed_protocols', type: 'string_array', label: 'Allowed Protocols', placeholder: 'e.g. https' },
      { key: 'forbidden_protocols', type: 'string_array', label: 'Forbidden Protocols', placeholder: 'e.g. http' },
    ],
  },
  nodebalancer_port_allowlist: {
    label: 'NodeBalancer Port Allowlist',
    description: 'Only these ports are allowed on NodeBalancer configs.',
    fields: [
      { key: 'allowed_ports', type: 'number_array', label: 'Allowed Ports', placeholder: 'e.g. 443, 80' },
    ],
  },
  nodebalancer_connection_throttle: {
    label: 'NodeBalancer Connection Throttle',
    description: 'Minimum client connection throttle value required on all NodeBalancer ports.',
    fields: [
      { key: 'min_throttle', type: 'number', label: 'Minimum Throttle', placeholder: '1' },
    ],
  },
  lke_node_pool_min_size: {
    label: 'LKE Node Pool Minimum Size',
    description: 'Each LKE node pool must have at least this many nodes.',
    fields: [
      { key: 'min_per_pool', type: 'number', label: 'Minimum Nodes per Pool', placeholder: '2' },
    ],
  },
  lke_node_pool_type_restriction: {
    label: 'LKE Node Pool Instance Type Restriction',
    description: 'Restricts LKE node pool instance types using prefix matching.',
    fields: [
      { key: 'forbidden_prefixes', type: 'string_array', label: 'Forbidden Prefixes', placeholder: 'e.g. g5-' },
      { key: 'allowed_prefixes', type: 'string_array', label: 'Allowed Prefixes', placeholder: 'e.g. g6-' },
    ],
  },
  lke_version_minimum: {
    label: 'LKE Kubernetes Version Minimum',
    description: 'Minimum Kubernetes version required for LKE clusters.',
    fields: [
      { key: 'min_version', type: 'string', label: 'Minimum Version', placeholder: 'e.g. 1.28' },
    ],
  },
  db_backup_recency: {
    label: 'Database Backup Recency',
    description: 'Maximum age in days for the most recent successful database backup.',
    fields: [
      { key: 'max_age_days', type: 'number', label: 'Max Age (days)', placeholder: '7' },
    ],
  },
  db_cluster_size_min: {
    label: 'Database Minimum Cluster Size',
    description: 'Database clusters must have at least this many nodes.',
    fields: [
      { key: 'min_size', type: 'number', label: 'Minimum Cluster Size', placeholder: '2' },
    ],
  },
  db_version_minimum: {
    label: 'Database Engine Version Minimum',
    description: 'Minimum version per database engine. Add engine names (e.g. mysql, postgresql) and their minimum version.',
    fields: [
      { key: 'min_versions', type: 'key_value_map', label: 'Minimum Versions (engine → version)', placeholder: 'e.g. mysql → 8.0' },
    ],
  },
  inactive_users: {
    label: 'Inactive Users',
    description: 'Flags users who have not logged in within the configured number of days.',
    fields: [
      { key: 'max_inactive_days', type: 'number', label: 'Max Inactive Days', placeholder: '90' },
    ],
  },
  user_restricted_access: {
    label: 'User Restricted Access',
    description: 'Usernames that are permitted to have unrestricted account access.',
    fields: [
      { key: 'exclude_usernames', type: 'string_array', label: 'Exclude Usernames', placeholder: 'e.g. admin' },
    ],
  },
  user_ssh_keys_configured: {
    label: 'All Users Must Have SSH Keys',
    description: 'User types to exclude from the SSH key requirement (e.g. proxy accounts).',
    fields: [
      { key: 'exclude_user_types', type: 'string_array', label: 'Exclude User Types', placeholder: 'e.g. proxy' },
    ],
  },
  domain_active: {
    label: 'Domain Must Be Active',
    description: 'Domain statuses that are considered compliant.',
    fields: [
      { key: 'allowed_statuses', type: 'string_array', label: 'Allowed Statuses', placeholder: 'e.g. active' },
    ],
  },
  domain_ttl_minimum: {
    label: 'Domain TTL Minimum',
    description: 'Minimum TTL in seconds required for DNS domains.',
    fields: [
      { key: 'min_ttl_sec', type: 'number', label: 'Minimum TTL (seconds)', placeholder: '300' },
    ],
  },
};

interface FieldSchema {
  key: string;
  type: 'string_array' | 'number_array' | 'number' | 'tag_array' | 'string' | 'key_value_map';
  label: string;
  placeholder?: string;
}

interface RuleSchema {
  label: string;
  description: string;
  fields: FieldSchema[];
}

function StringArrayField({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');

  const add = () => {
    const trimmed = input.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput('');
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((v, i) => (
          <span key={i} className="inline-flex items-center gap-1 text-xs bg-lnborder text-lntext px-2 py-1 rounded-full border border-lnborder2">
            {v}
            <button onClick={() => onChange(value.filter((_, idx) => idx !== i))} className="text-lnmuted hover:text-lnred transition">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {value.length === 0 && <span className="text-xs text-lnfaint italic">No entries</span>}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 bg-lncard border border-lnborder rounded px-3 py-1.5 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2"
        />
        <button
          onClick={add}
          className="flex items-center gap-1 text-xs bg-lnborder hover:bg-lnborder2 border border-lnborder2 text-lntext px-3 py-1.5 rounded transition"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>
    </div>
  );
}

function NumberArrayField({
  value,
  onChange,
  placeholder,
}: {
  value: number[];
  onChange: (v: number[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');

  const add = () => {
    const n = parseInt(input.trim(), 10);
    if (!isNaN(n) && !value.includes(n)) {
      onChange([...value, n].sort((a, b) => a - b));
    }
    setInput('');
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((v, i) => (
          <span key={i} className="inline-flex items-center gap-1 text-xs bg-lnborder text-lntext px-2 py-1 rounded-full border border-lnborder2 font-mono">
            {v}
            <button onClick={() => onChange(value.filter((_, idx) => idx !== i))} className="text-lnmuted hover:text-lnred transition">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {value.length === 0 && <span className="text-xs text-lnfaint italic">No entries</span>}
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="w-32 bg-lncard border border-lnborder rounded px-3 py-1.5 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2"
        />
        <button
          onClick={add}
          className="flex items-center gap-1 text-xs bg-lnborder hover:bg-lnborder2 border border-lnborder2 text-lntext px-3 py-1.5 rounded transition"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>
    </div>
  );
}

function KeyValueMapField({
  value,
  onChange,
  placeholder,
}: {
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  placeholder?: string;
}) {
  const [keyInput, setKeyInput] = useState('');
  const [valInput, setValInput] = useState('');

  const add = () => {
    const k = keyInput.trim();
    const v = valInput.trim();
    if (!k || !v) return;
    onChange({ ...value, [k]: v });
    setKeyInput('');
    setValInput('');
  };

  const remove = (k: string) => {
    const next = { ...value };
    delete next[k];
    onChange(next);
  };

  const entries = Object.entries(value || {});

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2 text-xs bg-lncard border border-lnborder rounded px-3 py-2">
            <span className="font-mono text-lncyan2">{k}</span>
            <span className="text-lnfaint">→</span>
            <span className="font-mono text-emerald-300">{v}</span>
            <button onClick={() => remove(k)} className="ml-auto text-lnfaint hover:text-lnred transition">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {entries.length === 0 && <p className="text-xs text-lnfaint italic">No entries — rule will be not applicable.</p>}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={keyInput}
          onChange={e => setKeyInput(e.target.value)}
          placeholder={placeholder?.split('→')[0]?.trim() || 'Key'}
          className="flex-1 bg-lncard border border-lnborder rounded px-3 py-1.5 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2"
        />
        <input
          type="text"
          value={valInput}
          onChange={e => setValInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder?.split('→')[1]?.trim() || 'Value'}
          className="flex-1 bg-lncard border border-lnborder rounded px-3 py-1.5 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2"
        />
        <button
          onClick={add}
          className="flex items-center gap-1 text-xs bg-lnborder hover:bg-lnborder2 border border-lnborder2 text-lntext px-3 py-1.5 rounded transition"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>
    </div>
  );
}

function TagArrayField({
  value,
  onChange,
}: {
  value: Array<{ key: string; value?: string }>;
  onChange: (v: Array<{ key: string; value?: string }>) => void;
}) {
  const [keyInput, setKeyInput] = useState('');
  const [valInput, setValInput] = useState('');

  const add = () => {
    const k = keyInput.trim();
    if (!k) return;
    const entry: { key: string; value?: string } = { key: k };
    if (valInput.trim()) entry.value = valInput.trim();
    if (!value.find(v => v.key === k)) {
      onChange([...value, entry]);
    }
    setKeyInput('');
    setValInput('');
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        {value.map((v, i) => (
          <div key={i} className="flex items-center gap-2 text-xs bg-lncard border border-lnborder rounded px-3 py-2">
            <span className="font-mono text-lncyan2">{v.key}</span>
            {v.value && v.value !== '*' ? (
              <>
                <span className="text-lnfaint">:</span>
                <span className="font-mono text-emerald-300">{v.value}</span>
              </>
            ) : (
              <span className="text-lnfaint italic">any value</span>
            )}
            <button onClick={() => onChange(value.filter((_, idx) => idx !== i))} className="ml-auto text-lnfaint hover:text-lnred transition">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {value.length === 0 && <p className="text-xs text-lnfaint italic">No required tags — uses min_tags count instead.</p>}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={keyInput}
          onChange={e => setKeyInput(e.target.value)}
          placeholder="Tag key"
          className="flex-1 bg-lncard border border-lnborder rounded px-3 py-1.5 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2"
        />
        <input
          type="text"
          value={valInput}
          onChange={e => setValInput(e.target.value)}
          placeholder="Value (optional)"
          className="flex-1 bg-lncard border border-lnborder rounded px-3 py-1.5 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2"
        />
        <button
          onClick={add}
          className="flex items-center gap-1 text-xs bg-lnborder hover:bg-lnborder2 border border-lnborder2 text-lntext px-3 py-1.5 rounded transition"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>
    </div>
  );
}

export default function RuleConfigEditor({ rule, accountId, onClose }: Props) {
  const schema = CONFIGURABLE_RULES[rule.condition_type];
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [original, setOriginal] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await complianceApi.getRuleConfig(rule.id, accountId);
      const cfg = { ...(rule.condition_config || {}), ...(res.config_override || {}) };
      setConfig(cfg);
      setOriginal(cfg);
    } finally {
      setLoading(false);
    }
  }, [rule.id, rule.condition_config, accountId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await complianceApi.setRuleConfig(rule.id, accountId, config);
      setOriginal(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig({ ...(rule.condition_config || {}) });
  };

  const updateField = (key: string, value: unknown) => {
    setConfig(c => ({ ...c, [key]: value }));
  };

  const isDirty = JSON.stringify(config) !== JSON.stringify(original);

  if (!schema) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-lndark border border-lnborder rounded shadow-2xl w-full max-w-lg">
        <div className="flex items-start justify-between p-5 border-b border-lncard">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-lncyan2/10 rounded">
              <Settings className="w-4 h-4 text-lncyan2" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-lntext">{rule.name}</h2>
              <p className="text-xs text-lnmuted mt-0.5">{schema.description}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-lnfaint hover:text-lntext transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="w-6 h-6 text-lncyan2 animate-spin" />
            </div>
          ) : (
            <div className="space-y-5">
              {schema.fields.map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-medium text-lnmuted mb-2">{field.label}</label>
                  {field.type === 'string_array' && (
                    <StringArrayField
                      value={(config[field.key] as string[]) || []}
                      onChange={v => updateField(field.key, v)}
                      placeholder={field.placeholder}
                    />
                  )}
                  {field.type === 'number_array' && (
                    <NumberArrayField
                      value={(config[field.key] as number[]) || []}
                      onChange={v => updateField(field.key, v)}
                      placeholder={field.placeholder}
                    />
                  )}
                  {field.type === 'number' && (
                    <input
                      type="number"
                      value={(config[field.key] as number) ?? ''}
                      onChange={e => updateField(field.key, parseInt(e.target.value, 10))}
                      placeholder={field.placeholder}
                      className="w-32 bg-lncard border border-lnborder rounded px-3 py-2 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2"
                    />
                  )}
                  {field.type === 'string' && (
                    <input
                      type="text"
                      value={(config[field.key] as string) ?? ''}
                      onChange={e => updateField(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full bg-lncard border border-lnborder rounded px-3 py-2 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2"
                    />
                  )}
                  {field.type === 'tag_array' && (
                    <TagArrayField
                      value={(config[field.key] as Array<{ key: string; value?: string }>) || []}
                      onChange={v => updateField(field.key, v)}
                    />
                  )}
                  {field.type === 'key_value_map' && (
                    <KeyValueMapField
                      value={(config[field.key] as Record<string, string>) || {}}
                      onChange={v => updateField(field.key, v)}
                      placeholder={field.placeholder}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-5 border-t border-lncard">
          <button
            onClick={handleReset}
            disabled={loading || saving}
            className="flex items-center gap-1.5 text-xs text-lnmuted hover:text-lntext transition disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to defaults
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-xs text-lnmuted hover:text-lntext px-3 py-1.5 rounded transition">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!isDirty || saving || loading}
              className={`flex items-center gap-1.5 text-xs px-4 py-1.5 rounded font-medium transition disabled:opacity-40 ${
                saved
                  ? 'bg-emerald-700 text-lntext'
                  : 'bg-lncyan2 hover:bg-lncyan text-lntext'
              }`}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saved ? 'Saved' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { CONFIGURABLE_RULES };
