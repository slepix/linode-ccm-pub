import React, { useEffect, useState, useCallback } from 'react';
import { X, GitCompare, Plus, Trash2, CreditCard as Edit3, ChevronDown, ChevronRight, Loader2, AlertCircle, Server, HardDrive, Database, Cloud, Shield, Network, Box, Globe } from 'lucide-react';
import { resourcesApi, DriftResult, DriftChange } from '../api/resources';

const TYPE_ICONS: Record<string, React.ElementType> = {
  linode: Server,
  volume: HardDrive,
  database: Database,
  object_storage: Cloud,
  firewall: Shield,
  vpc: Network,
  lke_cluster: Box,
  nodebalancer: Network,
  domain: Globe,
};

const TYPE_LABELS: Record<string, string> = {
  linode: 'Linode',
  volume: 'Volume',
  database: 'Database',
  object_storage: 'Object Storage',
  firewall: 'Firewall',
  vpc: 'VPC',
  lke_cluster: 'LKE Cluster',
  nodebalancer: 'NodeBalancer',
  domain: 'Domain',
};

const CHANGE_META = {
  added: { label: 'Added', color: 'text-lngreen', bg: 'bg-lngreen/10 border-lngreen/30', icon: Plus },
  removed: { label: 'Removed', color: 'text-lnred', bg: 'bg-lnred/10 border-lnred/30', icon: Trash2 },
  modified: { label: 'Modified', color: 'text-lnamber', bg: 'bg-lnamber/10 border-lnamber/30', icon: Edit3 },
};

function fmtTs(ts: string) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function SyncPicker({
  label,
  syncs,
  value,
  onChange,
  disabledAfter,
  disabledBefore,
}: {
  label: string;
  syncs: string[];
  value: string;
  onChange: (v: string) => void;
  disabledAfter?: string;
  disabledBefore?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-lnfaint uppercase tracking-wider">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-lndark border border-lnborder rounded px-3 py-2 text-sm text-lntext focus:outline-none focus:border-lncyan2 min-w-[200px]"
      >
        {syncs.map(s => {
          const disabled =
            (disabledAfter ? s >= disabledAfter : false) ||
            (disabledBefore ? s <= disabledBefore : false);
          return (
            <option key={s} value={s} disabled={disabled}>
              {fmtTs(s)}
            </option>
          );
        })}
      </select>
    </div>
  );
}

function FieldDiffRow({ field, before, after }: { field: string; before: unknown; after: unknown }) {
  return (
    <div className="grid grid-cols-[180px_1fr_1fr] gap-2 py-2 border-b border-lncard last:border-0 items-start">
      <span className="text-xs font-mono text-lncyan2 truncate">{field}</span>
      <div className="flex items-start gap-1.5">
        <span className="text-xs font-mono bg-lnred/10 text-lnred px-2 py-0.5 rounded break-all leading-relaxed">
          {fmtVal(before)}
        </span>
      </div>
      <div className="flex items-start gap-1.5">
        <span className="text-xs font-mono bg-lngreen/10 text-lngreen px-2 py-0.5 rounded break-all leading-relaxed">
          {fmtVal(after)}
        </span>
      </div>
    </div>
  );
}

