import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Server, ShieldCheck, Building2, BookOpen, Loader2, X } from 'lucide-react';
import { resourcesApi, Resource } from '../api/resources';
import { complianceApi, ComplianceRuleWithOverride } from '../api/compliance';
import { accountsApi, LinodeAccount } from '../api/accounts';

interface SearchResult {
  id: string;
  type: 'resource' | 'rule' | 'account';
  label: string;
  sublabel: string;
  route: string;
}

interface GlobalSearchProps {
  selectedAccountId: string | null;
}

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  linode: 'Linode',
  volume: 'Volume',
  database: 'Database',
  object_storage: 'Object Storage',
  firewall: 'Firewall',
  vpc: 'VPC',
  lke_cluster: 'LKE Cluster',
  nodebalancer: 'NodeBalancer',
};

function typeIcon(type: SearchResult['type']) {
  switch (type) {
    case 'resource': return <Server className="w-3.5 h-3.5" />;
    case 'rule': return <ShieldCheck className="w-3.5 h-3.5" />;
    case 'account': return <Building2 className="w-3.5 h-3.5" />;
  }
}

function typeColor(type: SearchResult['type']) {
  switch (type) {
    case 'resource': return 'text-sky-400 bg-sky-400/10';
    case 'rule': return 'text-emerald-400 bg-emerald-400/10';
    case 'account': return 'text-amber-400 bg-amber-400/10';
  }
}

function highlight(text: string, query: string) {
  if (!query.trim()) return <span>{text}</span>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <mark className="bg-lncyan2/20 text-lncyan2 rounded-sm not-italic">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </span>
  );
}

export default function GlobalSearch({ selectedAccountId }: GlobalSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const lower = q.toLowerCase();
      const out: SearchResult[] = [];

      const [accounts, rules] = await Promise.all([
        accountsApi.list(),
        complianceApi.getRules(),
      ]);

      accounts
        .filter(a => a.name.toLowerCase().includes(lower))
        .slice(0, 3)
        .forEach(a => {
          out.push({
            id: `account-${a.id}`,
            type: 'account',
            label: a.name,
            sublabel: 'Account',
            route: '/accounts',
          });
        });

      rules
        .filter(r =>
          r.name.toLowerCase().includes(lower) ||
          r.description?.toLowerCase().includes(lower) ||
          r.condition_type.toLowerCase().includes(lower),
        )
        .slice(0, 5)
        .forEach(r => {
          out.push({
            id: `rule-${r.id}`,
            type: 'rule',
            label: r.name,
            sublabel: r.severity.charAt(0).toUpperCase() + r.severity.slice(1),
            route: '/rules',
          });
        });

      if (selectedAccountId) {
        const resources = await resourcesApi.list(selectedAccountId);
        resources
          .filter(r =>
            r.label.toLowerCase().includes(lower) ||
            r.resource_type.toLowerCase().includes(lower) ||
            r.region?.toLowerCase().includes(lower),
          )
          .slice(0, 6)
          .forEach(r => {
            out.push({
              id: `resource-${r.id}`,
              type: 'resource',
              label: r.label,
              sublabel: `${RESOURCE_TYPE_LABELS[r.resource_type] ?? r.resource_type}${r.region ? ` · ${r.region}` : ''}`,
              route: '/resources',
            });
          });
      }

      setResults(out);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  useEffect(() => {
    setActiveIdx(0);
  }, [results]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function onKeyDownInput(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[activeIdx]) {
        navigate(results[activeIdx].route);
        setOpen(false);
        setQuery('');
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  function selectResult(r: SearchResult) {
    navigate(r.route);
    setOpen(false);
    setQuery('');
  }

  const showDropdown = open && query.trim().length > 0;

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {});

  const groupOrder: SearchResult['type'][] = ['account', 'resource', 'rule'];
  const groupLabels: Record<string, string> = { account: 'Accounts', resource: 'Resources', rule: 'Rules' };

  return (
    <div className="relative flex-1 max-w-lg" ref={containerRef}>
      <div className={`flex items-center gap-2 px-2 py-1 rounded transition-colors ${
        open
          ? 'bg-lncard border border-lnborder2'
          : 'border border-transparent hover:border-lnborder'
      }`}>
        {loading ? (
          <Loader2 className="w-4 h-4 text-lnfaint shrink-0 animate-spin" />
        ) : (
          <Search className="w-4 h-4 text-lnfaint shrink-0" />
        )}
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Search resources, rules, accounts…"
          className="bg-transparent text-sm text-lntext placeholder-lnfaint outline-none w-full"
          onFocus={() => setOpen(true)}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={onKeyDownInput}
        />
        {query && (
          <button
            className="text-lnfaint hover:text-lnmuted transition-colors shrink-0"
            onMouseDown={e => { e.preventDefault(); setQuery(''); setResults([]); }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        {!query && (
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono text-lnfaint border border-lnborder shrink-0">
            ⌘K
          </kbd>
        )}
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-lncard border border-lnborder rounded-lg shadow-2xl z-50 overflow-hidden">
          {loading && results.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-lnfaint">
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 py-6 text-sm text-lnfaint">
              <BookOpen className="w-5 h-5 mb-1 opacity-40" />
              No results for <span className="text-lnmuted">"{query}"</span>
            </div>
          ) : (
            <div className="py-1 max-h-80 overflow-y-auto">
              {groupOrder.filter(g => grouped[g]?.length).map(group => (
                <div key={group}>
                  <div className="px-3 pt-2 pb-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-lnfaint">
                      {groupLabels[group]}
                    </span>
                  </div>
                  {grouped[group].map(r => {
                    const flatIdx = results.indexOf(r);
                    return (
                      <button
                        key={r.id}
                        className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors ${
                          flatIdx === activeIdx
                            ? 'bg-lnborder'
                            : 'hover:bg-lnborder/60'
                        }`}
                        onMouseEnter={() => setActiveIdx(flatIdx)}
                        onClick={() => selectResult(r)}
                      >
                        <span className={`p-1 rounded ${typeColor(r.type)}`}>
                          {typeIcon(r.type)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-lntext truncate">
                            {highlight(r.label, query)}
                          </div>
                          <div className="text-xs text-lnfaint truncate">{r.sublabel}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-lnborder px-3 py-1.5 flex items-center gap-3 text-[10px] text-lnfaint">
            <span><kbd className="font-mono">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono">↵</kbd> go to page</span>
            <span><kbd className="font-mono">Esc</kbd> close</span>
          </div>
        </div>
      )}
    </div>
  );
}
