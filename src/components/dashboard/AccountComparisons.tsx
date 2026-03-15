import React, { useEffect, useState } from 'react';
import { Shield, AlertCircle } from 'lucide-react';
import { LinodeAccount } from '../../api/accounts';
import { complianceApi, ComplianceScore } from '../../api/compliance';

interface Props {
  accounts: LinodeAccount[];
  currentAccountId: string;
}

interface AccountScore {
  account: LinodeAccount;
  score: ComplianceScore | null;
  loading: boolean;
}

export default function AccountComparisons({ accounts, currentAccountId }: Props) {
  const [scores, setScores] = useState<AccountScore[]>([]);

  useEffect(() => {
    if (accounts.length <= 1) return;
    const initial = accounts.map(a => ({ account: a, score: null, loading: true }));
    setScores(initial);

    accounts.forEach((account, idx) => {
      complianceApi.getScore(account.id)
        .then(s => {
          setScores(prev => {
            const next = [...prev];
            next[idx] = { account, score: s, loading: false };
            return next;
          });
        })
        .catch(() => {
          setScores(prev => {
            const next = [...prev];
            next[idx] = { account, score: null, loading: false };
            return next;
          });
        });
    });
  }, [accounts]);

  if (accounts.length <= 1) return null;

  const sorted = [...scores].sort((a, b) => {
    const sa = a.score?.compliance_score ?? -1;
    const sb = b.score?.compliance_score ?? -1;
    return sb - sa;
  });

  const maxCritical = Math.max(...scores.map(s =>
    s.score?.rule_breakdown.filter(r => r.severity === 'critical').reduce((sum, r) => sum + r.non_compliant, 0) ?? 0
  ), 1);

  return (
    <div className="bg-lndark border border-lnborder rounded p-5">
      <h3 className="text-xs font-bold text-lnmuted uppercase tracking-wide mb-4">Account Comparisons</h3>

      <div className="space-y-3">
        {sorted.map(({ account, score, loading }) => {
          const s = score?.compliance_score ?? null;
          const isCurrent = account.id === currentAccountId;
          const criticalCount = score?.rule_breakdown
            .filter(r => r.severity === 'critical')
            .reduce((sum, r) => sum + r.non_compliant, 0) ?? 0;

          return (
            <div
              key={account.id}
              className={`rounded p-3 border transition ${isCurrent
                ? 'border-lncyan2/40 bg-lncyan2/5'
                : 'border-lnborder bg-lnbg'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${
                  s === null ? 'bg-lnborder/30' : s >= 80 ? 'bg-lngreen/10' : s >= 60 ? 'bg-lnamber/10' : 'bg-lnred/10'
                }`}>
                  <Shield className={`w-4 h-4 ${
                    s === null ? 'text-lnmuted' : s >= 80 ? 'text-lngreen' : s >= 60 ? 'text-lnamber' : 'text-lnred'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-lntext truncate">{account.name}</span>
                    {isCurrent && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-lncyan2/10 text-lncyan2 shrink-0">Current</span>
                    )}
                  </div>
                  {score && (
                    <div className="mt-1.5">
                      <div className="h-1.5 bg-lnborder rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${s ?? 0}%`,
                            background: (s ?? 0) >= 80 ? '#1cb35b' : (s ?? 0) >= 60 ? '#e5a225' : '#cf3235'
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {loading ? (
                    <div className="w-10 h-5 bg-lnborder rounded animate-pulse" />
                  ) : s !== null ? (
                    <span
                      className="text-lg font-bold tabular-nums"
                      style={{ color: s >= 80 ? '#1cb35b' : s >= 60 ? '#e5a225' : '#cf3235' }}
                    >
                      {s.toFixed(0)}%
                    </span>
                  ) : (
                    <span className="text-sm text-lnfaint">N/A</span>
                  )}
                  {criticalCount > 0 && (
                    <div className="flex items-center gap-1 justify-end mt-0.5">
                      <AlertCircle className="w-3 h-3 text-lnred" />
                      <span className="text-xs text-lnred tabular-nums">{criticalCount} critical</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-lnborder grid grid-cols-3 gap-3 text-center">
        {(() => {
          const ready = scores.filter(s => s.score !== null);
          if (ready.length === 0) return null;
          const avg = ready.reduce((sum, s) => sum + (s.score?.compliance_score ?? 0), 0) / ready.length;
          const best = ready.reduce((a, b) => ((a.score?.compliance_score ?? 0) > (b.score?.compliance_score ?? 0) ? a : b));
          const worst = ready.reduce((a, b) => ((a.score?.compliance_score ?? 0) < (b.score?.compliance_score ?? 0) ? a : b));
          return (
            <>
              <div>
                <div className="text-lg font-bold text-lntext tabular-nums">{avg.toFixed(0)}%</div>
                <div className="text-xs text-lnfaint mt-0.5">Avg Score</div>
              </div>
              <div>
                <div className="text-sm font-semibold text-lngreen truncate">{best.account.name}</div>
                <div className="text-xs text-lnfaint mt-0.5">Best Posture</div>
              </div>
              <div>
                <div className="text-sm font-semibold text-lnred truncate">{worst.account.name}</div>
                <div className="text-xs text-lnfaint mt-0.5">Needs Attention</div>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
