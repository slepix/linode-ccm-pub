import React, { useEffect, useState } from 'react';
import { Activity, Loader2 } from 'lucide-react';
import { LinodeAccount } from '../api/accounts';
import { api } from '../api/client';

interface LinodeEvent {
  id: string;
  event_id: number;
  action: string;
  entity_label?: string;
  entity_type?: string;
  secondary_entity_label?: string;
  message?: string;
  status?: string;
  username?: string;
  seen: boolean;
  event_created?: string;
}

const ACTION_COLORS: Record<string, string> = {
  linode_create: 'text-lngreen',
  linode_delete: 'text-lnred',
  linode_shutdown: 'text-lnamber',
  linode_boot: 'text-lncyan2',
  firewall_create: 'text-teal-400',
  firewall_delete: 'text-lnred',
  disk_resize: 'text-purple-400',
  database_create: 'text-lngreen',
  database_delete: 'text-lnred',
};

const STATUS_COLORS: Record<string, string> = {
  finished: 'bg-lngreen/10 text-lngreen',
  failed: 'bg-lnred/10 text-lnred',
  scheduled: 'bg-lncard text-lnmuted',
  started: 'bg-ln-icon-blue text-lnblue',
};

interface Props {
  account: LinodeAccount | null;
}

export default function EventsPage({ account }: Props) {
  const [events, setEvents] = useState<LinodeEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!account) return;
    setLoading(true);
    api.get<LinodeEvent[]>(`/api/events?account_id=${account.id}&limit=200`)
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [account]);

  if (!account) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-lnfaint">Select an account to view events.</p>
      </div>
    );
  }

  const filtered = events.filter(e =>
    !search ||
    e.action.toLowerCase().includes(search.toLowerCase()) ||
    (e.entity_label || '').toLowerCase().includes(search.toLowerCase()) ||
    (e.username || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 p-8 overflow-auto">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-lntext">Event Timeline</h1>
            <p className="text-lnmuted text-sm mt-1">{account.name} · {events.length} events</p>
          </div>
        </div>

        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search events, entities, users..."
            className="w-full bg-lndark border border-lnborder rounded px-4 py-2 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 text-lncyan animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-lndark rounded border border-lncard p-12 text-center">
            <Activity className="w-12 h-12 text-lnborder mx-auto mb-3" />
            <p className="text-lnmuted">No events found. Run a sync to fetch events.</p>
          </div>
        ) : (
          <div className="bg-lndark rounded border border-lncard overflow-hidden">
            {filtered.map(ev => (
              <div key={ev.id} className="flex items-start gap-4 px-4 py-3 border-b border-lncard last:border-0 hover:bg-lncard/30 transition">
                <div className="w-2 h-2 rounded-full bg-lnborder2 mt-2 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className={`text-sm font-mono font-medium ${ACTION_COLORS[ev.action] || 'text-lnmuted'}`}>
                      {ev.action}
                    </span>
                    {ev.entity_label && (
                      <span className="text-sm text-lntext">{ev.entity_label}</span>
                    )}
                    {ev.status && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[ev.status] || 'bg-lncard text-lnmuted'}`}>
                        {ev.status}
                      </span>
                    )}
                  </div>
                  {ev.message && (
                    <div className="text-xs text-lnmuted mt-0.5">{ev.message}</div>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    {ev.username && <span className="text-xs text-lnfaint">{ev.username}</span>}
                    {ev.event_created && (
                      <span className="text-xs text-lnfaint">
                        {new Date(ev.event_created).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
