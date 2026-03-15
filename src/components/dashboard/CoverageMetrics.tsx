import React from 'react';
import { Shield, Server, Layers } from 'lucide-react';
import { ComplianceRule, ComplianceProfile } from '../../api/compliance';
import { Resource } from '../../api/resources';

interface Props {
  rules: ComplianceRule[];
  activeProfiles: ComplianceProfile[];
  allProfiles: ComplianceProfile[];
  resources: Resource[];
}

function CoverageBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-2 bg-lnborder rounded-full overflow-hidden mt-2">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

export default function CoverageMetrics({ rules, activeProfiles, allProfiles, resources }: Props) {
  const enabledRules = rules.filter(r => r.is_active);
  const totalRules = rules.length;

  const resourcesByType = resources.reduce<Record<string, number>>((acc, r) => {
    acc[r.resource_type] = (acc[r.resource_type] || 0) + 1;
    return acc;
  }, {});

  const coveredTypes = new Set(enabledRules.flatMap(r => r.resource_types));
  const totalTypes = Object.keys(resourcesByType).length;
  const coveredTypeCount = Object.keys(resourcesByType).filter(t => coveredTypes.has(t)).length;

  const profileCoverage = allProfiles.length > 0
    ? (activeProfiles.length / allProfiles.length) * 100
    : 0;

  const rulesByType = resources.reduce<Record<string, { covered: number; total: number }>>((acc, r) => {
    if (!acc[r.resource_type]) {
      const typeRules = enabledRules.filter(rule => rule.resource_types.includes(r.resource_type));
      const allTypeRules = rules.filter(rule => rule.resource_types.includes(r.resource_type));
      acc[r.resource_type] = { covered: typeRules.length, total: allTypeRules.length };
    }
    return acc;
  }, {});

  return (
    <div className="bg-lndark border border-lnborder rounded p-5">
      <h3 className="text-xs font-bold text-lnmuted uppercase tracking-wide mb-4">Coverage Metrics</h3>

      <div className="space-y-4">
        <div className="p-3 rounded bg-lnbg border border-lnborder">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded bg-lncyan2/10 flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-lncyan2" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs text-lnmuted font-medium">Rules Enabled</span>
                <span className="text-sm font-bold text-lntext tabular-nums">
                  {enabledRules.length}
                  <span className="text-xs text-lnfaint font-normal"> / {totalRules}</span>
                </span>
              </div>
              <CoverageBar value={enabledRules.length} max={totalRules} color="#0ab9e6" />
              <div className="text-xs text-lnfaint mt-1.5">
                {totalRules > 0 ? ((enabledRules.length / totalRules) * 100).toFixed(0) : 0}% of available rules active
              </div>
            </div>
          </div>
        </div>

        <div className="p-3 rounded bg-lnbg border border-lnborder">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded bg-lngreen/10 flex items-center justify-center shrink-0">
              <Server className="w-4 h-4 text-lngreen" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs text-lnmuted font-medium">Resource Types Covered</span>
                <span className="text-sm font-bold text-lntext tabular-nums">
                  {coveredTypeCount}
                  <span className="text-xs text-lnfaint font-normal"> / {totalTypes}</span>
                </span>
              </div>
              <CoverageBar value={coveredTypeCount} max={totalTypes} color="#1cb35b" />
              <div className="text-xs text-lnfaint mt-1.5">
                {resources.length} total resources discovered
              </div>
            </div>
          </div>
        </div>

        <div className="p-3 rounded bg-lnbg border border-lnborder">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded bg-lnamber/10 flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4 text-lnamber" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs text-lnmuted font-medium">Profiles Applied</span>
                <span className="text-sm font-bold text-lntext tabular-nums">
                  {activeProfiles.length}
                  <span className="text-xs text-lnfaint font-normal"> / {allProfiles.length}</span>
                </span>
              </div>
              <CoverageBar value={activeProfiles.length} max={allProfiles.length} color="#e5a225" />
              {activeProfiles.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {activeProfiles.map(p => (
                    <span key={p.id} className="text-xs px-1.5 py-0.5 rounded bg-lnamber/10 text-lnamber">
                      {p.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {Object.keys(rulesByType).length > 0 && (
        <div className="mt-5 border-t border-lnborder pt-4">
          <div className="text-xs text-lnmuted font-medium mb-3">Rules per Resource Type</div>
          <div className="space-y-2.5">
            {Object.entries(rulesByType)
              .sort((a, b) => b[1].covered - a[1].covered)
              .map(([type, { covered, total }]) => {
                const pct = total > 0 ? (covered / total) * 100 : 0;
                const count = resourcesByType[type] ?? 0;
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-lntext capitalize">{type.replace(/_/g, ' ')}</span>
                        <span className="text-xs text-lnfaint">({count} resources)</span>
                      </div>
                      <span className="text-xs text-lnmuted tabular-nums">{covered}/{total} rules</span>
                    </div>
                    <div className="h-1.5 bg-lnborder rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${pct}%`,
                          background: pct >= 80 ? '#1cb35b' : pct >= 50 ? '#e5a225' : '#0ab9e6'
                        }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
