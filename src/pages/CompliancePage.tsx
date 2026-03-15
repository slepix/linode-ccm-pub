import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Search, RefreshCw, CheckCircle, XCircle, MinusCircle,
  ChevronDown, ChevronUp, MessageSquare, Check, X, Loader2,
  AlertTriangle, User, Globe, CheckSquare, Square, ShieldCheck,
} from 'lucide-react';
import { LinodeAccount } from '../api/accounts';
import { complianceApi, ComplianceResult, ComplianceScore } from '../api/compliance';
import { streamRefresh, SyncEvent } from '../api/refresh';
import SyncProgressPanel, { Phase, SyncSummary } from '../components/SyncProgressPanel';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';

const SEV_COLORS: Record<string, string> = {
  critical: 'text-lnred bg-lnred/10 border-lnred/40',
  warning: 'text-lnamber bg-lnamber/10 border-lnamber/40',
  info: 'text-lncyan2 bg-lncyan2/10 border-lncyan2/40',
};


interface Props {
  account: LinodeAccount | null;
}

interface RuleGroup {
  ruleId: string;
  ruleName: string;
  severity: string;
  description?: string;
  results: ComplianceResult[];
  nonCompliantCount: number;
  compliantCount: number;
  notApplicableCount: number;
  acknowledgedCount: number;
}

function buildRuleGroups(results: ComplianceResult[]): RuleGroup[] {
  const map = new Map<string, RuleGroup>();

  for (const r of results) {
    const key = r.rule_id || r.rule?.name || 'unknown';
    if (!map.has(key)) {
      map.set(key, {
        ruleId: key,
        ruleName: r.rule?.name || 'Unknown Rule',
        severity: r.rule?.severity || 'info',
        description: r.rule?.description,
        results: [],
        nonCompliantCount: 0,
        compliantCount: 0,
        notApplicableCount: 0,
        acknowledgedCount: 0,
      });
    }
    const g = map.get(key)!;
    g.results.push(r);
    if (r.status === 'non_compliant') g.nonCompliantCount++;
    if (r.status === 'compliant') g.compliantCount++;
    if (r.status === 'not_applicable') g.notApplicableCount++;
    if (r.acknowledged) g.acknowledgedCount++;
  }

  return Array.from(map.values()).sort((a, b) => {
    const sevOrder = { critical: 0, warning: 1, info: 2 };
    const sd = (sevOrder[a.severity as keyof typeof sevOrder] ?? 3) - (sevOrder[b.severity as keyof typeof sevOrder] ?? 3);
    if (sd !== 0) return sd;
    return b.nonCompliantCount - a.nonCompliantCount;
  });
}

