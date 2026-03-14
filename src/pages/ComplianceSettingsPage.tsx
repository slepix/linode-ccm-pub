import React, { useEffect, useState, useCallback } from 'react';
import {
  Shield, ShieldCheck, FileCheck, CreditCard, Wrench, Loader2,
  CheckCircle, XCircle, ChevronDown, ChevronUp, ToggleLeft, ToggleRight, Info, SlidersHorizontal
} from 'lucide-react';
import { LinodeAccount } from '../api/accounts';
import { complianceApi, ComplianceProfile, ComplianceRule, RuleOverride } from '../api/compliance';
import RuleConfigEditor, { CONFIGURABLE_RULES } from '../components/RuleConfigEditor';

interface Props {
  account: LinodeAccount | null;
}

const TIER_ORDER = ['foundation', 'standard', 'strict'];
const TIER_LABELS: Record<string, string> = {
  foundation: 'Foundation',
  standard: 'Standard',
  strict: 'Strict',
};
const TIER_COLORS: Record<string, string> = {
  foundation: 'text-lngreen bg-ln-icon-green border-lnborder2',
  standard: 'text-lnblue bg-ln-icon-blue border-lnborder2',
  strict: 'text-lnamber bg-ln-icon-amber border-lnborder2',
};

const PROFILE_ICONS: Record<string, React.ElementType> = {
  shield: Shield,
  'shield-check': ShieldCheck,
  'file-check': FileCheck,
  'credit-card': CreditCard,
  wrench: Wrench,
};

const SEV_COLORS: Record<string, string> = {
  critical: 'text-lnred bg-ln-icon-red border-lnborder2',
  warning: 'text-lnamber bg-ln-icon-amber border-lnborder2',
  info: 'text-lncyan2 bg-ln-icon-cyan border-lnborder2',
};

