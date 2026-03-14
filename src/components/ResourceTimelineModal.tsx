import React, { useEffect, useRef, useState } from 'react';
import { X, Clock, TrendingUp, CheckCircle, XCircle, Minus, AlertTriangle, Info, Loader2 } from 'lucide-react';
import { complianceApi, ResourceTimeline, TimelineSnapshot, TimelineRuleEntry } from '../api/compliance';
import { Resource } from '../api/resources';

interface Props {
  resource: Resource;
  accountId: string;
  onClose: () => void;
}

const SEVERITY_CONFIG = {
  critical: { color: '#ef4444', bg: 'bg-red-500/10', text: 'text-red-400', icon: AlertTriangle },
  warning:  { color: '#f59e0b', bg: 'bg-amber-500/10', text: 'text-amber-400', icon: AlertTriangle },
  info:     { color: '#06b6d4', bg: 'bg-cyan-500/10',  text: 'text-cyan-400',  icon: Info },
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatTimeShort(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' });
}

function ScoreChart({ snapshots }: { snapshots: TimelineSnapshot[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  if (snapshots.length === 0) return null;

  const W = 700;
  const H = 160;
  const PAD = { top: 20, right: 20, bottom: 36, left: 44 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const scores = snapshots.map(s => s.compliance_score ?? 0);
  const minScore = Math.max(0, Math.min(...scores) - 5);
  const maxScore = Math.min(100, Math.max(...scores) + 5);
  const range = maxScore - minScore || 10;

  const xScale = (i: number) => PAD.left + (i / Math.max(snapshots.length - 1, 1)) * innerW;
  const yScale = (v: number) => PAD.top + innerH - ((v - minScore) / range) * innerH;

  const points = snapshots.map((s, i) => ({
    x: xScale(i),
    y: yScale(s.compliance_score ?? 0),
    snap: s,
    i,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');

  const areaPath =
    linePath +
    ` L${points[points.length - 1].x.toFixed(1)},${(PAD.top + innerH).toFixed(1)}` +
    ` L${points[0].x.toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`;

  const yTicks = [0, 25, 50, 75, 100].filter(t => t >= minScore - 2 && t <= maxScore + 2);

  const scoreColor = (s: number) => {
    if (s >= 80) return '#10b981';
    if (s >= 60) return '#f59e0b';
    return '#ef4444';
  };

  const latestScore = scores[scores.length - 1];
  const lineColor = scoreColor(latestScore);

  return (
    <div className="relative w-full" style={{ paddingBottom: '23%' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 w-full h-full"
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
          </linearGradient>
          <clipPath id="chartClip">
            <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} />
          </clipPath>
        </defs>

        {yTicks.map(t => (
          <g key={t}>
            <line
              x1={PAD.left} y1={yScale(t)}
              x2={PAD.left + innerW} y2={yScale(t)}
              stroke="rgba(255,255,255,0.05)" strokeWidth="1"
            />
            <text x={PAD.left - 6} y={yScale(t)} textAnchor="end" dominantBaseline="central"
              fontSize="10" fill="rgba(255,255,255,0.3)">{t}%</text>
          </g>
        ))}

        {snapshots.length > 1 && (
          <>
            <path d={areaPath} fill="url(#scoreGrad)" clipPath="url(#chartClip)" />
            <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2.5"
              strokeLinejoin="round" strokeLinecap="round" clipPath="url(#chartClip)" />
          </>
        )}

        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x} cy={p.y} r={hovered === i ? 5.5 : 3.5}
            fill={scoreColor(p.snap.compliance_score ?? 0)}
            stroke="#0f1923" strokeWidth="2"
            style={{ cursor: 'pointer', transition: 'r 0.1s' }}
            onMouseEnter={() => setHovered(i)}
          />
        ))}

        {snapshots.length > 1 && snapshots.map((s, i) => {
          if (snapshots.length > 8 && i % Math.ceil(snapshots.length / 6) !== 0 && i !== snapshots.length - 1) return null;
          return (
            <text
              key={i}
              x={xScale(i)} y={H - 6}
              textAnchor="middle" fontSize="9"
              fill="rgba(255,255,255,0.3)"
            >
              {formatTimeShort(s.snapshot_time)}
            </text>
          );
        })}

        {hovered !== null && (() => {
          const p = points[hovered];
          const s = p.snap;
          const bx = Math.min(Math.max(p.x - 60, PAD.left), W - PAD.right - 120);
          const by = p.y < PAD.top + 50 ? p.y + 14 : p.y - 54;
          return (
            <g>
              <rect x={bx} y={by} width={120} height={46} rx="5" fill="#1a2535" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
              <text x={bx + 60} y={by + 14} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.5)">
                {formatTimeShort(s.snapshot_time)}
              </text>
              <text x={bx + 60} y={by + 30} textAnchor="middle" fontSize="14" fontWeight="700"
                fill={scoreColor(s.compliance_score ?? 0)}>
                {s.compliance_score?.toFixed(1) ?? 'N/A'}%
              </text>
              <text x={bx + 60} y={by + 42} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.3)">
                {s.compliant}✓  {s.non_compliant}✗
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

function StackedBarChart({ snapshots }: { snapshots: TimelineSnapshot[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  if (snapshots.length === 0) return null;

  const W = 700;
  const H = 120;
  const PAD = { top: 10, right: 20, bottom: 30, left: 44 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const maxTotal = Math.max(...snapshots.map(s => s.compliant + s.non_compliant + s.not_applicable), 1);
  const barW = Math.max(4, Math.min(28, (innerW / snapshots.length) * 0.7));
  const gap = innerW / snapshots.length;

  const handleBarMouseEnter = (i: number, svgX: number) => {
    setHovered(i);
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const pct = svgX / W;
      setTooltipPos({ x: pct * rect.width, y: 0 });
    }
  };

  const hoveredSnap = hovered !== null ? snapshots[hovered] : null;

  return (
    <div ref={containerRef} className="relative w-full" style={{ paddingBottom: '17%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full"
        onMouseLeave={() => { setHovered(null); setTooltipPos(null); }}>
        {snapshots.map((s, i) => {
          const x = PAD.left + i * gap + gap / 2 - barW / 2;
          const total = s.compliant + s.non_compliant + s.not_applicable;
          const compliantH = (s.compliant / maxTotal) * innerH;
          const nonCompliantH = (s.non_compliant / maxTotal) * innerH;
          const naH = (s.not_applicable / maxTotal) * innerH;
          let yOff = PAD.top + innerH;

          const segments = [
            { h: naH, fill: 'rgba(148,163,184,0.3)' },
            { h: compliantH, fill: '#10b981' },
            { h: nonCompliantH, fill: '#ef4444' },
          ];

          return (
            <g key={i} onMouseEnter={() => handleBarMouseEnter(i, x + barW / 2)} style={{ cursor: 'pointer' }}>
              {segments.map((seg, si) => {
                if (seg.h < 1) { yOff -= 0; return null; }
                const rect = <rect key={si} x={x} y={yOff - seg.h} width={barW} height={seg.h}
                  fill={seg.fill} rx={si === 2 ? 2 : 0} />;
                yOff -= seg.h;
                return rect;
              })}
              {total > 0 && snapshots.length <= 12 && (
                <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize="8"
                  fill="rgba(255,255,255,0.25)">{formatTimeShort(s.snapshot_time)}</text>
              )}
            </g>
          );
        })}
        <text x={PAD.left - 6} y={PAD.top} textAnchor="end" dominantBaseline="central"
          fontSize="9" fill="rgba(255,255,255,0.25)">{maxTotal}</text>
        <text x={PAD.left - 6} y={PAD.top + innerH} textAnchor="end" dominantBaseline="central"
          fontSize="9" fill="rgba(255,255,255,0.25)">0</text>
      </svg>
      {hoveredSnap && tooltipPos && (
        <div
          className="absolute pointer-events-none z-50"
          style={{
            left: Math.min(tooltipPos.x, (containerRef.current?.clientWidth ?? 0) - 130),
            bottom: '20%',
            transform: 'translateX(-50%)',
          }}
        >
          <div className="bg-[#1a2535] border border-white/10 rounded px-3 py-2 text-xs shadow-lg whitespace-nowrap">
            <div className="text-white/40 mb-1">{formatTimeShort(hoveredSnap.snapshot_time)}</div>
            <div className="text-[#10b981]">✓ {hoveredSnap.compliant} compliant</div>
            <div className="text-[#ef4444]">✗ {hoveredSnap.non_compliant} failing</div>
            <div className="text-white/30">— {hoveredSnap.not_applicable} n/a</div>
          </div>
        </div>
      )}
    </div>
  );
}

function RuleHeatmap({ ruleHistory, snapshots }: { ruleHistory: TimelineRuleEntry[]; snapshots: TimelineSnapshot[] }) {
  const [hoveredCell, setHoveredCell] = useState<{ rule: string; snapIdx: number } | null>(null);

  if (snapshots.length === 0 || ruleHistory.length === 0) return null;

  const snapshotTimes = snapshots.map(s => s.snapshot_time);
  const ruleIds = [...new Set(ruleHistory.map(e => e.rule_id))];

  const ruleNames: Record<string, string> = {};
  const ruleSeverities: Record<string, string> = {};
  ruleHistory.forEach(e => {
    ruleNames[e.rule_id] = e.rule_name;
    ruleSeverities[e.rule_id] = e.severity;
  });

  const cellMap: Record<string, Record<string, string>> = {};
  ruleHistory.forEach(e => {
    if (!cellMap[e.rule_id]) cellMap[e.rule_id] = {};
    cellMap[e.rule_id][e.snapshot_time] = e.status;
  });

  const statusColor = (status: string | undefined) => {
    if (!status) return 'rgba(255,255,255,0.04)';
    if (status === 'compliant') return '#10b981';
    if (status === 'non_compliant') return '#ef4444';
    return 'rgba(148,163,184,0.25)';
  };

  const sortedRules = [...ruleIds].sort((a, b) => {
    const sev = { critical: 0, warning: 1, info: 2 };
    return (sev[ruleSeverities[a] as keyof typeof sev] ?? 3) - (sev[ruleSeverities[b] as keyof typeof sev] ?? 3);
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="text-left py-2 pr-3 text-lnfaint font-normal whitespace-nowrap w-48 min-w-48">Rule</th>
            {snapshotTimes.map((t, i) => (
              <th key={i} className="px-0.5 py-2 min-w-6">
                <div className="text-lnfaint/50 font-normal" style={{ writingMode: 'vertical-rl', fontSize: '9px', transform: 'rotate(180deg)', maxHeight: 64 }}>
                  {formatTimeShort(t)}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRules.map(ruleId => {
            const sev = ruleSeverities[ruleId] as keyof typeof SEVERITY_CONFIG;
            const sevConf = SEVERITY_CONFIG[sev] || SEVERITY_CONFIG.info;
            return (
              <tr key={ruleId} className="group">
                <td className="py-1 pr-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0`}
                      style={{ background: sevConf.color }} />
                    <span className="text-lnmuted group-hover:text-lntext transition-colors truncate max-w-40"
                      title={ruleNames[ruleId]}>
                      {ruleNames[ruleId]}
                    </span>
                  </div>
                </td>
                {snapshotTimes.map((t, si) => {
                  const status = cellMap[ruleId]?.[t];
                  const isHovered = hoveredCell?.rule === ruleId && hoveredCell.snapIdx === si;
                  return (
                    <td key={si} className="px-0.5 py-1">
                      <div
                        className="rounded transition-transform"
                        style={{
                          width: 20, height: 20,
                          background: statusColor(status),
                          transform: isHovered ? 'scale(1.3)' : 'scale(1)',
                          cursor: 'default',
                          border: isHovered ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
                        }}
                        onMouseEnter={() => setHoveredCell({ rule: ruleId, snapIdx: si })}
                        onMouseLeave={() => setHoveredCell(null)}
                        title={`${ruleNames[ruleId]}\n${formatTime(t)}\n${status ?? 'no data'}`}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ResourceTimelineModal({ resource, accountId, onClose }: Props) {
  const [timeline, setTimeline] = useState<ResourceTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'score' | 'checks' | 'heatmap'>('score');

  useEffect(() => {
    setLoading(true);
    setError(null);
    complianceApi.getResourceTimeline(resource.id, accountId)
      .then(data => setTimeline(data))
      .catch(() => setError('Failed to load timeline data.'))
      .finally(() => setLoading(false));
  }, [resource.id, accountId]);

  const latestSnap = timeline?.snapshots[timeline.snapshots.length - 1];
  const firstSnap = timeline?.snapshots[0];
  const scoreDelta = latestSnap && firstSnap && latestSnap !== firstSnap
    ? (latestSnap.compliance_score ?? 0) - (firstSnap.compliance_score ?? 0)
    : null;

  const tabs = [
    { id: 'score' as const, label: 'Compliance Score' },
    { id: 'checks' as const, label: 'Check Counts' },
    { id: 'heatmap' as const, label: 'Rule Heatmap' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-lndark border border-lncard rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-lncard flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded flex items-center justify-center bg-ln-icon-blue text-lnblue">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lntext font-semibold text-base">{resource.label}</h2>
              <p className="text-lnfaint text-xs mt-0.5">Compliance Timeline</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded text-lnmuted hover:text-lntext hover:bg-lncard transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 text-lncyan animate-spin" />
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-64">
              <p className="text-lnmuted">{error}</p>
            </div>
          )}

          {!loading && !error && timeline && (
            <>
              {timeline.snapshots.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 gap-3">
                  <Clock className="w-10 h-10 text-lnfaint" />
                  <p className="text-lnmuted text-sm">No compliance history yet.</p>
                  <p className="text-lnfaint text-xs">Run a sync to start recording compliance checks.</p>
                </div>
              ) : (
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      {
                        label: 'Latest Score',
                        value: latestSnap?.compliance_score != null ? `${latestSnap.compliance_score.toFixed(1)}%` : 'N/A',
                        icon: TrendingUp,
                        color: latestSnap && latestSnap.compliance_score != null
                          ? (latestSnap.compliance_score >= 80 ? 'text-lngreen' : latestSnap.compliance_score >= 60 ? 'text-lnamber' : 'text-lnred')
                          : 'text-lnmuted',
                      },
                      {
                        label: 'Trend',
                        value: scoreDelta != null
                          ? `${scoreDelta >= 0 ? '+' : ''}${scoreDelta.toFixed(1)}%`
                          : '—',
                        icon: TrendingUp,
                        color: scoreDelta == null ? 'text-lnmuted' : scoreDelta >= 0 ? 'text-lngreen' : 'text-lnred',
                      },
                      {
                        label: 'Passing Checks',
                        value: latestSnap ? String(latestSnap.compliant) : '—',
                        icon: CheckCircle,
                        color: 'text-lngreen',
                      },
                      {
                        label: 'Failing Checks',
                        value: latestSnap ? String(latestSnap.non_compliant) : '—',
                        icon: XCircle,
                        color: latestSnap && latestSnap.non_compliant > 0 ? 'text-lnred' : 'text-lnmuted',
                      },
                    ].map((stat, i) => {
                      const Icon = stat.icon;
                      return (
                        <div key={i} className="bg-lnbg rounded-lg border border-lncard p-4">
                          <p className="text-lnfaint text-xs uppercase tracking-wider mb-1.5">{stat.label}</p>
                          <div className="flex items-center gap-2">
                            <Icon className={`w-4 h-4 flex-shrink-0 ${stat.color}`} />
                            <span className={`text-xl font-bold ${stat.color}`}>{stat.value}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-1 border-b border-lncard">
                    {tabs.map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                          activeTab === tab.id
                            ? 'border-lncyan text-lntext'
                            : 'border-transparent text-lnmuted hover:text-lntext'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div>
                    {activeTab === 'score' && (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-lntext text-sm font-medium">Compliance Score Over Time</h3>
                          <div className="flex items-center gap-3 text-xs text-lnfaint">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-lngreen inline-block" /> ≥80%</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-lnamber inline-block" /> 60–79%</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-lnred inline-block" /> &lt;60%</span>
                          </div>
                        </div>
                        <ScoreChart snapshots={timeline.snapshots} />
                        {timeline.snapshots.length === 1 && (
                          <p className="text-lnfaint text-xs text-center mt-2">Only one data point — more syncs will reveal the trend.</p>
                        )}
                      </div>
                    )}

                    {activeTab === 'checks' && (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-lntext text-sm font-medium">Check Counts Per Sync</h3>
                          <div className="flex items-center gap-3 text-xs text-lnfaint">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-lngreen inline-block" /> Compliant</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-lnred inline-block" /> Failing</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-lnborder inline-block" /> N/A</span>
                          </div>
                        </div>
                        <StackedBarChart snapshots={timeline.snapshots} />
                      </div>
                    )}

                    {activeTab === 'heatmap' && (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-lntext text-sm font-medium">Rule Status History</h3>
                          <div className="flex items-center gap-3 text-xs text-lnfaint">
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: '#10b981' }} /> Pass</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: '#ef4444' }} /> Fail</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: 'rgba(148,163,184,0.25)' }} /> N/A</span>
                          </div>
                        </div>
                        <RuleHeatmap ruleHistory={timeline.rule_history} snapshots={timeline.snapshots} />
                      </div>
                    )}
                  </div>

                  <div className="border-t border-lncard pt-4">
                    <p className="text-lnfaint text-xs">
                      {timeline.snapshots.length} snapshot{timeline.snapshots.length !== 1 ? 's' : ''} recorded
                      {firstSnap && latestSnap && firstSnap !== latestSnap && (
                        <> · from {formatTime(firstSnap.snapshot_time)} to {formatTime(latestSnap.snapshot_time)}</>
                      )}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
