import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { ComplianceScore } from '../../api/compliance';

interface Props {
  history: ComplianceScore[];
}

function MiniLineChart({
  data,
  color,
  height = 60,
}: {
  data: number[];
  color: string;
  height?: number;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 280;
  const h = height;
  const pad = 4;

  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });

  const areaBottom = h - pad;
  const areaPath = `M ${pts[0]} L ${pts.join(' L ')} L ${pts[pts.length - 1].split(',')[0]},${areaBottom} L ${pad},${areaBottom} Z`;
  const linePath = `M ${pts.join(' L ')}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#grad-${color.replace('#', '')})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((v, i) => {
        const x = pad + (i / (data.length - 1)) * (w - pad * 2);
        const y = h - pad - ((v - min) / range) * (h - pad * 2);
        return (
          <circle key={i} cx={x} cy={y} r="3" fill={color} opacity={i === data.length - 1 ? 1 : 0.4} />
        );
      })}
    </svg>
  );
}

function TrendBadge({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (Math.abs(diff) < 0.5) return (
    <span className="flex items-center gap-1 text-xs text-lnmuted">
      <Minus className="w-3 h-3" /> Stable
    </span>
  );
  if (diff > 0) return (
    <span className="flex items-center gap-1 text-xs text-lngreen">
      <TrendingUp className="w-3 h-3" /> +{diff.toFixed(1)}%
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-xs text-lnred">
      <TrendingDown className="w-3 h-3" /> {diff.toFixed(1)}%
    </span>
  );
}

export default function ComplianceTrends({ history }: Props) {
  const sorted = useMemo(
    () => [...history].sort((a, b) => new Date(a.evaluated_at).getTime() - new Date(b.evaluated_at).getTime()),
    [history]
  );

  const scores = sorted.map(s => s.compliance_score ?? 0);
  const nonCompliant = sorted.map(s => s.non_compliant_count);
  const labels = sorted.map(s => {
    const d = new Date(s.evaluated_at);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });

  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];

  if (sorted.length === 0) {
    return (
      <div className="bg-lndark border border-lnborder rounded p-5">
        <h3 className="text-xs font-bold text-lnmuted uppercase tracking-wide mb-4">Compliance Trends</h3>
        <p className="text-sm text-lnfaint text-center py-8">Run multiple syncs to see trends over time.</p>
      </div>
    );
  }

  return (
    <div className="bg-lndark border border-lnborder rounded p-5">
      <h3 className="text-xs font-bold text-lnmuted uppercase tracking-wide mb-4">Compliance Trends</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-lnmuted font-medium">Score Over Time</span>
            <div className="flex items-center gap-2">
              {latest && previous && (
                <TrendBadge
                  current={latest.compliance_score ?? 0}
                  previous={previous.compliance_score ?? 0}
                />
              )}
              {latest && (
                <span className="text-xs font-bold text-lntext tabular-nums">
                  {(latest.compliance_score ?? 0).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
          <MiniLineChart data={scores} color="#1cb35b" height={72} />
          <div className="flex justify-between mt-1">
            {labels.length > 0 && (
              <>
                <span className="text-xs text-lnfaint">{labels[0]}</span>
                {labels.length > 2 && (
                  <span className="text-xs text-lnfaint">{labels[Math.floor(labels.length / 2)]}</span>
                )}
                <span className="text-xs text-lnfaint">{labels[labels.length - 1]}</span>
              </>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-lnmuted font-medium">Non-Compliant Findings</span>
            {latest && previous && (
              <TrendBadge
                current={-(latest.non_compliant_count)}
                previous={-(previous.non_compliant_count)}
              />
            )}
          </div>
          <MiniLineChart data={nonCompliant} color="#ef4444" height={72} />
          <div className="flex justify-between mt-1">
            {labels.length > 0 && (
              <>
                <span className="text-xs text-lnfaint">{labels[0]}</span>
                {labels.length > 2 && (
                  <span className="text-xs text-lnfaint">{labels[Math.floor(labels.length / 2)]}</span>
                )}
                <span className="text-xs text-lnfaint">{labels[labels.length - 1]}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {sorted.length >= 3 && (
        <div className="mt-5 border-t border-lnborder pt-4">
          <div className="text-xs text-lnmuted font-medium mb-3">Per-Evaluation History</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-lnfaint">
                  <th className="text-left pb-2 font-medium">Date</th>
                  <th className="text-right pb-2 font-medium">Score</th>
                  <th className="text-right pb-2 font-medium">Compliant</th>
                  <th className="text-right pb-2 font-medium">Non-Compliant</th>
                  <th className="text-right pb-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-lnborder">
                {sorted.slice(-10).reverse().map(s => (
                  <tr key={s.id} className="text-lntext">
                    <td className="py-1.5 text-lnmuted">{new Date(s.evaluated_at).toLocaleString()}</td>
                    <td className="py-1.5 text-right tabular-nums font-semibold"
                      style={{ color: (s.compliance_score ?? 0) >= 80 ? '#1cb35b' : (s.compliance_score ?? 0) >= 60 ? '#e5a225' : '#cf3235' }}>
                      {(s.compliance_score ?? 0).toFixed(1)}%
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-lngreen">{s.compliant_count}</td>
                    <td className="py-1.5 text-right tabular-nums text-lnred">{s.non_compliant_count}</td>
                    <td className="py-1.5 text-right tabular-nums text-lnfaint">{s.total_results}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