function ProfileCard({
  profile,
  isActive,
  hasOtherActive,
  onToggle,
  toggling,
}: {
  profile: ComplianceProfile;
  isActive: boolean;
  hasOtherActive: boolean;
  onToggle: (active: boolean) => void;
  toggling: boolean;
}) {
  const Icon = PROFILE_ICONS[profile.icon || 'shield'] ?? Shield;
  const tierColor = TIER_COLORS[profile.tier || 'foundation'] ?? TIER_COLORS.foundation;

  return (
    <div
      className={`relative rounded border p-5 transition-all ${
        isActive
          ? 'bg-ln-icon-blue border-lnblue shadow-sm'
          : 'bg-lndark border-lncard hover:border-lnborder'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`p-2 rounded shrink-0 ${isActive ? 'bg-lncyan2/10' : 'bg-lncard'}`}>
            <Icon className={`w-5 h-5 ${isActive ? 'text-lncyan2' : 'text-lnmuted'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-lntext">{profile.name}</span>
              {profile.tier && (
                <span className={`text-xs px-1.5 py-0.5 rounded border ${tierColor}`}>
                  {TIER_LABELS[profile.tier] ?? profile.tier}
                </span>
              )}
              {isActive && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-ln-icon-blue border border-lnblue text-lnblue">
                  Active
                </span>
              )}
            </div>
            <p className="text-xs text-lnmuted mt-1 leading-relaxed">{profile.description}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-lnfaint">
              <span>{profile.rule_condition_types.length} rules</span>
              {profile.version && <span>v{profile.version}</span>}
            </div>
          </div>
        </div>
        <button
          onClick={() => onToggle(!isActive)}
          disabled={toggling}
          className={`shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded font-medium transition ${
            isActive
              ? 'bg-blue-700 hover:bg-blue-600 text-lntext'
              : hasOtherActive
                ? 'bg-lncard hover:bg-lncyan2/10 text-lnmuted hover:text-lncyan2 border border-lnborder hover:border-lncyan2/40'
                : 'bg-lncard hover:bg-lnborder text-lnmuted border border-lnborder'
          } disabled:opacity-50`}
        >
          {toggling ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : isActive ? (
            <CheckCircle className="w-3.5 h-3.5" />
          ) : (
            <XCircle className="w-3.5 h-3.5 text-lnfaint" />
          )}
          {isActive ? 'Deactivate' : hasOtherActive ? 'Switch to this' : 'Activate'}
        </button>
      </div>
    </div>
  );
}

function RuleRow({
  rule,
  override,
  onToggle,
  toggling,
  onConfigure,
}: {
  rule: ComplianceRule;
  override: RuleOverride | undefined;
  onToggle: (active: boolean) => void;
  toggling: boolean;
  onConfigure: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const effectiveActive = override ? override.is_active : rule.is_active;
  const isConfigurable = !!CONFIGURABLE_RULES[rule.condition_type];

  return (
    <div className={`border-b border-lncard last:border-0 ${!effectiveActive ? 'opacity-60' : ''}`}>
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-lncard/40 cursor-pointer transition"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-lntext font-medium">{rule.name}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded border ${SEV_COLORS[rule.severity]}`}>
              {rule.severity}
            </span>
            {isConfigurable && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-lncard border border-lnborder text-lnmuted">
                configurable
              </span>
            )}
            {!rule.is_active && !override && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-lncard border border-lnborder text-lnfaint">
                globally disabled
              </span>
            )}
            {override && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-lncard border border-lnborder text-lnfaint">
                overridden
              </span>
            )}
          </div>
          <div className="text-xs text-lnfaint mt-0.5 flex items-center gap-2">
            <span className="capitalize">{rule.condition_type.replace(/_/g, ' ')}</span>
            {rule.resource_types.length > 0 && (
              <span>· {rule.resource_types.join(', ')}</span>
            )}
            {rule.resource_types.length === 0 && (
              <span>· account-level</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isConfigurable && (
            <button
              onClick={e => { e.stopPropagation(); onConfigure(); }}
              className="flex items-center gap-1 text-xs text-lnmuted hover:text-lncyan2 transition px-2 py-1 rounded hover:bg-lncyan2/10 border border-transparent hover:border-blue-800"
              title="Configure rule parameters"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Configure</span>
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); onToggle(!effectiveActive); }}
            disabled={toggling}
            className="flex items-center gap-1 text-xs text-lnmuted hover:text-lntext transition disabled:opacity-50"
            title={effectiveActive ? 'Disable rule' : 'Enable rule'}
          >
            {toggling ? (
              <Loader2 className="w-5 h-5 animate-spin text-lnfaint" />
            ) : effectiveActive ? (
              <ToggleRight className="w-5 h-5 text-lncyan2" />
            ) : (
              <ToggleLeft className="w-5 h-5 text-lnfaint" />
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
        <div className="px-4 pb-3 ml-0">
          <div className="bg-lncard/60 rounded p-3 text-xs text-lnmuted flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-lnfaint mt-0.5 shrink-0" />
            <span>{rule.description}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ComplianceSettingsPage({ account }: Props) {
  const [profiles, setProfiles] = useState<ComplianceProfile[]>([]);
  const [activeProfileIds, setActiveProfileIds] = useState<Set<string>>(new Set());
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [overrides, setOverrides] = useState<RuleOverride[]>([]);
  const [loading, setLoading] = useState(false);
  const [togglingProfile, setTogglingProfile] = useState<string | null>(null);
  const [togglingRule, setTogglingRule] = useState<string | null>(null);
  const [ruleSearch, setRuleSearch] = useState('');
  const [ruleSeverity, setRuleSeverity] = useState('');
  const [expandedTier, setExpandedTier] = useState<string | null>('all');
  const [configuringRule, setConfiguringRule] = useState<ComplianceRule | null>(null);

  const load = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    try {
      const [allProfiles, activeProfiles, allRules, ruleOverrides] = await Promise.all([
        complianceApi.getProfiles(),
        complianceApi.getActiveProfiles(account.id),
        complianceApi.getRules(account.id),
        complianceApi.getRuleOverrides(account.id),
      ]);
      setProfiles(allProfiles);
      setActiveProfileIds(new Set(activeProfiles.map(p => p.id)));
      setRules(allRules);
      setOverrides(ruleOverrides);
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => { load(); }, [load]);

  const handleToggleProfile = async (profileId: string, active: boolean) => {
    if (!account) return;
    setTogglingProfile(profileId);
    try {
      await complianceApi.toggleProfile(profileId, account.id, active);
      await load();
    } finally {
      setTogglingProfile(null);
    }
  };

  const handleToggleRule = async (ruleId: string, active: boolean) => {
    if (!account) return;
    setTogglingRule(ruleId);
    try {
      await complianceApi.setRuleOverride(ruleId, account.id, active);
      await load();
    } finally {
      setTogglingRule(null);
    }
  };

  if (!account) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-lnfaint">Select an account to manage compliance settings.</p>
      </div>
    );
  }

  const profilesByTier = TIER_ORDER.reduce<Record<string, ComplianceProfile[]>>((acc, tier) => {
    acc[tier] = profiles.filter(p => p.tier === tier);
    return acc;
  }, {});

  const overrideMap = new Map(overrides.map(o => [o.rule_id, o]));

  const filteredRules = rules.filter(r => {
    if (ruleSeverity && r.severity !== ruleSeverity) return false;
    if (ruleSearch) {
      const q = ruleSearch.toLowerCase();
      return r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.condition_type.toLowerCase().includes(q);
    }
    return true;
  });

  const activeOverridesCount = overrides.filter(o => o.is_active).length;
  const disabledOverridesCount = overrides.filter(o => !o.is_active).length;

  return (
    <div className="flex-1 p-8 overflow-auto">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-lntext">Compliance Settings</h1>
          <p className="text-lnmuted text-sm mt-1">{account.name}</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 text-lncyan animate-spin" />
          </div>
        ) : (
          <>
            {/* Profiles Section */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-lntext">Security Profiles</h2>
                  <p className="text-sm text-lnmuted mt-0.5">
                    Only one security profile can be active at a time. Activating a profile will automatically deactivate any other.
                    {activeProfileIds.size > 0 && (
                      <span className="ml-2 text-lncyan2">1 active</span>
                    )}
                  </p>
                </div>
              </div>

              {TIER_ORDER.map(tier => {
                const tierProfiles = profilesByTier[tier];
                if (!tierProfiles || tierProfiles.length === 0) return null;
                return (
                  <div key={tier} className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${TIER_COLORS[tier]}`}>
                        {TIER_LABELS[tier]}
                      </span>
                      <div className="flex-1 h-px bg-lncard" />
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      {tierProfiles.map(profile => (
                        <ProfileCard
                          key={profile.id}
                          profile={profile}
                          isActive={activeProfileIds.has(profile.id)}
                          hasOtherActive={activeProfileIds.size > 0 && !activeProfileIds.has(profile.id)}
                          onToggle={active => handleToggleProfile(profile.id, active)}
                          toggling={togglingProfile === profile.id}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>

            {/* Rules Section */}
            <section>
              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-lntext">Individual Rules</h2>
                    <p className="text-sm text-lnmuted mt-0.5">
                      Fine-tune which rules are active for this account. Overrides take precedence over profile settings.
                      {(activeOverridesCount > 0 || disabledOverridesCount > 0) && (
                        <span className="ml-2">
                          {disabledOverridesCount > 0 && (
                            <span className="text-lnamber">{disabledOverridesCount} disabled</span>
                          )}
                          {activeOverridesCount > 0 && disabledOverridesCount > 0 && <span className="text-lnfaint">, </span>}
                          {activeOverridesCount > 0 && (
                            <span className="text-lngreen">{activeOverridesCount} enabled override{activeOverridesCount !== 1 ? 's' : ''}</span>
                          )}
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => setExpandedTier(expandedTier ? null : 'all')}
                    className="text-xs text-lnmuted hover:text-lntext transition"
                  >
                    {expandedTier ? 'Collapse' : 'Expand'}
                  </button>
                </div>

                {expandedTier !== null && (
                  <div className="flex gap-3 mt-3">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={ruleSearch}
                        onChange={e => setRuleSearch(e.target.value)}
                        placeholder="Search rules..."
                        className="w-full bg-lndark border border-lnborder rounded pl-3 pr-3 py-2 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2"
                      />
                    </div>
                    <select
                      value={ruleSeverity}
                      onChange={e => setRuleSeverity(e.target.value)}
                      className="bg-lndark border border-lnborder rounded px-3 py-2 text-sm text-lntext focus:outline-none focus:border-lncyan2"
                    >
                      <option value="">All Severities</option>
                      <option value="critical">Critical</option>
                      <option value="warning">Warning</option>
                      <option value="info">Info</option>
                    </select>
                  </div>
                )}
              </div>

              {expandedTier !== null && (
                <div className="bg-lndark rounded border border-lncard overflow-hidden">
                  {filteredRules.length === 0 ? (
                    <div className="p-8 text-center text-lnfaint text-sm">No rules match your filters.</div>
                  ) : (
                    filteredRules.map(rule => (
                      <RuleRow
                        key={rule.id}
                        rule={rule}
                        override={overrideMap.get(rule.id)}
                        onToggle={active => handleToggleRule(rule.id, active)}
                        toggling={togglingRule === rule.id}
                        onConfigure={() => setConfiguringRule(rule)}
                      />
                    ))
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {configuringRule && account && (
        <RuleConfigEditor
          rule={configuringRule}
          accountId={account.id}
          onClose={() => setConfiguringRule(null)}
        />
      )}
    </div>
  );
}
