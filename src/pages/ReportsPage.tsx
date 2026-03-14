import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  FileText, Plus, Trash2, ChevronRight, X, Loader2,
  CheckCircle, XCircle, AlertTriangle, Shield,
  Calendar, Clock, BarChart3, Server, Download,
  ChevronDown, ChevronUp, Info,
} from 'lucide-react';
import { LinodeAccount } from '../api/accounts';
import { reportsApi, Report, ReportSnapshot, ReportRuleSummary } from '../api/reports';
import { exportReportPdf } from '../utils/exportReportPdf';
import { exportReportCsv, exportReportXls } from '../utils/exportReportCsv';

interface Props {
  account: LinodeAccount | null;
}

const QUARTERS = [
  { label: 'Q1', months: [0, 1, 2] },
  { label: 'Q2', months: [3, 4, 5] },
  { label: 'Q3', months: [6, 7, 8] },
  { label: 'Q4', months: [9, 10, 11] },
];

function getQuarterRange(year: number, q: number): { start: Date; end: Date } {
  const months = QUARTERS[q].months;
  const start = new Date(year, months[0], 1);
  const end = new Date(year, months[2] + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function ScoreCircle({ score }: { score: number | null }) {
  const s = score ?? 0;
  const color = s >= 80 ? '#22c55e' : s >= 60 ? '#f59e0b' : '#ef4444';
  const r = 44;
  const circ = 2 * Math.PI * r;
  const offset = circ - (s / 100) * circ;
  return (
    <div className="w-28 h-28">
      <svg width="112" height="112">
        <circle cx="56" cy="56" r={r} fill="none" stroke="#1f2937" strokeWidth="8"
          transform="rotate(-90 56 56)" />
        <circle cx="56" cy="56" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 56 56)"
          className="transition-all duration-700" />
        {score !== null ? (
          <text x="56" y="56" textAnchor="middle" dominantBaseline="central"
            fontSize="18" fontWeight="700" fill="currentColor"
            className="text-lntext">
            {score.toFixed(0)}%
          </text>
        ) : (
          <text x="56" y="56" textAnchor="middle" dominantBaseline="central"
            fontSize="11" fill="currentColor" className="text-lnfaint">
            N/A
          </text>
        )}
      </svg>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    critical: 'bg-ln-icon-red text-lnred border-lnborder2',
    warning: 'bg-ln-icon-amber text-lnamber border-lnborder2',
    info: 'bg-ln-icon-blue text-lncyan2 border-lnborder2',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${map[severity] ?? map.info}`}>
      {severity}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'compliant') return (
    <span className="inline-flex items-center gap-1 text-xs text-lngreen">
      <CheckCircle className="w-3.5 h-3.5" /> Compliant
    </span>
  );
  if (status === 'non_compliant') return (
    <span className="inline-flex items-center gap-1 text-xs text-lnred">
      <XCircle className="w-3.5 h-3.5" /> Non-Compliant
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-lnfaint">
      <Info className="w-3.5 h-3.5" /> N/A
    </span>
  );
}

interface CreateDialogProps {
  account: LinodeAccount;
  onClose: () => void;
  onCreate: (report: Report) => void;
}

function CreateReportDialog({ account, onClose, onCreate }: CreateDialogProps) {
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  const [mode, setMode] = useState<'quarterly' | 'custom'>('quarterly');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedQ, setSelectedQ] = useState(Math.floor(new Date().getMonth() / 3));
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const quarterLabel = `${QUARTERS[selectedQ].label} ${selectedYear}`;

  useEffect(() => {
    if (mode === 'quarterly') {
      setTitle(`Compliance Report — ${quarterLabel}`);
    }
  }, [mode, quarterLabel]);

  const handleSubmit = async () => {
    setError('');
    let start: Date, end: Date, quarter: string | undefined;

    if (mode === 'quarterly') {
      const r = getQuarterRange(selectedYear, selectedQ);
      start = r.start;
      end = r.end;
      quarter = quarterLabel;
    } else {
      if (!customStart || !customEnd) {
        setError('Please select both start and end dates.');
        return;
      }
      start = new Date(customStart);
      end = new Date(customEnd + 'T23:59:59');
      if (start > end) {
        setError('Start date must be before end date.');
        return;
      }
    }

    if (!title.trim()) {
      setError('Report title is required.');
      return;
    }

    setSaving(true);
    try {
      const report = await reportsApi.create({
        account_id: account.id,
        title: title.trim(),
        description: description.trim(),
        period_start: start.toISOString(),
        period_end: end.toISOString(),
        quarter,
      });
      onCreate(report);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create report');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-lndark border border-lncard rounded w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-lncard">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-lncyan2/10 flex items-center justify-center text-lncyan2">
              <FileText className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-lntext">New Compliance Report</h2>
          </div>
          <button onClick={onClose} className="text-lnfaint hover:text-lnmuted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-lnmuted uppercase tracking-wider mb-2">Report Period</label>
            <div className="flex rounded overflow-hidden border border-lnborder p-0.5 bg-lncard/50 gap-1">
              {(['quarterly', 'custom'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-1.5 text-sm font-medium rounded transition-all ${
                    mode === m
                      ? 'bg-lncyan2 text-lntext shadow'
                      : 'text-lnmuted hover:text-lntext'
                  }`}
                >
                  {m === 'quarterly' ? 'Quarterly' : 'Custom Range'}
                </button>
              ))}
            </div>
          </div>

          {mode === 'quarterly' ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-lnfaint mb-2">Year</label>
                <div className="flex gap-2">
                  {years.map(y => (
                    <button
                      key={y}
                      onClick={() => setSelectedYear(y)}
                      className={`flex-1 py-2 text-sm font-medium rounded border transition-all ${
                        selectedYear === y
                          ? 'bg-lncyan2/10 border-lncyan2/50 text-lncyan2'
                          : 'border-lnborder text-lnmuted hover:border-lnborder2 hover:text-lntext'
                      }`}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-lnfaint mb-2">Quarter</label>
                <div className="grid grid-cols-4 gap-2">
                  {QUARTERS.map((q, i) => {
                    const { start, end } = getQuarterRange(selectedYear, i);
                    return (
                      <button
                        key={q.label}
                        onClick={() => setSelectedQ(i)}
                        className={`p-2.5 rounded border text-center transition-all ${
                          selectedQ === i
                            ? 'bg-lncyan2/10 border-lncyan2/50 text-lncyan2'
                            : 'border-lnborder text-lnmuted hover:border-lnborder2 hover:text-lntext'
                        }`}
                      >
                        <div className="text-sm font-bold">{q.label}</div>
                        <div className="text-xs text-lnfaint mt-0.5">
                          {start.toLocaleString('en-US', { month: 'short' })}–{end.toLocaleString('en-US', { month: 'short' })}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="bg-lncard/60 rounded px-4 py-2.5 text-xs text-lnmuted flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-lnfaint shrink-0" />
                {(() => {
                  const { start, end } = getQuarterRange(selectedYear, selectedQ);
                  return `${formatDate(start.toISOString())} — ${formatDate(end.toISOString())}`;
                })()}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-lnfaint mb-1.5">Start Date</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="w-full bg-lncard border border-lnborder rounded px-3 py-2 text-sm text-lntext focus:outline-none focus:border-lncyan2 transition-colors [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-lnfaint mb-1.5">End Date</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="w-full bg-lncard border border-lnborder rounded px-3 py-2 text-sm text-lntext focus:outline-none focus:border-lncyan2 transition-colors [color-scheme:dark]"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-lnmuted uppercase tracking-wider mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Q1 2025 Compliance Report"
              className="w-full bg-lncard border border-lnborder rounded px-3 py-2.5 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-lnmuted uppercase tracking-wider mb-1.5">
              Notes for Auditor <span className="text-lnfaint normal-case font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Context, methodology, or anything the auditor should know..."
              className="w-full bg-lncard border border-lnborder rounded px-3 py-2.5 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2 transition-colors resize-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-lnred bg-lnred/10 border border-lnred/40 rounded px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded border border-lnborder text-sm text-lnmuted hover:text-lntext hover:border-lnborder2 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-2.5 rounded bg-lncyan2 hover:bg-lncyan disabled:opacity-50 disabled:cursor-not-allowed text-lntext text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</> : 'Generate Report'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ReportViewerProps {
  report: Report;
  onBack: () => void;
  onDelete: () => void;
}

function ExportDropdown({ report }: { report: Report }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const formats = [
    { label: 'PDF', ext: 'pdf', action: () => exportReportPdf(report) },
    { label: 'CSV', ext: 'csv', action: () => exportReportCsv(report) },
    { label: 'XLS', ext: 'xls', action: () => exportReportXls(report) },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded border border-lnborder text-sm text-lnmuted hover:text-lntext hover:border-lnborder2 transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        Export
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 bg-lndark border border-lncard rounded shadow-xl z-50 overflow-hidden">
          {formats.map(f => (
            <button
              key={f.ext}
              onClick={() => { f.action(); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-lnmuted hover:text-lntext hover:bg-lncard/60 transition-colors text-left"
            >
              <span className="text-xs font-mono font-bold text-lnfaint w-8">.{f.ext}</span>
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportViewer({ report, onBack, onDelete }: ReportViewerProps) {
  const snap = report.snapshot as ReportSnapshot | null;
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [showAllResults, setShowAllResults] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await reportsApi.delete(report.id);
      onDelete();
    } catch {
      setDeleting(false);
    }
  };

  if (!snap) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-lnfaint">No snapshot data available for this report.</p>
      </div>
    );
  }

  const summary = snap.summary;
  const nonCompliantResults = snap.results.filter(r => r.status === 'non_compliant');
  const displayedResults = showAllResults ? snap.results : snap.results.slice(0, 50);

  const ruleSummaryEntries = Object.entries(snap.rule_summary).sort((a, b) => {
    const sevOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    const diff = (sevOrder[a[1].severity] ?? 3) - (sevOrder[b[1].severity] ?? 3);
    if (diff !== 0) return diff;
    return b[1].non_compliant - a[1].non_compliant;
  });

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto px-8 py-8 print:px-0 print:py-0">
        <div className="flex items-center gap-3 mb-8 print:hidden">
          <button
            onClick={onBack}
            className="text-sm text-lnmuted hover:text-lntext flex items-center gap-1.5 transition-colors"
          >
            <ChevronRight className="w-4 h-4 rotate-180" /> Reports
          </button>
          <span className="text-lnborder2">/</span>
          <span className="text-sm text-lnmuted truncate max-w-xs">{report.title}</span>
          <div className="ml-auto flex items-center gap-2">
            <ExportDropdown report={report} />
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-lnred">Delete this report?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-lntext text-xs font-medium transition-colors"
                >
                  {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirm'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 rounded border border-lnborder text-lnmuted text-xs hover:text-lntext transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-1.5 rounded text-lnfaint hover:text-lnred hover:bg-lnred/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-lntext">{report.title}</h1>
              <div className="flex items-center gap-4 mt-2 text-sm text-lnmuted">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatDate(snap.period_start)} — {formatDate(snap.period_end)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Generated {formatDateTime(snap.generated_at)}
                </span>
              </div>
              {report.description && (
                <p className="mt-3 text-sm text-lnmuted max-w-2xl">{report.description}</p>
              )}
            </div>
            <div className="shrink-0 ml-6">
              <ScoreCircle score={summary.compliance_score} />
            </div>
          </div>
        </div>

        {(() => {
          const profiles = snap.active_profiles ?? [];
          return (
            <div className={`flex items-start gap-3 rounded border px-4 py-3 mb-6 ${profiles.length > 0 ? 'border-lncyan2/30 bg-lncyan2/5' : 'border-lncard bg-lncard/30'}`}>
              <Shield className={`w-4 h-4 shrink-0 mt-0.5 ${profiles.length > 0 ? 'text-lncyan2' : 'text-lnfaint'}`} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-lnmuted uppercase tracking-wide mb-1.5">Active Security Profiles</div>
                {profiles.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {profiles.map(p => (
                      <div key={p.id} className="bg-lndark border border-lncyan2/30 rounded px-2.5 py-1">
                        <span className="text-xs font-semibold text-lntext">{p.name}</span>
                        {p.tier && <span className="ml-1.5 text-xs text-lncyan2 uppercase tracking-wide">{p.tier}</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-lnfaint">No security profiles were active at time of report generation</span>
                )}
              </div>
            </div>
          );
        })()}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Checks', value: summary.total_checks, icon: BarChart3, color: 'bg-lnborder text-lnmuted' },
            { label: 'Compliant', value: summary.compliant, icon: CheckCircle, color: 'bg-lngreen/10 text-lngreen' },
            { label: 'Non-Compliant', value: summary.non_compliant, icon: XCircle, color: 'bg-lnred/10 text-lnred' },
            { label: 'Resources', value: summary.total_resources, icon: Server, color: 'bg-ln-icon-blue text-lnblue' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-lndark rounded border border-lncard p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded flex items-center justify-center shrink-0 ${color}`}>
                <Icon className="w-4.5 h-4.5" />
              </div>
              <div>
                <div className="text-xs text-lnfaint">{label}</div>
                <div className="text-xl font-bold text-lntext">{value}</div>
              </div>
            </div>
          ))}
        </div>

        {Object.keys(summary.resources_by_type).length > 0 && (
          <div className="bg-lndark rounded border border-lncard p-5 mb-6">
            <h2 className="text-sm font-semibold text-lntext mb-3">Resources by Type</h2>
            <div className="flex flex-wrap gap-2">
              {Object.entries(summary.resources_by_type).map(([type, count]) => (
                <div key={type} className="bg-lncard rounded px-3 py-2 flex items-center gap-2">
                  <span className="text-sm font-semibold text-lntext">{count}</span>
                  <span className="text-xs text-lnmuted capitalize">{type.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-lndark rounded border border-lncard p-5 mb-6">
          <h2 className="text-sm font-semibold text-lntext mb-4">Rule Summary</h2>
          <div className="space-y-2">
            {ruleSummaryEntries.map(([name, rs]: [string, ReportRuleSummary]) => {
              const total = rs.compliant + rs.non_compliant;
              const pct = total > 0 ? (rs.compliant / total) * 100 : 100;
              const expanded = expandedRule === name;
              const ruleResults = snap.results.filter(r => r.rule_name === name);
              return (
                <div key={name} className="border border-lncard rounded overflow-hidden">
                  <button
                    onClick={() => setExpandedRule(expanded ? null : name)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-lncard/40 transition-colors"
                  >
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      rs.severity === 'critical' ? 'bg-red-500' :
                      rs.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm text-lnmuted truncate">{name}</span>
                        <SeverityBadge severity={rs.severity} />
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-lnborder rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              background: pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444',
                            }}
                          />
                        </div>
                        <span className="text-xs text-lnfaint shrink-0 w-20 text-right">
                          {rs.compliant}/{total} compliant
                        </span>
                      </div>
                    </div>
                    {expanded
                      ? <ChevronUp className="w-3.5 h-3.5 text-lnfaint shrink-0" />
                      : <ChevronDown className="w-3.5 h-3.5 text-lnfaint shrink-0" />
                    }
                  </button>
                  {expanded && (
                    <div className="border-t border-lncard bg-lncard/20">
                      {ruleResults.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-lnfaint">No results found.</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-lncard">
                              <th className="px-4 py-2 text-left text-lnfaint font-medium">Resource</th>
                              <th className="px-4 py-2 text-left text-lnfaint font-medium">Type</th>
                              <th className="px-4 py-2 text-left text-lnfaint font-medium">Region</th>
                              <th className="px-4 py-2 text-left text-lnfaint font-medium">Status</th>
                              <th className="px-4 py-2 text-left text-lnfaint font-medium">Detail</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ruleResults.map(r => (
                              <tr key={r.id} className="border-b border-lncard/50 last:border-0">
                                <td className="px-4 py-2 text-lnmuted font-medium">{r.resource_label ?? '—'}</td>
                                <td className="px-4 py-2 text-lnfaint capitalize">{r.resource_type?.replace(/_/g, ' ') ?? '—'}</td>
                                <td className="px-4 py-2 text-lnfaint">{r.region ?? '—'}</td>
                                <td className="px-4 py-2">
                                  <StatusBadge status={r.status} />
                                  {r.acknowledged && (
                                    <span className="ml-1.5 text-xs text-lnamber">(ack)</span>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-lnmuted max-w-xs truncate">{r.detail ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {nonCompliantResults.length > 0 && (
          <div className="bg-lndark rounded border border-lncard p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-lntext">
                Non-Compliant Findings
                <span className="ml-2 text-xs font-normal text-lnred bg-lnred/10 px-2 py-0.5 rounded-full">
                  {nonCompliantResults.length}
                </span>
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-lncard">
                    <th className="px-3 py-2.5 text-left text-lnfaint font-medium">Rule</th>
                    <th className="px-3 py-2.5 text-left text-lnfaint font-medium">Severity</th>
                    <th className="px-3 py-2.5 text-left text-lnfaint font-medium">Resource</th>
                    <th className="px-3 py-2.5 text-left text-lnfaint font-medium">Region</th>
                    <th className="px-3 py-2.5 text-left text-lnfaint font-medium">Acknowledged</th>
                    <th className="px-3 py-2.5 text-left text-lnfaint font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {nonCompliantResults.map(r => (
                    <tr key={r.id} className="border-b border-lncard/50 last:border-0 hover:bg-lncard/20">
                      <td className="px-3 py-2.5 text-lnmuted font-medium max-w-[180px] truncate">{r.rule_name}</td>
                      <td className="px-3 py-2.5"><SeverityBadge severity={r.severity} /></td>
                      <td className="px-3 py-2.5 text-lnmuted">{r.resource_label ?? '—'}</td>
                      <td className="px-3 py-2.5 text-lnfaint">{r.region ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        {r.acknowledged
                          ? <span className="text-lnamber flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Yes</span>
                          : <span className="text-lnfaint">No</span>
                        }
                      </td>
                      <td className="px-3 py-2.5 text-lnmuted max-w-[200px] truncate">{r.detail ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="text-xs text-lnfaint border-t border-lncard pt-4 flex items-center justify-between">
          <span>Report generated for {snap.account_name} on {formatDateTime(snap.generated_at)}</span>
          <span>Compliance Management Platform</span>
        </div>
      </div>
    </div>
  );
}

export default function ReportsPage({ account }: Props) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingReport, setLoadingReport] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  const load = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    try {
      const data = await reportsApi.list(account.id);
      setReports(data);
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    load();
    setSelectedReport(null);
  }, [account]);

  useEffect(() => {
    load();
  }, [load]);

  const selectReport = async (report: Report) => {
    if (report.snapshot && Array.isArray(report.snapshot.results)) {
      setSelectedReport(report);
      return;
    }
    setLoadingReport(report.id);
    try {
      const full = await reportsApi.get(report.id);
      setSelectedReport(full);
    } finally {
      setLoadingReport(null);
    }
  };

  if (!account) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <FileText className="w-16 h-16 text-lnborder mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-lntext mb-2">No account selected</h2>
          <p className="text-lnmuted">Select a Linode account to view reports.</p>
        </div>
      </div>
    );
  }

  if (selectedReport) {
    return (
      <ReportViewer
        report={selectedReport}
        onBack={() => setSelectedReport(null)}
        onDelete={() => {
          setSelectedReport(null);
          load();
        }}
      />
    );
  }

  return (
    <div className="flex-1 p-8 overflow-auto">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-lntext">Compliance Reports</h1>
            <p className="text-lnmuted text-sm mt-1">{account.name}</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-lncyan2 hover:bg-lncyan text-lntext px-4 py-2 rounded text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> New Report
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 text-lncyan animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded bg-lncard flex items-center justify-center mb-5">
              <FileText className="w-8 h-8 text-lnfaint" />
            </div>
            <h3 className="text-lg font-semibold text-lntext mb-2">No reports yet</h3>
            <p className="text-lnfaint text-sm max-w-sm mb-6">
              Generate compliance reports to track your security posture over time and provide evidence for auditors.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 bg-lncyan2 hover:bg-lncyan text-lntext px-4 py-2 rounded text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Generate First Report
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map(report => {
              const snap = report.snapshot as ReportSnapshot | null;
              const score = snap?.summary.compliance_score;
              const scoreColor = score == null ? 'text-lnfaint' : score >= 80 ? 'text-lngreen' : score >= 60 ? 'text-lnamber' : 'text-lnred';
              return (
                <button
                  key={report.id}
                  onClick={() => selectReport(report)}
                  disabled={loadingReport === report.id}
                  className="w-full bg-lndark border border-lncard hover:border-lnborder rounded p-5 text-left transition-all group disabled:opacity-60 disabled:cursor-wait"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded bg-lncyan2/10 flex items-center justify-center text-lncyan2 shrink-0 mt-0.5">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-sm font-semibold text-lntext group-hover:text-lncyan2 transition-colors">{report.title}</h3>
                          <div className="flex items-center gap-3 mt-1 text-xs text-lnfaint">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(report.period_start)} — {formatDate(report.period_end)}
                            </span>
                            {report.quarter && (
                              <span className="bg-lncard px-2 py-0.5 rounded text-lnmuted">{report.quarter}</span>
                            )}
                          </div>
                          {report.description && (
                            <p className="text-xs text-lnfaint mt-1.5 line-clamp-1">{report.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          {snap && (
                            <div className="text-right">
                              <div className={`text-xl font-bold ${scoreColor}`}>
                                {score != null ? `${score.toFixed(0)}%` : 'N/A'}
                              </div>
                              <div className="text-xs text-lnfaint mt-0.5">
                                {snap.summary.non_compliant} findings
                              </div>
                            </div>
                          )}
                          {loadingReport === report.id
                            ? <Loader2 className="w-4 h-4 text-lncyan2 animate-spin" />
                            : report.status === 'generating'
                              ? <Loader2 className="w-4 h-4 text-lncyan2 animate-spin" />
                              : <ChevronRight className="w-4 h-4 text-lnfaint group-hover:text-lnmuted transition-colors" />
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 ml-14 flex items-center gap-4 text-xs text-lnfaint">
                    <span>{snap?.summary.total_checks ?? 0} checks</span>
                    <span className="text-lngreen">{snap?.summary.compliant ?? 0} compliant</span>
                    <span className="text-lnred">{snap?.summary.non_compliant ?? 0} non-compliant</span>
                    <span className="ml-auto flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {formatDateTime(report.created_at)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateReportDialog
          account={account}
          onClose={() => setShowCreate(false)}
          onCreate={report => {
            setShowCreate(false);
            setReports(prev => [report, ...prev]);
            setSelectedReport(report);
          }}
        />
      )}
    </div>
  );
}