function ChangeCard({ change }: { change: DriftChange }) {
  const [expanded, setExpanded] = useState(false);
  const meta = CHANGE_META[change.change_type];
  const Icon = meta.icon;
  const TypeIcon = TYPE_ICONS[change.resource_type] || Box;
  const hasFields = change.field_changes.length > 0;

  return (
    <div className={`border rounded-lg overflow-hidden ${meta.bg}`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
        onClick={() => hasFields && setExpanded(v => !v)}
      >
        <div className="w-7 h-7 rounded bg-lndark/60 flex items-center justify-center flex-shrink-0">
          <TypeIcon className="w-3.5 h-3.5 text-lnmuted" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-lntext truncate">{change.label}</span>
            <span className="text-xs text-lnfaint">{TYPE_LABELS[change.resource_type] || change.resource_type}</span>
            {change.region && (
              <span className="text-xs text-lnfaint">{change.region}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className={`flex items-center gap-1 text-xs font-medium ${meta.color}`}>
              <Icon className="w-3 h-3" />
              {meta.label}
            </span>
            {hasFields && (
              <span className="text-xs text-lnfaint">
                {change.field_changes.length} field{change.field_changes.length !== 1 ? 's' : ''} changed
              </span>
            )}
          </div>
        </div>
        {hasFields && (
          expanded
            ? <ChevronDown className="w-4 h-4 text-lnfaint flex-shrink-0" />
            : <ChevronRight className="w-4 h-4 text-lnfaint flex-shrink-0" />
        )}
      </button>

      {expanded && hasFields && (
        <div className="px-4 pb-4">
          <div className="bg-lndark/70 rounded-lg p-3">
            <div className="grid grid-cols-[180px_1fr_1fr] gap-2 pb-2 mb-1 border-b border-lncard">
              <span className="text-xs font-semibold text-lnfaint uppercase tracking-wider">Field</span>
              <span className="text-xs font-semibold text-lnred uppercase tracking-wider">Before</span>
              <span className="text-xs font-semibold text-lngreen uppercase tracking-wider">After</span>
            </div>
            {change.field_changes.map((fc, i) => (
              <FieldDiffRow key={i} field={fc.field} before={fc.before} after={fc.after} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  accountId: string;
  onClose: () => void;
}

export default function DriftModal({ accountId, onClose }: Props) {
  const [result, setResult] = useState<DriftResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncA, setSyncA] = useState('');
  const [syncB, setSyncB] = useState('');
  const [filterType, setFilterType] = useState('');

  const load = useCallback((a?: string, b?: string) => {
    setLoading(true);
    setError(null);
    resourcesApi.getDrift(accountId, a, b)
      .then(data => {
        setResult(data);
        setSyncA(data.sync_a);
        setSyncB(data.sync_b);
      })
      .catch(e => setError(e.message || 'Failed to load drift data'))
      .finally(() => setLoading(false));
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSyncChange = (newA: string, newB: string) => {
    setSyncA(newA);
    setSyncB(newB);
    load(newA, newB);
  };

  const filtered = result
    ? (filterType ? result.changes.filter(c => c.resource_type === filterType) : result.changes)
    : [];

  const counts = result ? {
    added: result.changes.filter(c => c.change_type === 'added').length,
    removed: result.changes.filter(c => c.change_type === 'removed').length,
    modified: result.changes.filter(c => c.change_type === 'modified').length,
  } : null;

  const allTypes = result
    ? [...new Set(result.changes.map(c => c.resource_type))].sort()
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-lndark border border-lncard rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-lncard flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-lncyan2/10 flex items-center justify-center">
              <GitCompare className="w-5 h-5 text-lncyan2" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-lntext">Drift Detection</h2>
              <p className="text-xs text-lnfaint">Compare resource state between two syncs</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-lnfaint hover:text-lntext hover:bg-lncard transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-lncard bg-lndark/50 flex-shrink-0">
          {result && result.syncs.length >= 2 ? (
            <div className="flex flex-wrap items-end gap-4">
              <SyncPicker
                label="Baseline (older)"
                syncs={result.syncs}
                value={syncA}
                onChange={a => handleSyncChange(a, syncB)}
                disabledAfter={syncB}
              />
              <div className="flex items-end pb-2">
                <div className="text-lnfaint text-lg font-light">→</div>
              </div>
              <SyncPicker
                label="Target (newer)"
                syncs={result.syncs}
                value={syncB}
                onChange={b => handleSyncChange(syncA, b)}
                disabledBefore={syncA}
              />
              {allTypes.length > 1 && (
                <div className="flex flex-col gap-1.5 ml-auto">
                  <span className="text-xs font-semibold text-lnfaint uppercase tracking-wider">Filter Type</span>
                  <select
                    value={filterType}
                    onChange={e => setFilterType(e.target.value)}
                    className="bg-lndark border border-lnborder rounded px-3 py-2 text-sm text-lntext focus:outline-none focus:border-lncyan2"
                  >
                    <option value="">All Types</option>
                    {allTypes.map(t => (
                      <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ) : !loading && (
            <p className="text-sm text-lnfaint">Need at least 2 syncs to compare.</p>
          )}
        </div>

        {counts && !loading && (
          <div className="px-6 py-3 border-b border-lncard flex items-center gap-6 flex-shrink-0 bg-lndark/30">
            <div className="flex items-center gap-2">
              <Plus className="w-3.5 h-3.5 text-lngreen" />
              <span className="text-sm font-semibold text-lngreen">{counts.added}</span>
              <span className="text-xs text-lnfaint">Added</span>
            </div>
            <div className="flex items-center gap-2">
              <Trash2 className="w-3.5 h-3.5 text-lnred" />
              <span className="text-sm font-semibold text-lnred">{counts.removed}</span>
              <span className="text-xs text-lnfaint">Removed</span>
            </div>
            <div className="flex items-center gap-2">
              <Edit3 className="w-3.5 h-3.5 text-lnamber" />
              <span className="text-sm font-semibold text-lnamber">{counts.modified}</span>
              <span className="text-xs text-lnfaint">Modified</span>
            </div>
            <div className="ml-auto text-xs text-lnfaint">
              {result!.changes.length} total change{result!.changes.length !== 1 ? 's' : ''}
              {filterType && filtered.length !== result!.changes.length && ` · ${filtered.length} shown`}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {loading && (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-7 h-7 text-lncyan animate-spin" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 p-4 bg-lnred/10 border border-lnred/30 rounded-lg text-lnred">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {!loading && !error && result && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <GitCompare className="w-10 h-10 text-lnfaint mb-3 opacity-40" />
              <p className="text-lnmuted font-medium">No changes detected</p>
              <p className="text-lnfaint text-sm mt-1">
                {result.changes.length > 0
                  ? 'No changes match the current filter'
                  : 'Resources were identical between these two syncs'}
              </p>
            </div>
          )}

          {!loading && !error && filtered.length > 0 && (
            <div className="space-y-2">
              {(['added', 'removed', 'modified'] as const).map(ct => {
                const group = filtered.filter(c => c.change_type === ct);
                if (group.length === 0) return null;
                const meta = CHANGE_META[ct];
                return (
                  <div key={ct} className="space-y-1.5">
                    <div className="flex items-center gap-2 py-1">
                      <meta.icon className={`w-3.5 h-3.5 ${meta.color}`} />
                      <span className={`text-xs font-semibold uppercase tracking-wider ${meta.color}`}>
                        {meta.label} ({group.length})
                      </span>
                    </div>
                    {group.map((c, i) => (
                      <ChangeCard key={`${c.resource_id}-${c.resource_type}-${i}`} change={c} />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