function DetailRenderer({ result }: { result: ComplianceResult }) {
  const ct = result.rule?.condition_type;
  const detail = result.detail!;

  if (ct === 'login_allowed_ips') {
    const prefix = 'Login from non-allowed IP: ';
    const items = detail.startsWith(prefix)
      ? detail.slice(prefix.length).split('; ').map(v => {
          const idx = v.lastIndexOf(' from ');
          return idx !== -1 ? { username: v.slice(0, idx), ip: v.slice(idx + 6) } : { username: 'unknown', ip: v };
        })
      : [];
    if (items.length) return (
      <div className="bg-lncard rounded overflow-hidden">
        <div className="px-3 py-2 border-b border-lnborder text-xs text-lnfaint font-medium uppercase tracking-wide flex items-center gap-2">
          <AlertTriangle className="w-3 h-3 text-lnred" />
          {items.length} login{items.length !== 1 ? 's' : ''} from non-allowed IP{items.length !== 1 ? 's' : ''}
        </div>
        <div className="divide-y divide-lnborder/50">
          {items.map((v, i) => (
            <div key={i} className="flex items-center gap-4 px-3 py-2">
              <div className="flex items-center gap-1.5 text-sm text-lntext min-w-0">
                <User className="w-3.5 h-3.5 text-lnfaint shrink-0" />
                <span className="font-medium truncate">{v.username}</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-lnred ml-auto shrink-0">
                <Globe className="w-3.5 h-3.5" />
                <span className="font-mono">{v.ip}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (ct === 'tfa_users') {
    const users = detail.split('; ').map(s => s.replace(/^User '/, '').replace(/' does not have TFA enabled\.$/, '').trim()).filter(Boolean);
    if (users.length) return (
      <div className="bg-lncard rounded overflow-hidden">
        <div className="px-3 py-2 border-b border-lnborder text-xs text-lnfaint font-medium uppercase tracking-wide flex items-center gap-2">
          <AlertTriangle className="w-3 h-3 text-lnred" />
          {users.length} user{users.length !== 1 ? 's' : ''} without TFA enabled
        </div>
        <div className="divide-y divide-lnborder/50">
          {users.map((u, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2">
              <User className="w-3.5 h-3.5 text-lnfaint shrink-0" />
              <span className="text-sm text-lntext font-medium">{u}</span>
              <span className="ml-auto text-xs text-lnred">TFA disabled</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (ct === 'inactive_users') {
    const entries = detail.split('; ').map(s => s.trim()).filter(Boolean);
    const parsed = entries.map(s => {
      const noLogin = s.match(/^'(.+)' has no recorded logins\.$/);
      if (noLogin) return { username: noLogin[1], info: 'No recorded logins', days: null as number | null };
      const daysMatch = s.match(/^'(.+)' last logged in (\d+) days ago/);
      if (daysMatch) return { username: daysMatch[1], info: `Last login ${daysMatch[2]} days ago`, days: parseInt(daysMatch[2]) };
      return { username: s, info: s, days: null };
    });
    if (parsed.length) return (
      <div className="bg-lncard rounded overflow-hidden">
        <div className="px-3 py-2 border-b border-lnborder text-xs text-lnfaint font-medium uppercase tracking-wide flex items-center gap-2">
          <AlertTriangle className="w-3 h-3 text-lnamber" />
          {parsed.length} inactive user{parsed.length !== 1 ? 's' : ''}
        </div>
        <div className="divide-y divide-lnborder/50">
          {parsed.map((u, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2">
              <User className="w-3.5 h-3.5 text-lnfaint shrink-0" />
              <span className="text-sm text-lntext font-medium">{u.username}</span>
              <span className="ml-auto text-xs text-lnamber">{u.info}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (ct === 'user_restricted_access') {
    const prefix = 'Users with unrestricted account access: ';
    const userList = detail.startsWith(prefix)
      ? detail.slice(prefix.length).replace(/\.$/, '').split(', ').map(u => u.trim()).filter(Boolean)
      : [];
    if (userList.length) return (
      <div className="bg-lncard rounded overflow-hidden">
        <div className="px-3 py-2 border-b border-lnborder text-xs text-lnfaint font-medium uppercase tracking-wide flex items-center gap-2">
          <AlertTriangle className="w-3 h-3 text-lnamber" />
          {userList.length} user{userList.length !== 1 ? 's' : ''} with unrestricted access
        </div>
        <div className="divide-y divide-lnborder/50">
          {userList.map((u, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2">
              <User className="w-3.5 h-3.5 text-lnfaint shrink-0" />
              <span className="text-sm text-lntext font-medium">{u}</span>
              <span className="ml-auto text-xs text-lnamber">Unrestricted</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const MULTI_RULE_TYPES = new Set([
    'no_open_inbound', 'firewall_all_ports_allowed', 'firewall_rule_descriptions',
    'firewall_rfc1918_lateral', 'firewall_no_duplicate_rules', 'firewall_outbound_dangerous_ports',
    'firewall_cidr_too_broad',
  ]);
  if (ct && MULTI_RULE_TYPES.has(ct)) {
    const lines = detail.split('; ').map(s => s.trim()).filter(Boolean);
    if (lines.length > 1) return (
      <div className="bg-lncard rounded overflow-hidden">
        <div className="px-3 py-2 border-b border-lnborder text-xs text-lnfaint font-medium uppercase tracking-wide flex items-center gap-2">
          <AlertTriangle className="w-3 h-3 text-lnred" />
          {lines.length} violation{lines.length !== 1 ? 's' : ''}
        </div>
        <div className="divide-y divide-lnborder/50">
          {lines.map((line, i) => (
            <div key={i} className="flex items-start gap-2 px-3 py-2">
              <XCircle className="w-3.5 h-3.5 text-lnred shrink-0 mt-0.5" />
              <span className="text-sm text-lnmuted">{line}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-lncard rounded p-3 text-sm text-lnmuted">
      {detail}
    </div>
  );
}

interface ResourceRowProps {
  result: ComplianceResult;
  onUpdated: () => void;
  selectable: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  isAuditor: boolean;
}

function ResourceRow({ result, onUpdated, selectable, selected, onToggleSelect, isAuditor }: ResourceRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [resolveMode, setResolveMode] = useState(false);
  const [resolveNote, setResolveNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState<Array<{ id: string; note: string; created_at: string; author_name?: string }>>([]);
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  const isResolved = result.status === 'non_compliant' && result.acknowledged;

  const StatusIcon =
    isResolved ? ShieldCheck :
    result.status === 'compliant' ? CheckCircle :
    result.status === 'non_compliant' ? XCircle : MinusCircle;

  const statusColor =
    isResolved ? 'text-lngreen' :
    result.status === 'compliant' ? 'text-lngreen' :
    result.status === 'non_compliant' ? 'text-lnred' : 'text-lnfaint';

  const handleResolve = async () => {
    if (!resolveNote.trim()) return;
    setLoading(true);
    try {
      await complianceApi.acknowledge(result.id, true, resolveNote.trim());
      setResolveMode(false);
      setResolveNote('');
      onUpdated();
    } finally {
      setLoading(false);
    }
  };

  const handleUnresolve = async () => {
    setLoading(true);
    try {
      await complianceApi.acknowledge(result.id, false);
      onUpdated();
    } finally {
      setLoading(false);
    }
  };

  const loadNotes = async () => {
    const n = await complianceApi.getNotes(result.id);
    setNotes(n);
  };

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectable) return;
    const next = !expanded;
    setExpanded(next);
    if (next) loadNotes();
  };

  const handleRowClick = (e: React.MouseEvent) => {
    if (selectable && result.status === 'non_compliant' && !result.acknowledged) {
      e.stopPropagation();
      onToggleSelect(result.id);
      return;
    }
    handleExpand(e);
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelect(result.id);
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      await complianceApi.addNote(result.id, noteText);
      setNoteText('');
      await loadNotes();
    } finally {
      setAddingNote(false);
    }
  };

  const resourceLabel = (() => {
    if (result.resource) {
      return `${result.resource.label} · ${result.resource.resource_type?.replace(/_/g, ' ')}${result.resource.region ? ` · ${result.resource.region}` : ''}`;
    }
    const ct = result.rule?.condition_type;
    const detail = result.detail;
    if (!detail || result.status !== 'non_compliant') return 'Account-level check';
    if (ct === 'tfa_users') {
      const users = detail.split('; ').map(s => s.replace(/^User '/, '').replace(/' does not have TFA enabled\.$/, '').trim()).filter(Boolean);
      return users.length > 0 ? `${users.slice(0, 3).join(', ')}${users.length > 3 ? ` +${users.length - 3} more` : ''}` : 'Account-level check';
    }
    if (ct === 'login_allowed_ips') {
      const prefix = 'Login from non-allowed IP: ';
      if (detail.startsWith(prefix)) {
        const entries = detail.slice(prefix.length).split('; ');
        const users = [...new Set(entries.map(v => { const idx = v.lastIndexOf(' from '); return idx !== -1 ? v.slice(0, idx) : v; }))];
        return users.length > 0 ? `${users.slice(0, 3).join(', ')}${users.length > 3 ? ` +${users.length - 3} more` : ''}` : 'Account-level check';
      }
    }
    if (ct === 'inactive_users') {
      const entries = detail.split('; ').map(s => { const m = s.match(/^'(.+)'/); return m ? m[1] : ''; }).filter(Boolean);
      return entries.length > 0 ? `${entries.slice(0, 3).join(', ')}${entries.length > 3 ? ` +${entries.length - 3} more` : ''}` : 'Account-level check';
    }
    if (ct === 'user_restricted_access') {
      const prefix = 'Users with unrestricted account access: ';
      if (detail.startsWith(prefix)) {
        const users = detail.slice(prefix.length).replace(/\.$/, '').split(', ').map(u => u.trim()).filter(Boolean);
        return users.length > 0 ? `${users.slice(0, 3).join(', ')}${users.length > 3 ? ` +${users.length - 3} more` : ''}` : 'Account-level check';
      }
    }
    return 'Account-level check';
  })();

  const isSelectableItem = selectable && result.status === 'non_compliant' && !result.acknowledged;

  return (
    <div className={`border-b border-lncard/60 last:border-0 ${isResolved ? 'opacity-70' : ''} ${selected ? 'bg-lncyan2/5' : ''}`}>
      <div
        className={`flex items-center gap-3 px-4 py-2.5 transition pl-4 ${isSelectableItem ? 'cursor-pointer hover:bg-lncyan2/5' : 'hover:bg-lncard/40 cursor-pointer'}`}
        onClick={handleRowClick}
      >
        <div className="w-6 flex items-center justify-center shrink-0">
          {isSelectableItem ? (
            <div onClick={handleCheckboxClick} className="cursor-pointer">
              {selected
                ? <CheckSquare className="w-4 h-4 text-lncyan2" />
                : <Square className="w-4 h-4 text-lnfaint hover:text-lncyan2 transition" />
              }
            </div>
          ) : (
            <StatusIcon className={`w-3.5 h-3.5 shrink-0 ${statusColor}`} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <span className="text-sm text-lnmuted">{resourceLabel}</span>
          {isResolved && (
            <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-lngreen/10 text-lngreen border border-lngreen/30">
              resolved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded ${
            isResolved ? 'text-lngreen bg-lngreen/10' :
            result.status === 'compliant' ? 'text-lngreen bg-lngreen/10' :
            result.status === 'non_compliant' ? 'text-lnred bg-lnred/10' :
            'text-lnmuted bg-lncard'
          }`}>
            {isResolved ? 'resolved' : result.status.replace(/_/g, ' ')}
          </span>
          {!selectable && (
            expanded ? <ChevronUp className="w-3.5 h-3.5 text-lnfaint" /> : <ChevronDown className="w-3.5 h-3.5 text-lnfaint" />
          )}
        </div>
      </div>

      {expanded && !selectable && (
        <div className="pl-10 pr-4 pb-4 space-y-3" onClick={e => e.stopPropagation()}>
          {result.detail && <DetailRenderer result={result} />}

          {!isAuditor && (
            <div className="flex items-center gap-2">
              {result.status === 'non_compliant' && !result.acknowledged && !resolveMode && (
                <button
                  onClick={() => setResolveMode(true)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-lngreen/10 border border-lngreen/30 text-lngreen hover:bg-lngreen/20 transition"
                >
                  <ShieldCheck className="w-3 h-3" />
                  Mark As Resolved
                </button>
              )}
              {isResolved && (
                <button
                  onClick={handleUnresolve}
                  disabled={loading}
                  className="text-xs px-3 py-1.5 rounded bg-lnborder text-lnmuted hover:bg-lnborder2 transition disabled:opacity-50"
                >
                  Reopen
                </button>
              )}
            </div>
          )}

          {!isAuditor && resolveMode && (
            <div className="bg-lncard rounded-lg border border-lngreen/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-lngreen shrink-0" />
                <div>
                  <div className="text-sm font-medium text-lntext">Mark As Resolved</div>
                  <div className="text-xs text-lnfaint">A note explaining the resolution is required.</div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-lnmuted uppercase tracking-wider mb-1.5">
                  Resolution Note <span className="text-lnred">*</span>
                </label>
                <textarea
                  value={resolveNote}
                  onChange={e => setResolveNote(e.target.value)}
                  rows={3}
                  autoFocus
                  className="w-full bg-lnborder border border-lnborder2 rounded px-3 py-2 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lngreen resize-none"
                  placeholder="Describe how this finding was resolved or why it is acceptable..."
                />
                {resolveNote.trim() === '' && (
                  <p className="mt-1 text-xs text-lnfaint">A note is required to mark a finding as resolved.</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleResolve}
                  disabled={loading || !resolveNote.trim()}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-lngreen hover:bg-lngreen/80 disabled:opacity-40 disabled:cursor-not-allowed text-white transition"
                >
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                  Confirm Resolution
                </button>
                <button
                  onClick={() => { setResolveMode(false); setResolveNote(''); }}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-lnborder text-lnmuted hover:bg-lnborder2 transition"
                >
                  <X className="w-3 h-3" /> Cancel
                </button>
              </div>
            </div>
          )}

          {isResolved && (
            <div className="bg-lngreen/5 rounded p-2.5 text-xs border border-lngreen/20 space-y-0.5">
              <div className="flex items-center gap-1.5 text-lngreen">
                <ShieldCheck className="w-3 h-3 shrink-0" />
                <span>
                  Resolved by <span className="text-lntext font-medium">{result.acknowledged_by_name || 'Unknown'}</span>
                  {result.acknowledged_at && (
                    <span className="text-lnfaint"> · {new Date(result.acknowledged_at).toLocaleString()}</span>
                  )}
                </span>
              </div>
              {result.acknowledged_note && (
                <div className="text-lnmuted italic pl-4 mt-1">{result.acknowledged_note}</div>
              )}
            </div>
          )}

          <div>
            <div className="flex items-center gap-1.5 text-xs text-lnmuted mb-2">
              <MessageSquare className="w-3 h-3" />
              Notes
            </div>
            {notes.map(n => (
              <div key={n.id} className="bg-lncard rounded p-2 mb-1.5 text-xs">
                <div className="text-lnmuted">{n.note}</div>
                <div className="text-lnfaint mt-1">
                  {n.author_name || 'User'} · {new Date(n.created_at).toLocaleString()}
                </div>
              </div>
            ))}
            {!isAuditor && (
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                placeholder="Add a note..."
                className="flex-1 bg-lncard border border-lnborder rounded px-2 py-1.5 text-xs text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2"
              />
              <button
                onClick={handleAddNote}
                disabled={addingNote || !noteText.trim()}
                className="text-xs px-3 py-1.5 bg-lncyan2 hover:bg-lncyan disabled:opacity-50 text-lntext rounded transition"
              >
                Add
              </button>
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface BulkAckBarProps {
  selectedIds: string[];
  onConfirm: (note: string) => Promise<void>;
  onCancel: () => void;
}

function BulkAckBar({ selectedIds, onConfirm, onCancel }: BulkAckBarProps) {
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!note.trim()) return;
    setLoading(true);
    try {
      await onConfirm(note.trim());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-t border-lngreen/20 bg-lngreen/5 px-4 py-3 space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-lngreen" />
          <span className="text-sm font-medium text-lntext">
            Mark {selectedIds.length} item{selectedIds.length !== 1 ? 's' : ''} as resolved
          </span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={handleConfirm}
            disabled={loading || !note.trim()}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-lngreen hover:bg-lngreen/80 text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
            Confirm Resolution
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-lnborder text-lnmuted hover:bg-lnborder2 transition"
          >
            <X className="w-3 h-3" /> Cancel
          </button>
        </div>
      </div>
      <div>
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleConfirm()}
          placeholder="Resolution note (required)..."
          className="w-full bg-lncard border border-lnborder rounded px-3 py-1.5 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lngreen"
          autoFocus
        />
        {note.trim() === '' && (
          <p className="mt-1 text-xs text-lnfaint">A note is required to mark findings as resolved.</p>
        )}
      </div>
    </div>
  );
}

function RuleGroupRow({ group, onUpdated, isAuditor }: { group: RuleGroup; onUpdated: () => void; isAuditor: boolean }) {
  const [open, setOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const allCompliant = group.nonCompliantCount === 0 && group.compliantCount > 0;
  const hasIssues = group.nonCompliantCount > 0;
  const allAcknowledged = hasIssues && group.acknowledgedCount >= group.nonCompliantCount;

  const selectableResults = group.results.filter(r => r.status === 'non_compliant' && !r.acknowledged);

  const allSelected = selectableResults.length > 0 && selectableResults.every(r => selectedIds.has(r.id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  const handleToggleSelectMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectMode) {
      setSelectMode(false);
      setSelectedIds(new Set());
    } else {
      setSelectMode(true);
      setOpen(true);
    }
  };

  const handleToggleItem = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableResults.map(r => r.id)));
    }
  };

  const handleBulkAck = async (note: string) => {
    await complianceApi.bulkAcknowledge(Array.from(selectedIds), true, note || undefined);
    setSelectMode(false);
    setSelectedIds(new Set());
    onUpdated();
  };

  const handleCancelSelect = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const rowBg = hasIssues && !allAcknowledged
    ? 'bg-red-500/5 border-red-500/20'
    : allCompliant
    ? 'bg-green-500/5 border-green-500/20'
    : 'border-lncard';

  return (
    <div className={`border-b last:border-0 ${rowBg}`}>
      <button
        onClick={() => !selectMode && setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-black/5 transition text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-lntext">{group.ruleName}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded border ${SEV_COLORS[group.severity]}`}>
              {group.severity}
            </span>
          </div>
          {group.description && (
            <p className="text-xs text-lnfaint mt-0.5 truncate">{group.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {hasIssues && (
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${allAcknowledged ? 'text-lnamber bg-ln-icon-amber' : 'text-lnred bg-ln-icon-red'}`}>
              {group.nonCompliantCount} failing
            </span>
          )}
          {allCompliant && (
            <span className="text-xs px-2 py-0.5 rounded text-lngreen bg-lngreen/10 font-medium">
              all passing
            </span>
          )}
          {!hasIssues && !allCompliant && group.notApplicableCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded text-lnmuted bg-lncard">
              n/a
            </span>
          )}
          <span className="text-xs text-lnfaint">{group.results.length} resource{group.results.length !== 1 ? 's' : ''}</span>
          {!isAuditor && selectableResults.length > 0 && (
            <div
              onClick={handleToggleSelectMode}
              className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border transition cursor-pointer ${
                selectMode
                  ? 'border-lngreen/60 text-lngreen bg-lngreen/10'
                  : 'border-lnborder text-lnfaint hover:text-lnmuted hover:border-lnborder2'
              }`}
            >
              <ShieldCheck className="w-3 h-3" />
              {selectMode ? 'Cancel' : 'Resolve'}
            </div>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-lnfaint" /> : <ChevronDown className="w-4 h-4 text-lnfaint" />}
        </div>
      </button>

      {open && (
        <div className="bg-lndark/50">
          {selectMode && selectableResults.length > 1 && (
            <div className="flex items-center gap-3 px-4 py-2 border-b border-lncard/60 bg-lncard/20">
              <div
                onClick={handleToggleAll}
                className="flex items-center gap-2 cursor-pointer text-xs text-lnmuted hover:text-lntext transition"
              >
                {allSelected
                  ? <CheckSquare className="w-4 h-4 text-lncyan2" />
                  : someSelected
                    ? <CheckSquare className="w-4 h-4 text-lnfaint" />
                    : <Square className="w-4 h-4 text-lnfaint" />
                }
                <span>{allSelected ? 'Deselect all' : `Select all ${selectableResults.length}`}</span>
              </div>
              {selectedIds.size > 0 && (
                <span className="text-xs text-lncyan2 ml-auto">{selectedIds.size} selected</span>
              )}
            </div>
          )}
          {group.results.map(r => (
            <ResourceRow
              key={r.id}
              result={r}
              onUpdated={onUpdated}
              selectable={selectMode}
              selected={selectedIds.has(r.id)}
              onToggleSelect={handleToggleItem}
              isAuditor={isAuditor}
            />
          ))}
          {selectMode && selectedIds.size > 0 && (
            <BulkAckBar
              selectedIds={Array.from(selectedIds)}
              onConfirm={handleBulkAck}
              onCancel={handleCancelSelect}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function CompliancePage({ account }: Props) {
  const [results, setResults] = useState<ComplianceResult[]>([]);
  const [score, setScore] = useState<ComplianceScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const { user } = useAuth();
  const isAuditor = user?.role === 'auditor';
  const { notifyComplianceUpdated } = useSync();

  const [syncPhase, setSyncPhase] = useState<Phase>('idle');
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [syncSummary, setSyncSummary] = useState<SyncSummary>({});
  const [showProgress, setShowProgress] = useState(false);
  const stopStreamRef = useRef<(() => void) | null>(null);

  const syncing = showProgress && syncPhase !== 'done' && syncPhase !== 'error';

  const load = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    try {
      const [r, s] = await Promise.all([
        complianceApi.getResults({
          account_id: account.id,
          status: filterStatus || undefined,
          severity: filterSeverity || undefined,
          search: search || undefined,
        }),
        complianceApi.getScore(account.id).catch(() => null),
      ]);
      setResults(r);
      setScore(s as ComplianceScore | null);
    } finally {
      setLoading(false);
    }
  }, [account, filterStatus, filterSeverity, search]);

  useEffect(() => { load(); }, [load]);

  const loadAndNotify = useCallback(async () => {
    await load();
    notifyComplianceUpdated();
  }, [load, notifyComplianceUpdated]);

  const handleSync = () => {
    if (!account || syncing) return;
    setSyncPhase('evaluate');
    setSyncLogs([]);
    setSyncSummary({});
    setShowProgress(true);

    const stop = streamRefresh(
      { account_id: account.id, skip_sync: true },
      (event: SyncEvent) => {
        if (event.type === 'phase') {
          setSyncPhase('evaluate');
        } else if (event.type === 'log') {
          setSyncLogs(prev => [...prev, event.message]);
        } else if (event.type === 'eval_done') {
          setSyncSummary(prev => ({
            ...prev,
            evaluated: event.result.evaluated,
            compliant: event.result.compliant,
            nonCompliant: event.result.non_compliant,
            score: event.result.score,
          }));
        } else if (event.type === 'done') {
          setSyncPhase('done');
          loadAndNotify();
        } else if (event.type === 'error') {
          setSyncPhase('error');
          setSyncLogs(prev => [...prev, `ERROR: ${event.message}`]);
        }
      },
      () => {
        setSyncPhase(prev => (prev !== 'done' && prev !== 'error' ? 'error' : prev));
      },
    );
    stopStreamRef.current = stop;
  };

  const handleDismissProgress = () => {
    setShowProgress(false);
    setSyncPhase('idle');
    setSyncLogs([]);
    setSyncSummary({});
  };

  if (!account) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-lnfaint">Select an account to view compliance results.</p>
      </div>
    );
  }

  const ruleGroups = buildRuleGroups(results);
  const failingGroups = ruleGroups.filter(g => g.nonCompliantCount > 0);
  const passingGroups = ruleGroups.filter(g => g.nonCompliantCount === 0 && g.compliantCount > 0);
  const naGroups = ruleGroups.filter(g => g.nonCompliantCount === 0 && g.compliantCount === 0);

  return (
    <div className="flex-1 p-8 overflow-auto">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-lntext">Compliance Results</h1>
            <p className="text-lnmuted text-sm mt-1">{account.name}</p>
          </div>
          {!isAuditor && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 bg-lncyan2 hover:bg-lncyan disabled:opacity-50 disabled:cursor-not-allowed text-lntext px-4 py-2 rounded text-sm font-medium transition"
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {syncing ? 'Evaluating…' : 'Re-evaluate'}
            </button>
          )}
        </div>

        {showProgress && (
          <div className="mb-6">
            <SyncProgressPanel
              phase={syncPhase}
              logs={syncLogs}
              summary={syncSummary}
              onDismiss={handleDismissProgress}
              skipSync
            />
          </div>
        )}

        {(score || results.length > 0) && (() => {
          const resolvedCount = results.filter(r => r.status === 'non_compliant' && r.acknowledged).length;
          const compliantCount = results.filter(r => r.status === 'compliant').length;
          const openNonCompliantCount = results.filter(r => r.status === 'non_compliant' && !r.acknowledged).length;
          const scoreable = compliantCount + openNonCompliantCount;
          const liveScore = scoreable > 0 ? Math.round((compliantCount / scoreable) * 100) : (score?.compliance_score ?? null);
          return (
            <div className="grid grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Score', value: liveScore != null ? `${liveScore}%` : 'N/A', color: 'text-lncyan2' },
                { label: 'Compliant', value: compliantCount, color: 'text-lngreen' },
                { label: 'Non-Compliant', value: openNonCompliantCount, color: 'text-lnred' },
                { label: 'Resolved', value: resolvedCount, color: 'text-lngreen' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-lndark rounded border border-lncard p-4 text-center">
                  <div className={`text-2xl font-bold ${color}`}>{value}</div>
                  <div className="text-xs text-lnmuted mt-1">{label}</div>
                </div>
              ))}
            </div>
          );
        })()}

        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-lnfaint" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search rules, resources..."
              className="w-full bg-lndark border border-lnborder rounded pl-9 pr-3 py-2 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2"
            />
          </div>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="bg-lndark border border-lnborder rounded px-3 py-2 text-sm text-lntext focus:outline-none focus:border-lncyan2"
          >
            <option value="">All Statuses</option>
            <option value="non_compliant">Non-Compliant</option>
            <option value="compliant">Compliant</option>
            <option value="not_applicable">Not Applicable</option>
          </select>
          <select
            value={filterSeverity}
            onChange={e => setFilterSeverity(e.target.value)}
            className="bg-lndark border border-lnborder rounded px-3 py-2 text-sm text-lntext focus:outline-none focus:border-lncyan2"
          >
            <option value="">All Severities</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 text-lncyan animate-spin" />
          </div>
        ) : ruleGroups.length === 0 ? (
          <div className="bg-lndark rounded border border-lncard p-12 text-center">
            <p className="text-lnmuted">No results found. Run a sync to evaluate compliance.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {failingGroups.length > 0 && (
              <RuleSection label={`Failing Rules (${failingGroups.length})`} groups={failingGroups} onUpdated={loadAndNotify} defaultOpen isAuditor={isAuditor} />
            )}
            {passingGroups.length > 0 && (
              <RuleSection label={`Passing Rules (${passingGroups.length})`} groups={passingGroups} onUpdated={loadAndNotify} defaultOpen={false} isAuditor={isAuditor} />
            )}
            {naGroups.length > 0 && (
              <RuleSection label={`Not Applicable (${naGroups.length})`} groups={naGroups} onUpdated={loadAndNotify} defaultOpen={false} isAuditor={isAuditor} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RuleSection({ label, groups, onUpdated, defaultOpen, isAuditor }: {
  label: string;
  groups: RuleGroup[];
  onUpdated: () => void;
  defaultOpen: boolean;
  isAuditor: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-lndark rounded border border-lncard overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-lncard hover:bg-lncard/40 transition"
      >
        <span className="text-sm font-semibold text-lntext">{label}</span>
        {open ? <ChevronUp className="w-4 h-4 text-lnfaint" /> : <ChevronDown className="w-4 h-4 text-lnfaint" />}
      </button>
      {open && groups.map(g => (
        <RuleGroupRow key={g.ruleId} group={g} onUpdated={onUpdated} isAuditor={isAuditor} />
      ))}
    </div>
  );
}
