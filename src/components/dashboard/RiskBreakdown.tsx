import React, { useMemo } from 'react';
import { AlertTriangle, AlertCircle, Info, Clock } from 'lucide-react';
import { ComplianceResult, ComplianceScore } from '../../api/compliance';

interface Props {
  results: ComplianceResult[];
  score: ComplianceScore | null;
}

const SEV_CONFIG = {
  critical: { label: 'Critical', color: '#cf3235', bg: 'bg-lnred/10', text: 'text-lnred', icon: AlertCircle },
  warning: { label: 'Warning', color: '#e5a225', bg: 'bg-lnamber/10', text: 'text-lnamber', icon: AlertTriangle },
  info: { label: 'Info', color: '#5f7080', bg: 'bg-lnmuted/10', text: 'text-lnmuted', icon: Info },
};

function SeverityBar({ critical, warning, info }: { critical: number; warning: number; info: number }) {
  const total = critical + warning + info;
  if (total === 0) return null;
  return (
    <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
      {critical > 0 && (
        <div
          className="transition-all duration-500 rounded-full"
          style={{ width: `${(critical / total) * 100}%`, background: '#cf3235' }}
          title={`Critical: ${critical}`}
        />
      )}
      {warning > 0 && (
        <div
          className="transition-all duration-500 rounded-full"
          style={{ width: `${(warning / total) * 100}%`, background: '#e5a225' }}
          title={`Warning: ${warning}`}
        />
      )}
      {info > 0 && (
        <div
          className="transition-all duration-500 rounded-full"
          style={{ width: `${(info / total) * 100}%`, background: '#5f7080' }}
          title={`Info: ${info}`}
        />
      )}
    </div>
  );
}

export default function RiskBreakdown({ results, score }: Props) {
  const nonCompliant = useMemo(
    () => results.filter(r => r.status === 'non_compliant' && !r.acknowledged),
    [results]
  );

  const bySeverity = useMemo(() => {
    const counts = { critical: 0, warning: 0, info: 0 };
    nonCompliant.forEach(r => {
      const sev = (r.rule?.severity ?? 'info') as keyof typeof counts;
      if (sev in counts) counts[sev]++;
    });
    return counts;
  }, [nonCompliant]);

  const topOffenders = useMemo(() => {
    const map = new Map<string, { label: string; type: string; count: number; critical: number }>();
    nonCompliant.forEach(r => {
      if (!r.resource) return;
      const key = r.resource.id;
      const existing = map.get(key) ?? { label: r.resource.label, type: r.resource.resource_type, count: 0, critical: 0 };
      existing.count++;
      if (r.rule?.severity === 'critical') existing.critical++;
      map.set(key, existing);
    });
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  }, [nonCompliant]);

  const oldestUnacknowledged = useMemo(() => {
    return [...nonCompliant]
      .filter(r => r.evaluated_at)
      .sort((a, b) => new Date(a.evaluated_at).getTime() - new Date(b.evaluated_at).getTime())
      .slice(0, 5);
  }, [nonCompliant]);

  const ruleBreakdown = score?.rule_breakdown ?? [];
  const criticalRules = ruleBreakdown
    .filter(r => r.severity === 'critical' && r.non_compliant > 0)
    .sort((a, b) => b.non_compliant - a.non_compliant)
    .slice(0, 5);

  return (
    <div className="bg-lndark border border-lnborder rounded p-5">
      <h3 className="text-xs font-bold text-lnmuted uppercase tracking-wide mb-4">Risk & Severity Breakdown</h3>

      <div className="grid grid-cols-3 gap-3 mb-5">
        {(Object.keys(SEV_CONFIG) as Array<keyof typeof SEV_CONFIG>).map(sev => {
          const cfg = SEV_CONFIG[sev];
          const Icon = cfg.icon;
          const count = bySeverity[sev];
          return (
            <div key={sev} className={`rounded p-3 border border-lnborder flex items-start gap-2.5`}>
              <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${cfg.bg}`}>
                <Icon className={`w-4 h-4 ${cfg.text}`} />
              </div>
              <div>
                <div className="text-2xl font-bold text-lntext tabular-nums">{count}</div>
                <div className="text-xs text-lnmuted mt-0.5">{cfg.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mb-1">
        <div className="flex justify-between text-xs text-lnfaint mb-2">
          <span>Severity Distribution</span>
          <span>{nonCompliant.length} open findings</span>
        </div>
        <SeverityBar
          critical={bySeverity.critical}
          warning={bySeverity.warning}
          info={bySeverity.info}
        />
        <div className="flex gap-4 mt-2">
          {(Object.keys(SEV_CONFIG) as Array<keyof typeof SEV_CONFIG>).map(sev => (
            <div key={sev} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: SEV_CONFIG[sev].color }} />
              <span className="text-xs text-lnfaint">{SEV_CONFIG[sev].label}</span>
              <span className="text-xs text-lnmuted font-medium tabular-nums">{bySeverity[sev]}</span>
            </div>
          ))}
        </div>
      </div>

      {topOffenders.length > 0 && (
        <div className="mt-5 border-t border-lnborder pt-4">
          <div className="text-xs text-lnmuted font-medium mb-3">Top Offenders</div>
          <div className="space-y-2">
            {topOffenders.map((r, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded bg-lnborder flex items-center justify-center shrink-0">
                  <span className="text-xs text-lnfaint font-bold">{i + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-lntext truncate font-medium">{r.label}</div>
                  <div className="text-xs text-lnfaint capitalize">{r.type.replace(/_/g, ' ')}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.critical > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-lnred/10 text-lnred tabular-nums">
                      {r.critical} crit
                    </span>
                  )}
                  <span className="text-xs text-lnmuted tabular-nums">{r.count} issues</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {criticalRules.length > 0 && (
        <div className="mt-5 border-t border-lnborder pt-4">
          <div className="text-xs text-lnmuted font-medium mb-3">Critical Rules Failing</div>
          <div className="space-y-2.5">
            {criticalRules.map(r => {
              const total = r.compliant + r.non_compliant;
              const failPct = total > 0 ? (r.non_compliant / total) * 100 : 0;
              return (
                <div key={r.rule_id}>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs text-lntext truncate flex-1 mr-2">{r.rule_name}</span>
                    <span className="text-xs text-lnred tabular-nums shrink-0">{r.non_compliant}/{total} failing</span>
                  </div>
                  <div className="h-1.5 bg-lnborder rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${failPct}%`, background: '#cf3235' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {oldestUnacknowledged.length > 0 && (
        <div className="mt-5 border-t border-lnborder pt-4">
          <div className="text-xs text-lnmuted font-medium mb-3 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Oldest Unacknowledged Findings
          </div>
          <div className="space-y-2">
            {oldestUnacknowledged.map(r => {
              const age = Math.floor((Date.now() - new Date(r.evaluated_at).getTime()) / (1000 * 60 * 60 * 24));
              return (
                <div key={r.id} className="flex items-start gap-2.5">
                  <div
                    className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                    style={{
                      background: r.rule?.severity === 'critical' ? '#cf3235' : r.rule?.severity === 'warning' ? '#e5a225' : '#5f7080'
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-lntext truncate">{r.rule?.name ?? r.rule_id}</div>
                    {r.resource && (
                      <div className="text-xs text-lnfaint truncate">{r.resource.label}</div>
                    )}
                  </div>
                  <span className="text-xs text-lnamber shrink-0 tabular-nums">{age}d old</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
