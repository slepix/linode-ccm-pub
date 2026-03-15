import React, { useMemo } from 'react';
import { RefreshCw, CheckSquare, AlertCircle, Plus, Minus } from 'lucide-react';
import { ComplianceScore } from '../../api/compliance';
import { ComplianceResult } from '../../api/compliance';

interface Props {
  history: ComplianceScore[];
  results: ComplianceResult[];
}

interface FeedItem {
  id: string;
  type: 'sync' | 'acknowledge' | 'new_findings' | 'resolved';
  time: Date;
  title: string;
  subtitle?: string;
  count?: number;
  score?: number;
  severity?: string;
}

export default function ActivityFeed({ history, results }: Props) {
  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [];

    const sorted = [...history].sort((a, b) =>
      new Date(b.evaluated_at).getTime() - new Date(a.evaluated_at).getTime()
    );

    sorted.slice(0, 8).forEach(s => {
      items.push({
        id: `sync-${s.id}`,
        type: 'sync',
        time: new Date(s.evaluated_at),
        title: 'Sync & Evaluate completed',
        subtitle: `${s.total_results} checks · ${s.compliant_count} compliant · ${s.non_compliant_count} non-compliant`,
        count: s.total_results,
        score: s.compliance_score ?? undefined,
      });
    });

    const recentAck = results
      .filter(r => r.acknowledged && r.acknowledged_at)
      .sort((a, b) => new Date(b.acknowledged_at!).getTime() - new Date(a.acknowledged_at!).getTime())
      .slice(0, 5);

    recentAck.forEach(r => {
      items.push({
        id: `ack-${r.id}`,
        type: 'acknowledge',
        time: new Date(r.acknowledged_at!),
        title: `Finding acknowledged`,
        subtitle: r.rule?.name ?? r.rule_id,
        severity: r.rule?.severity,
      });
    });

    if (sorted.length >= 2) {
      const latest = sorted[0];
      const previous = sorted[1];
      const delta = latest.non_compliant_count - previous.non_compliant_count;
      if (delta > 0) {
        items.push({
          id: 'delta-new',
          type: 'new_findings',
          time: new Date(latest.evaluated_at),
          title: `${delta} new finding${delta !== 1 ? 's' : ''} since last sync`,
          subtitle: `Previously ${previous.non_compliant_count}, now ${latest.non_compliant_count}`,
          count: delta,
        });
      } else if (delta < 0) {
        items.push({
          id: 'delta-resolved',
          type: 'resolved',
          time: new Date(latest.evaluated_at),
          title: `${Math.abs(delta)} finding${Math.abs(delta) !== 1 ? 's' : ''} resolved since last sync`,
          subtitle: `Previously ${previous.non_compliant_count}, now ${latest.non_compliant_count}`,
          count: Math.abs(delta),
        });
      }
    }

    return items.sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 12);
  }, [history, results]);

  const typeConfig = {
    sync: {
      icon: RefreshCw,
      iconClass: 'text-lncyan2',
      bgClass: 'bg-lncyan2/10',
    },
    acknowledge: {
      icon: CheckSquare,
      iconClass: 'text-lngreen',
      bgClass: 'bg-lngreen/10',
    },
    new_findings: {
      icon: AlertCircle,
      iconClass: 'text-lnred',
      bgClass: 'bg-lnred/10',
    },
    resolved: {
      icon: CheckSquare,
      iconClass: 'text-lngreen',
      bgClass: 'bg-lngreen/10',
    },
  };

  function timeAgo(date: Date): string {
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    if (days > 0) return `${days}d ago`;
    if (hrs > 0) return `${hrs}h ago`;
    if (mins > 0) return `${mins}m ago`;
    return 'Just now';
  }

  if (feed.length === 0) {
    return (
      <div className="bg-lndark border border-lnborder rounded p-5">
        <h3 className="text-xs font-bold text-lnmuted uppercase tracking-wide mb-4">Activity Feed</h3>
        <p className="text-sm text-lnfaint text-center py-8">No activity yet. Run a sync to get started.</p>
      </div>
    );
  }

  return (
    <div className="bg-lndark border border-lnborder rounded p-5">
      <h3 className="text-xs font-bold text-lnmuted uppercase tracking-wide mb-4">Activity Feed</h3>

      <div className="space-y-0">
        {feed.map((item, idx) => {
          const cfg = typeConfig[item.type];
          const Icon = cfg.icon;
          return (
            <div key={item.id} className={`flex gap-3 ${idx < feed.length - 1 ? 'pb-4' : ''}`}>
              <div className="flex flex-col items-center shrink-0">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center ${cfg.bgClass}`}>
                  <Icon className={`w-3.5 h-3.5 ${cfg.iconClass}`} />
                </div>
                {idx < feed.length - 1 && (
                  <div className="w-px flex-1 bg-lnborder mt-1.5" />
                )}
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-lntext font-medium">{item.title}</span>
                      {item.type === 'sync' && item.score !== undefined && (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded tabular-nums font-semibold"
                          style={{
                            background: item.score >= 80 ? '#1cb35b22' : item.score >= 60 ? '#e5a22522' : '#cf323522',
                            color: item.score >= 80 ? '#1cb35b' : item.score >= 60 ? '#e5a225' : '#cf3235',
                          }}
                        >
                          {item.score.toFixed(0)}%
                        </span>
                      )}
                      {item.type === 'new_findings' && item.count !== undefined && (
                        <span className="flex items-center gap-0.5 text-xs text-lnred">
                          <Plus className="w-3 h-3" />{item.count}
                        </span>
                      )}
                      {item.type === 'resolved' && item.count !== undefined && (
                        <span className="flex items-center gap-0.5 text-xs text-lngreen">
                          <Minus className="w-3 h-3" />{item.count}
                        </span>
                      )}
                    </div>
                    {item.subtitle && (
                      <div className="text-xs text-lnfaint mt-0.5 truncate">{item.subtitle}</div>
                    )}
                  </div>
                  <span className="text-xs text-lnfaint shrink-0 tabular-nums">{timeAgo(item.time)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
