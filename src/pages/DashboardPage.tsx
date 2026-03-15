import React, { useEffect, useState } from 'react';
import {
  RefreshCw, Shield, CheckCircle, XCircle,
  Server, Clock, Loader2
} from 'lucide-react';
import { LinodeAccount, accountsApi } from '../api/accounts';
import { complianceApi, ComplianceScore, ComplianceResult, ComplianceRule, ComplianceProfile } from '../api/compliance';
import { resourcesApi, Resource } from '../api/resources';
import { reportsApi, Report } from '../api/reports';
import { useSync } from '../context/SyncContext';
import { useAuth } from '../context/AuthContext';
import ComplianceTrends from '../components/dashboard/ComplianceTrends';
import RiskBreakdown from '../components/dashboard/RiskBreakdown';
import AccountComparisons from '../components/dashboard/AccountComparisons';
import ActivityFeed from '../components/dashboard/ActivityFeed';
import CoverageMetrics from '../components/dashboard/CoverageMetrics';
import ReportInsights from '../components/dashboard/ReportInsights';

interface Props {
  account: LinodeAccount | null;
  onAccountUpdated: () => void;
}

function ScoreRing({ score }: { score: number | null }) {
  const s = score ?? 0;
  const color = s >= 80 ? '#22c55e' : s >= 60 ? '#f59e0b' : '#ef4444';
  const r = 52;
  const circ = 2 * Math.PI * r;
  const offset = circ - (s / 100) * circ;

  return (
    <svg viewBox="0 0 144 144" width="144" height="144">
      <circle cx="72" cy="72" r={r} fill="none" stroke="var(--ln-border)" strokeWidth="10" />
      <circle
        cx="72" cy="72" r={r} fill="none"
        stroke={color} strokeWidth="10"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 72 72)"
        className="transition-all duration-1000"
      />
      {score !== null ? (
        <text
          x="72" y="72"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="30"
          fontWeight="700"
          style={{ fill: 'var(--ln-text, #e2e8f0)' }}
        >
          {score.toFixed(0)}%
        </text>
      ) : (
        <text x="72" y="72" textAnchor="middle" dominantBaseline="central" fontSize="14" style={{ fill: 'var(--ln-muted, #94a3b8)' }}>N/A</text>
      )}
    </svg>
  );
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number | string; icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-lndark border border-lnborder rounded p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-lnmuted font-semibold uppercase tracking-wide mb-2">{label}</div>
          <div className="text-3xl font-bold text-lntext tabular-nums">{value}</div>
        </div>
        <div className={`w-9 h-9 rounded flex items-center justify-center ${color}`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage({ account, onAccountUpdated }: Props) {
  const [score, setScore] = useState<ComplianceScore | null>(null);
  const [scoreHistory, setScoreHistory] = useState<ComplianceScore[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [results, setResults] = useState<ComplianceResult[]>([]);
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [allProfiles, setAllProfiles] = useState<ComplianceProfile[]>([]);
  const [activeProfiles, setActiveProfiles] = useState<ComplianceProfile[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [allAccounts, setAllAccounts] = useState<LinodeAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const { syncing, startSync, complianceVersion } = useSync();
  const { user } = useAuth();
  const isAuditor = user?.role === 'auditor';

  const refreshData = () => {
    if (!account) return;
    complianceApi.getScore(account.id).catch(() => null).then(s => {
      setScore(s as ComplianceScore | null);
    });
    resourcesApi.list(account.id).catch(() => []).then(r => {
      setResources(r as Resource[]);
    });
    complianceApi.getScoreHistory(account.id, 30).catch(() => []).then(h => {
      setScoreHistory(h as ComplianceScore[]);
    });
    complianceApi.getResults({ account_id: account.id }).catch(() => []).then(r => {
      setResults(r as ComplianceResult[]);
    });
  };

  useEffect(() => {
    if (!account) return;
    setLoading(true);
    Promise.all([
      complianceApi.getScore(account.id).catch(() => null),
      complianceApi.getScoreHistory(account.id, 30).catch(() => []),
      resourcesApi.list(account.id).catch(() => []),
      complianceApi.getResults({ account_id: account.id }).catch(() => []),
      complianceApi.getRules(account.id).catch(() => []),
      complianceApi.getProfiles().catch(() => []),
      complianceApi.getActiveProfiles(account.id).catch(() => []),
      reportsApi.list(account.id).catch(() => []),
      accountsApi.list().catch(() => []),
    ]).then(([s, h, r, res, rul, allProf, activeProf, reps, accounts]) => {
      setScore(s as ComplianceScore | null);
      setScoreHistory(h as ComplianceScore[]);
      setResources(r as Resource[]);
      setResults(res as ComplianceResult[]);
      setRules(rul as ComplianceRule[]);
      setAllProfiles(allProf as ComplianceProfile[]);
      setActiveProfiles(activeProf as ComplianceProfile[]);
      setReports(reps as Report[]);
      setAllAccounts(accounts as LinodeAccount[]);
    }).finally(() => setLoading(false));
  }, [account, complianceVersion]);

  const handleSync = () => {
    if (!account || syncing) return;
    startSync(account.id, () => {
      onAccountUpdated();
      refreshData();
    });
  };

  if (!account) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-14 h-14 text-lnborder mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-lntext mb-2">No account selected</h2>
          <p className="text-lnmuted text-sm">Select or add a Linode account to get started.</p>
        </div>
      </div>
    );
  }

  const resourcesByType = resources.reduce<Record<string, number>>((acc, r) => {
    acc[r.resource_type] = (acc[r.resource_type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-lntext">{account.name}</h1>
            <p className="text-lnfaint text-sm mt-0.5">
              {account.last_sync_at
                ? `Last sync: ${new Date(account.last_sync_at).toLocaleString()}`
                : 'Never synced'}
            </p>
          </div>
          {!isAuditor && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 bg-lncyan2 hover:bg-lncyan disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm font-medium transition"
            >
              {syncing
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <RefreshCw className="w-4 h-4" />}
              {syncing ? 'Syncing…' : 'Sync & Evaluate'}
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-7 h-7 text-lncyan2 animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
              <div className="bg-lndark border border-lnborder rounded p-5 flex flex-col items-center justify-center">
                <div className="text-xs text-lnmuted mb-3 font-semibold uppercase tracking-wide">Compliance Score</div>
                <ScoreRing score={score?.compliance_score ?? null} />
                {score?.evaluated_at && (
                  <div className="text-xs text-lnfaint mt-3 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(score.evaluated_at).toLocaleString()}
                  </div>
                )}
              </div>

              <StatCard
                label="Compliant Checks"
                value={score?.compliant_count ?? 0}
                icon={CheckCircle}
                color="bg-lngreen/10 text-lngreen"
              />
              <StatCard
                label="Non-Compliant Checks"
                value={score?.non_compliant_count ?? 0}
                icon={XCircle}
                color="bg-lnred/10 text-lnred"
              />
              <StatCard
                label="Total Resources"
                value={resources.length}
                icon={Server}
                color="bg-lncyan2/10 text-lncyan2"
              />
            </div>

            {Object.keys(resourcesByType).length > 0 && (
              <div className="bg-lndark border border-lnborder rounded p-5 mb-4">
                <h3 className="text-xs font-bold text-lnmuted uppercase tracking-wide mb-4">Resources by Type</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Object.entries(resourcesByType).map(([type, count]) => (
                    <div key={type} className="bg-lnbg border border-lnborder rounded p-3">
                      <div className="text-xl font-bold text-lntext">{count}</div>
                      <div className="text-xs text-lnmuted capitalize mt-0.5">
                        {type.replace(/_/g, ' ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {score?.rule_breakdown && score.rule_breakdown.length > 0 && (
              <div className="bg-lndark border border-lnborder rounded p-5 mb-4">
                <h3 className="text-xs font-bold text-lnmuted uppercase tracking-wide mb-4">Rule Breakdown</h3>
                <div className="space-y-3">
                  {score.rule_breakdown
                    .sort((a, b) => b.non_compliant - a.non_compliant)
                    .slice(0, 10)
                    .map(rb => {
                      const total = rb.compliant + rb.non_compliant;
                      const pct = total > 0 ? (rb.compliant / total) * 100 : 100;
                      return (
                        <div key={rb.rule_id} className="flex items-center gap-3">
                          <div className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ background: rb.severity === 'critical' ? '#cf3235' : rb.severity === 'warning' ? '#e5a225' : '#5f7080' }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-lntext truncate">{rb.rule_name}</span>
                              <span className="text-xs text-lnfaint ml-2 shrink-0 tabular-nums">
                                {rb.compliant}/{total}
                              </span>
                            </div>
                            <div className="h-1 bg-lnborder rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${pct}%`,
                                  background: pct >= 80 ? '#1cb35b' : pct >= 60 ? '#e5a225' : '#cf3235'
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            <div className="mb-4">
              <ComplianceTrends history={scoreHistory} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <RiskBreakdown results={results} score={score} />
              <ActivityFeed history={scoreHistory} results={results} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <CoverageMetrics
                rules={rules}
                activeProfiles={activeProfiles}
                allProfiles={allProfiles}
                resources={resources}
              />
              <ReportInsights reports={reports} />
            </div>

            {allAccounts.length > 1 && (
              <div className="mb-4">
                <AccountComparisons accounts={allAccounts} currentAccountId={account.id} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
