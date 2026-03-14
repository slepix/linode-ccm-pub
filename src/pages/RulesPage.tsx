import React, { useEffect, useState, useCallback } from 'react';
import {
  Shield, ToggleLeft, ToggleRight, Search, ChevronDown, ChevronUp,
  Loader2, CheckCircle, AlertTriangle, Info, BookOpen, Tag, Settings
} from 'lucide-react';
import { LinodeAccount } from '../api/accounts';
import {
  complianceApi,
  ComplianceProfile,
  ComplianceRuleWithOverride,
} from '../api/compliance';
import RuleConfigEditor, { CONFIGURABLE_RULES } from '../components/RuleConfigEditor';

const SEV_STYLES: Record<string, { bar: string; badge: string; icon: React.ElementType }> = {
  critical: { bar: 'border-l-red-500', badge: 'text-lnred bg-lnred/10 border-lnred/40', icon: AlertTriangle },
  warning: { bar: 'border-l-amber-500', badge: 'text-lnamber bg-lnamber/10 border-lnamber/40', icon: AlertTriangle },
  info: { bar: 'border-l-blue-500', badge: 'text-lncyan2 bg-lncyan2/10 border-lncyan2/40', icon: Info },
};

const TIER_ORDER: Record<string, number> = {
  foundation: 1, standard: 2, compliance: 3, advanced: 4,
};

interface Props {
  account: LinodeAccount | null;
}

function ProfileCard({
  profile,
  active,
  onToggle,
  saving,
}: {
  profile: ComplianceProfile;
  active: boolean;
  onToggle: () => void;
  saving: boolean;
}) {
  const ruleCount = profile.rule_condition_types?.length ?? 0;

  return (
    <button
      onClick={onToggle}
      disabled={saving}
      className={`relative w-full text-left rounded border p-5 transition-all duration-200 group ${
        active
          ? 'bg-lncyan2/10 border-lncyan2 shadow-lg shadow-lncyan2/10'
          : 'bg-lndark border-lncard hover:border-lnborder2'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded flex items-center justify-center shrink-0 ${
            active ? 'bg-lncyan2' : 'bg-lncard group-hover:bg-lnborder'
          }`}>
            <Shield className={`w-4 h-4 ${active ? 'text-lntext' : 'text-lnmuted'}`} />
          </div>
          <div>
            <div className={`font-semibold text-sm ${active ? 'text-lntext' : 'text-lnmuted'}`}>
              {profile.name}
            </div>
            {profile.tier && (
              <div className="text-xs text-lnfaint mt-0.5 capitalize">{profile.tier}</div>
            )}
          </div>
        </div>
        <div className="shrink-0 mt-0.5">
          {saving ? (
            <Loader2 className="w-5 h-5 text-lncyan2 animate-spin" />
          ) : active ? (
            <ToggleRight className="w-6 h-6 text-lncyan2" />
          ) : (
            <ToggleLeft className="w-6 h-6 text-lnfaint group-hover:text-lnmuted" />
          )}
        </div>
      </div>
      {profile.description && (
        <p className="text-xs text-lnfaint mt-3 leading-relaxed line-clamp-2">{profile.description}</p>
      )}
      <div className="flex items-center gap-3 mt-3">
        <span className="flex items-center gap-1 text-xs text-lnfaint">
          <BookOpen className="w-3 h-3" />
          {ruleCount} rule{ruleCount !== 1 ? 's' : ''}
        </span>
        {profile.version && (
          <span className="flex items-center gap-1 text-xs text-lnfaint">
            <Tag className="w-3 h-3" />
            v{profile.version}
          </span>
        )}
        {active && (
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-lncyan2/10 text-lncyan2 border border-lncyan2/60 font-medium">
            Active
          </span>
        )}
      </div>
    </button>
  );
}

