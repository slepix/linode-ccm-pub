import React, { useEffect, useRef, useState } from 'react';
import { Server, HardDrive, Database, Cloud, Shield, Network, Box, Loader2, ChevronDown, ChevronRight, Download, Clock, Globe } from 'lucide-react';
import { LinodeAccount } from '../api/accounts';
import { resourcesApi, Resource } from '../api/resources';
import { complianceApi } from '../api/compliance';
import ResourceSpecsView from '../components/ResourceSpecsView';
import ResourceTimelineModal from '../components/ResourceTimelineModal';
import { exportResourcePdf } from '../utils/exportResourcePdf';
import { exportResourceCsv, exportResourceXls, ComplianceResultWithNotes } from '../utils/exportResourceCsv';

const TYPE_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  linode:         { icon: Server,   color: 'bg-ln-icon-blue text-lnblue',       label: 'Linodes' },
  volume:         { icon: HardDrive,color: 'bg-ln-icon-amber text-lnamber',     label: 'Volumes' },
  database:       { icon: Database, color: 'bg-ln-icon-green text-lngreen',     label: 'Databases' },
  object_storage: { icon: Cloud,    color: 'bg-ln-icon-cyan text-lncyan',       label: 'Object Storage' },
  firewall:       { icon: Shield,   color: 'bg-ln-icon-red text-lnred',         label: 'Firewalls' },
  vpc:            { icon: Network,  color: 'bg-ln-icon-sky text-lnblue2',       label: 'VPCs' },
  lke_cluster:    { icon: Box,      color: 'bg-ln-icon-orange text-lnamber',    label: 'LKE Clusters' },
  nodebalancer:   { icon: Network,  color: 'bg-ln-icon-teal text-lncyan',       label: 'NodeBalancers' },
  domain:         { icon: Globe,    color: 'bg-ln-icon-green text-lngreen',     label: 'Domains' },
};

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-lngreen/10 text-lngreen',
  offline: 'bg-lnborder text-lnmuted',
  active:  'bg-lngreen/10 text-lngreen',
  ready:   'bg-lngreen/10 text-lngreen',
  enabled: 'bg-ln-icon-blue text-lnblue',
};

interface Props {
  account: LinodeAccount | null;
}

