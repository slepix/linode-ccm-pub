import React, { useMemo } from 'react';
import { FileText, Clock, BarChart2 } from 'lucide-react';
import { Report } from '../../api/reports';

interface Props {
  reports: Report[];
}

export default function ReportInsights({ reports }: Props) {
  const readyReports = useMemo(
    () => reports.filter(r => r.status === 'ready' && r.snapshot),
    [reports]
  );

  const sortedReports = useMemo(
    () => [...readyReports].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [readyReports]
  );

  const avgTimeToAck = useMemo(() => {
    const times: number[] = [];
    readyReports.forEach(r => {
      if (!r.snapshot) return;
      r.snapshot.results.forEach(result => {
        if (result.acknowledged && result.acknowledged_at && result.evaluated_at) {
          const diff = new Date(result.acknowledged_at).getTime() - new Date(result.evaluated_at).getTime();
          if (diff > 0) times.push(diff);
        }
      });
    });
    if (times.length === 0) return null;
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    return avg;
  }, [readyReports]);

  const scoreByResourceType = useMemo(() => {
    const map = new Map<string, { compliant: number; total: number }>();
    readyReports.forEach(r => {
      if (!r.snapshot) return;
      r.snapshot.results.forEach(result => {
        if (!result.resource_type) return;
        const existing = map.get(result.resource_type) ?? { compliant: 0, total: 0 };
        existing.total++;
        if (result.status === 'compliant') existing.compliant++;
        map.set(result.resource_type, existing);
      });
    });
    return [...map.entries()]
      .map(([type, { compliant, total }]) => ({
        type,
        score: total > 0 ? (compliant / total) * 100 : 0,
        compliant,
        total,
      }))
      .sort((a, b) => b.total - a.total);
  }, [readyReports]);

  function formatDuration(ms: number): string {
    const hours = ms / (1000 * 60 * 60);
    const days = hours / 24;
    if (days >= 1) return `${days.toFixed(1)}d`;
    return `${hours.toFixed(1)}h`;
  }

  if (readyReports.length === 0) {
    return (
      <div className="bg-lndark border border-lnborder rounded p-5">
        <h3 className="text-xs font-bold text-lnmuted uppercase tracking-wide mb-4">Report Insights</h3>
        <p className="text-sm text-lnfaint text-center py-8">No reports available yet. Generate a report to see insights.</p>
      </div>
    );
  }

  return (
    <div className="bg-lndark border border-lnborder rounded p-5">
      <h3 className="text-xs font-bold text-lnmuted uppercase tracking-wide mb-4">Report Insights</h3>

      {sortedReports.length >= 2 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 className="w-3.5 h-3.5 text-lnmuted" />
            <span className="text-xs text-lnmuted font-medium">Score Trajectory Across Reports</span>
          </div>
          <div className="space-y-2">
            {sortedReports.map(r => {
              const score = r.snapshot?.summary.compliance_score ?? null;
              return (
                <div key={r.id} className="flex items-center gap-3">
                  <div className="text-xs text-lnfaint w-24 shrink-0 truncate">
                    {r.quarter ?? new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                  </div>
                  <div className="flex-1">
                    <div className="h-2 bg-lnborder rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${score ?? 0}%`,
                          background: (score ?? 0) >= 80 ? '#1cb35b' : (score ?? 0) >= 60 ? '#e5a225' : '#cf3235'
                        }}
                      />
                    </div>
                  </div>
                  {score !== null ? (
                    <span
                      className="text-xs font-bold tabular-nums w-12 text-right shrink-0"
                      style={{ color: score >= 80 ? '#1cb35b' : score >= 60 ? '#e5a225' : '#cf3235' }}
                    >
                      {score.toFixed(0)}%
                    </span>
                  ) : (
                    <span className="text-xs text-lnfaint w-12 text-right shrink-0">N/A</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {avgTimeToAck !== null && (
        <div className="mb-5 p-3 rounded bg-lnbg border border-lnborder">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded bg-lncyan2/10 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-lncyan2" />
            </div>
            <div>
              <div className="text-xl font-bold text-lntext tabular-nums">{formatDuration(avgTimeToAck)}</div>
              <div className="text-xs text-lnmuted mt-0.5">Avg time to acknowledge findings</div>
              <div className="text-xs text-lnfaint mt-0.5">Across all reports</div>
            </div>
          </div>
        </div>
      )}

      {scoreByResourceType.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-3.5 h-3.5 text-lnmuted" />
            <span className="text-xs text-lnmuted font-medium">Compliance Score by Resource Type</span>
          </div>
          <div className="space-y-3">
            {scoreByResourceType.map(({ type, score, compliant, total }) => (
              <div key={type}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-lntext capitalize font-medium">{type.replace(/_/g, ' ')}</span>
                    <span className="text-xs text-lnfaint">({total} checks)</span>
                  </div>
                  <span
                    className="text-xs font-bold tabular-nums"
                    style={{ color: score >= 80 ? '#1cb35b' : score >= 60 ? '#e5a225' : '#cf3235' }}
                  >
                    {score.toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 bg-lnborder rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${score}%`,
                      background: score >= 80 ? '#1cb35b' : score >= 60 ? '#e5a225' : '#cf3235'
                    }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-lnfaint">{compliant} compliant</span>
                  <span className="text-xs text-lnfaint">{total - compliant} failing</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