function RuleRow({
  rule,
  accountId,
  onToggled,
  onConfigure,
}: {
  rule: ComplianceRuleWithOverride;
  accountId: string;
  onToggled: () => void;
  onConfigure: (rule: ComplianceRuleWithOverride) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const enabled = !rule.is_overridden_disabled;
  const sev = SEV_STYLES[rule.severity] || SEV_STYLES.info;
  const SevIcon = sev.icon;
  const isConfigurable = rule.condition_type in CONFIGURABLE_RULES;

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSaving(true);
    try {
      await complianceApi.setRuleOverride(rule.id, accountId, !enabled);
      onToggled();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`border-b border-lncard last:border-0 border-l-2 ${sev.bar} ${!enabled ? 'opacity-50' : ''}`}>
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-lncard/40 cursor-pointer transition"
        onClick={() => setExpanded(v => !v)}
      >
        <SevIcon className={`w-4 h-4 shrink-0 ${
          rule.severity === 'critical' ? 'text-lnred' :
          rule.severity === 'warning' ? 'text-lnamber' : 'text-lncyan2'
        }`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium ${enabled ? 'text-lntext' : 'text-lnfaint'}`}>
              {rule.name}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded border ${sev.badge}`}>
              {rule.severity}
            </span>
            {rule.resource_types?.length > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-lncard text-lnmuted border border-lnborder">
                {rule.resource_types.join(', ').replace(/_/g, ' ')}
              </span>
            )}
            {isConfigurable && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-lncard text-lnmuted border border-lnborder">
                configurable
              </span>
            )}
            {!enabled && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-lncard text-lnfaint border border-lnborder">
                disabled
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isConfigurable && (
            <button
              onClick={e => { e.stopPropagation(); onConfigure(rule); }}
              title="Configure rule"
              className="p-1.5 rounded hover:bg-lnborder text-lnfaint hover:text-lncyan2 transition"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={handleToggle}
            disabled={saving}
            title={enabled ? 'Disable this rule' : 'Enable this rule'}
            className="p-1 rounded hover:bg-lnborder transition"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 text-lncyan2 animate-spin" />
            ) : enabled ? (
              <ToggleRight className="w-6 h-6 text-lngreen" />
            ) : (
              <ToggleLeft className="w-6 h-6 text-lnfaint" />
            )}
          </button>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-lnfaint" />
          ) : (
            <ChevronDown className="w-4 h-4 text-lnfaint" />
          )}
        </div>
      </div>
      {expanded && (
        <div className="px-11 pb-4 space-y-2" onClick={e => e.stopPropagation()}>
          {rule.description && (
            <p className="text-sm text-lnmuted leading-relaxed">{rule.description}</p>
          )}
          <div className="flex flex-wrap gap-4 text-xs text-lnfaint">
            <span>Type: <span className="text-lnmuted font-mono">{rule.condition_type}</span></span>
            {rule.is_builtin && <span className="text-lnfaint">Built-in rule</span>}
          </div>
          {isConfigurable && (
            <button
              onClick={e => { e.stopPropagation(); onConfigure(rule); }}
              className="flex items-center gap-1.5 text-xs text-lncyan2 hover:text-lncyan transition mt-1"
            >
              <Settings className="w-3.5 h-3.5" />
              Configure rule parameters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function RulesPage({ account }: Props) {
  const [profiles, setProfiles] = useState<ComplianceProfile[]>([]);
  const [activeProfileIds, setActiveProfileIds] = useState<Set<string>>(new Set());
  const [rules, setRules] = useState<ComplianceRuleWithOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterSev, setFilterSev] = useState('');
  const [filterEnabled, setFilterEnabled] = useState('');
  const [rulesOpen, setRulesOpen] = useState(true);
  const [configuringRule, setConfiguringRule] = useState<ComplianceRuleWithOverride | null>(null);

  const load = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    try {
      const [allProfiles, activeProfiles, allRules] = await Promise.all([
        complianceApi.getProfiles(),
        complianceApi.getActiveProfiles(account.id),
        complianceApi.getRules(account.id),
      ]);
      setProfiles(allProfiles);
      setActiveProfileIds(new Set(activeProfiles.map(p => p.id)));
      setRules(allRules);
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => { load(); }, [load]);

  const handleProfileToggle = async (profileId: string) => {
    if (!account) return;
    setSavingProfile(profileId);
    try {
      const isCurrentlyActive = activeProfileIds.has(profileId);
      if (isCurrentlyActive) {
        await complianceApi.setActiveProfiles(account.id, []);
        setActiveProfileIds(new Set());
      } else {
        await complianceApi.setActiveProfiles(account.id, [profileId]);
        setActiveProfileIds(new Set([profileId]));
      }
    } finally {
      setSavingProfile(null);
    }
  };

  const filteredRules = rules.filter(r => {
    if (filterSev && r.severity !== filterSev) return false;
    if (filterEnabled === 'enabled' && r.is_overridden_disabled) return false;
    if (filterEnabled === 'disabled' && !r.is_overridden_disabled) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.condition_type.toLowerCase().includes(q) ||
        r.resource_types?.some(t => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const sortedProfiles = [...profiles].sort((a, b) => {
    const ta = TIER_ORDER[a.tier?.toLowerCase() ?? ''] ?? 99;
    const tb = TIER_ORDER[b.tier?.toLowerCase() ?? ''] ?? 99;
    return ta - tb || a.name.localeCompare(b.name);
  });

  const disabledCount = rules.filter(r => r.is_overridden_disabled).length;

  if (!account) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-lnfaint">Select an account to manage rules.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-lncyan animate-spin" />
      </div>
    );
  }

  return (
    <>
    <div className="flex-1 p-8 overflow-auto">
      <div className="max-w-5xl mx-auto">

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-lntext">Rules & Profiles</h1>
          <p className="text-lnmuted text-sm mt-1">{account.name}</p>
        </div>

        {/* Profiles Section */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-lntext">Security Profiles</h2>
              <p className="text-xs text-lnfaint mt-0.5">
                Select which compliance profiles to enforce for this account.
                {activeProfileIds.size > 0
                  ? ` ${activeProfileIds.size} active.`
                  : ' None active — all rules are evaluated.'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sortedProfiles.map(p => (
              <ProfileCard
                key={p.id}
                profile={p}
                active={activeProfileIds.has(p.id)}
                onToggle={() => handleProfileToggle(p.id)}
                saving={savingProfile === p.id}
              />
            ))}
          </div>
        </section>

        {/* Rules Section */}
        <section>
          <button
            className="w-full flex items-center justify-between mb-4"
            onClick={() => setRulesOpen(v => !v)}
          >
            <div className="text-left">
              <h2 className="text-base font-semibold text-lntext flex items-center gap-2">
                Individual Rules
                {disabledCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-lnamber/10 text-lnamber border border-lnamber/40 font-normal">
                    {disabledCount} disabled
                  </span>
                )}
              </h2>
              <p className="text-xs text-lnfaint mt-0.5">
                Toggle individual rules on or off for this account.
              </p>
            </div>
            {rulesOpen
              ? <ChevronUp className="w-4 h-4 text-lnfaint shrink-0" />
              : <ChevronDown className="w-4 h-4 text-lnfaint shrink-0" />}
          </button>

          {rulesOpen && (
            <>
              <div className="flex gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-lnfaint" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search rules..."
                    className="w-full bg-lndark border border-lnborder rounded pl-9 pr-3 py-2 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2"
                  />
                </div>
                <select
                  value={filterSev}
                  onChange={e => setFilterSev(e.target.value)}
                  className="bg-lndark border border-lnborder rounded px-3 py-2 text-sm text-lntext focus:outline-none focus:border-lncyan2"
                >
                  <option value="">All Severities</option>
                  <option value="critical">Critical</option>
                  <option value="warning">Warning</option>
                  <option value="info">Info</option>
                </select>
                <select
                  value={filterEnabled}
                  onChange={e => setFilterEnabled(e.target.value)}
                  className="bg-lndark border border-lnborder rounded px-3 py-2 text-sm text-lntext focus:outline-none focus:border-lncyan2"
                >
                  <option value="">All Rules</option>
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>

              <div className="bg-lndark rounded border border-lncard overflow-hidden">
                {filteredRules.length === 0 ? (
                  <div className="p-12 text-center">
                    <CheckCircle className="w-8 h-8 text-lnborder mx-auto mb-3" />
                    <p className="text-lnfaint text-sm">No rules match your filters.</p>
                  </div>
                ) : (
                  filteredRules.map(rule => (
                    <RuleRow
                      key={rule.id}
                      rule={rule}
                      accountId={account.id}
                      onToggled={load}
                      onConfigure={setConfiguringRule}
                    />
                  ))
                )}
              </div>

              <div className="mt-2 text-xs text-lnfaint text-right">
                {filteredRules.length} of {rules.length} rules shown
              </div>
            </>
          )}
        </section>
      </div>
    </div>

    {configuringRule && account && (
      <RuleConfigEditor
        rule={configuringRule}
        accountId={account.id}
        onClose={() => setConfiguringRule(null)}
      />
    )}
    </>
  );
}