function ExportDropdown({ resource, accountId }: { resource: Resource; accountId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const fetchResults = async (): Promise<ComplianceResultWithNotes[]> => {
    const raw = await complianceApi.getResults({ account_id: accountId, resource_type: resource.resource_type })
      .then(all => all.filter(r => r.resource_id === resource.id));
    return Promise.all(
      raw.map(async r => {
        try {
          const notes = await complianceApi.getNotes(r.id);
          return { ...r, notes };
        } catch {
          return { ...r, notes: [] };
        }
      })
    );
  };

  const handleFormat = async (e: React.MouseEvent, format: 'pdf' | 'csv' | 'xls') => {
    e.stopPropagation();
    setOpen(false);
    setLoading(true);
    try {
      if (format === 'pdf') {
        await exportResourcePdf(
          resource,
          accountId,
          async (resourceId, accId) => complianceApi.getResults({ account_id: accId, resource_type: resource.resource_type })
            .then(all => all.filter(r => r.resource_id === resourceId)),
          (resultId) => complianceApi.getNotes(resultId),
        );
      } else {
        const results = await fetchResults();
        if (format === 'csv') exportResourceCsv(resource, results);
        else exportResourceXls(resource, results);
      }
    } finally {
      setLoading(false);
    }
  };

  const formats: { label: string; ext: string; format: 'pdf' | 'csv' | 'xls' }[] = [
    { label: 'PDF', ext: 'pdf', format: 'pdf' },
    { label: 'CSV', ext: 'csv', format: 'csv' },
    { label: 'XLS', ext: 'xls', format: 'xls' },
  ];

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        disabled={loading}
        className="flex items-center gap-1.5 text-xs font-medium text-lnmuted hover:text-lntext border border-lnborder hover:border-lnborder2 bg-lncard hover:bg-lnborder transition-all px-3 py-1.5 rounded disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Download className="w-3.5 h-3.5" />
        }
        {loading ? 'Preparing…' : 'Export'}
        {!loading && <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 bg-lndark border border-lncard rounded shadow-xl z-50 overflow-hidden">
          {formats.map(f => (
            <button
              key={f.ext}
              onClick={e => handleFormat(e, f.format)}
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

export default function ResourcesPage({ account }: Props) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterRegion, setFilterRegion] = useState('');
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [expandedResource, setExpandedResource] = useState<string | null>(null);
  const [timelineResource, setTimelineResource] = useState<Resource | null>(null);
  useEffect(() => {
    if (!account) return;
    setLoading(true);
    resourcesApi.list(account.id, undefined, filterRegion || undefined)
      .then(data => {
        setResources(data);
        const types = [...new Set(data.map(r => r.resource_type))];
        setExpandedTypes(new Set(types));
      })
      .finally(() => setLoading(false));
  }, [account, filterRegion]);

  if (!account) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-lnfaint">Select an account to view resources.</p>
      </div>
    );
  }

  const regions = [...new Set(resources.map(r => r.region).filter(Boolean))].sort() as string[];

  const filtered = filterRegion
    ? resources.filter(r => r.region === filterRegion)
    : resources;

  const grouped = filtered.reduce<Record<string, Resource[]>>((acc, r) => {
    (acc[r.resource_type] = acc[r.resource_type] || []).push(r);
    return acc;
  }, {});

  const sortedTypes = Object.keys(grouped).sort();

  const toggleType = (type: string) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  };

  return (
    <>
    <div className="flex-1 p-8 overflow-auto">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-lntext">Resources</h1>
            <p className="text-lnmuted text-sm mt-1">
              {account.name} · {filtered.length} resource{filtered.length !== 1 ? 's' : ''} across {sortedTypes.length} type{sortedTypes.length !== 1 ? 's' : ''}
            </p>
          </div>
          <select
            value={filterRegion}
            onChange={e => setFilterRegion(e.target.value)}
            className="bg-lndark border border-lnborder rounded px-3 py-2 text-sm text-lntext focus:outline-none focus:border-lncyan2"
          >
            <option value="">All Regions</option>
            {regions.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 text-lncyan animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-lndark rounded border border-lncard p-12 text-center">
            <p className="text-lnmuted">No resources found. Run a sync to discover infrastructure.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedTypes.map(type => {
              const meta = TYPE_META[type] || { icon: Box, color: 'bg-lncard text-lnmuted', label: type.replace(/_/g, ' ') };
              const Icon = meta.icon;
              const items = grouped[type];
              const isOpen = expandedTypes.has(type);

              return (
                <div key={type} className="bg-lndark rounded border border-lncard overflow-hidden">
                  <button
                    className="w-full flex items-center gap-3 px-5 py-4 hover:bg-lncard/50 transition text-left"
                    onClick={() => toggleType(type)}
                  >
                    <div className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0 ${meta.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-lntext font-semibold flex-1">{meta.label}</span>
                    <span className="text-xs text-lnfaint mr-2">{items.length} resource{items.length !== 1 ? 's' : ''}</span>
                    {isOpen
                      ? <ChevronDown className="w-4 h-4 text-lnfaint" />
                      : <ChevronRight className="w-4 h-4 text-lnfaint" />
                    }
                  </button>

                  {isOpen && (
                    <div className="border-t border-lncard">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-lncard">
                            <th className="text-left px-5 py-2.5 text-xs font-semibold text-lnfaint uppercase tracking-wider">Name</th>
                            <th className="text-left px-5 py-2.5 text-xs font-semibold text-lnfaint uppercase tracking-wider">Region</th>
                            <th className="text-left px-5 py-2.5 text-xs font-semibold text-lnfaint uppercase tracking-wider">Status</th>
                            <th className="text-left px-5 py-2.5 text-xs font-semibold text-lnfaint uppercase tracking-wider">Synced</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map(r => (
                            <React.Fragment key={r.id}>
                              <tr
                                className="border-b border-lncard last:border-0 hover:bg-lncard/40 cursor-pointer transition"
                                onClick={() => setExpandedResource(expandedResource === r.id ? null : r.id)}
                              >
                                <td className="px-5 py-3 text-sm text-lntext font-medium">{r.label}</td>
                                <td className="px-5 py-3 text-xs text-lnmuted">{r.region || '—'}</td>
                                <td className="px-5 py-3">
                                  {r.status && (
                                    <span className={`text-xs px-2 py-0.5 rounded capitalize ${STATUS_COLORS[r.status] || 'bg-lncard text-lnmuted'}`}>
                                      {r.status}
                                    </span>
                                  )}
                                </td>
                                <td className="px-5 py-3 text-xs text-lnfaint">
                                  {r.last_synced_at ? new Date(r.last_synced_at).toLocaleString() : '—'}
                                </td>
                              </tr>
                              {expandedResource === r.id && (
                                <tr className="border-b border-lncard">
                                  <td colSpan={4} className="px-5 pb-5 pt-3">
                                    <div className="flex items-center justify-between mb-3">
                                      <span />
                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={e => { e.stopPropagation(); setTimelineResource(r); }}
                                          className="flex items-center gap-1.5 text-xs font-medium text-lnmuted hover:text-lntext border border-lnborder hover:border-lnborder2 bg-lncard hover:bg-lnborder transition-all px-3 py-1.5 rounded"
                                        >
                                          <Clock className="w-3.5 h-3.5" />
                                          Timeline
                                        </button>
                                        <ExportDropdown resource={r} accountId={account.id} />
                                      </div>
                                    </div>
                                    <ResourceSpecsView resource={r} />
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>

    {timelineResource && account && (
      <ResourceTimelineModal
        resource={timelineResource}
        accountId={account.id}
        onClose={() => setTimelineResource(null)}
      />
    )}
    </>
  );
}
