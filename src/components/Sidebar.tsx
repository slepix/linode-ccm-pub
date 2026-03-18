import React from 'react';
import {
  Shield, LayoutDashboard, Server, ClipboardList,
  Users, ChevronDown, LogOut, Settings, Activity, ShieldCheck,
  Database, RefreshCw, CheckCircle, AlertCircle, FileText, Clock, Terminal,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { runMigrations, getSyncSchedule, updateSyncSchedule } from '../api/admin';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

type MigrationStatus = 'idle' | 'running' | 'success' | 'error';
type SyncSaveStatus = 'idle' | 'saving' | 'success' | 'error';

export default function Sidebar({ currentView, onNavigate }: SidebarProps) {
  const { user, logout } = useAuth();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [migrationStatus, setMigrationStatus] = React.useState<MigrationStatus>('idle');
  const [migrationMessage, setMigrationMessage] = React.useState('');
  const [syncInterval, setSyncInterval] = React.useState<number | ''>('');
  const [syncIntervalInput, setSyncIntervalInput] = React.useState('');
  const [syncSaveStatus, setSyncSaveStatus] = React.useState<SyncSaveStatus>('idle');
  const [syncSaveMessage, setSyncSaveMessage] = React.useState('');

  const navGroups = [
    {
      label: 'Monitor',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'compliance', label: 'Compliance', icon: ClipboardList },
        { id: 'reports', label: 'Reports', icon: FileText },
        { id: 'events', label: 'Event Timeline', icon: Activity },
      ],
    },
    {
      label: 'Infrastructure',
      items: [
        { id: 'resources', label: 'Resources', icon: Server },
      ],
    },
  ];

  const powerUserGroup = {
    label: 'Configuration',
    items: [
      { id: 'rules', label: 'Rules & Profiles', icon: ShieldCheck },
    ],
  };

  const adminGroup = {
    label: 'Administration',
    items: [
      { id: 'accounts', label: 'Linode Accounts', icon: Settings },
      { id: 'users', label: 'Users', icon: Users },
      { id: 'mcp', label: 'MCP Integration', icon: Terminal },
    ],
  };

  const mcpGroup = {
    label: 'Integrations',
    items: [
      { id: 'mcp', label: 'MCP Integration', icon: Terminal },
    ],
  };

  React.useEffect(() => {
    if (user?.role === 'admin' && settingsOpen) {
      getSyncSchedule()
        .then(data => {
          setSyncInterval(data.interval_minutes);
          setSyncIntervalInput(String(data.interval_minutes));
        })
        .catch(() => {});
    }
  }, [settingsOpen, user?.role]);

  async function handleSaveSyncSchedule() {
    const val = parseInt(syncIntervalInput, 10);
    if (isNaN(val) || val < 5) {
      setSyncSaveStatus('error');
      setSyncSaveMessage('Minimum interval is 5 minutes');
      setTimeout(() => { setSyncSaveStatus('idle'); setSyncSaveMessage(''); }, 4000);
      return;
    }
    setSyncSaveStatus('saving');
    setSyncSaveMessage('');
    try {
      await updateSyncSchedule(val);
      setSyncInterval(val);
      setSyncSaveStatus('success');
      setSyncSaveMessage('Schedule saved');
    } catch (err: unknown) {
      setSyncSaveStatus('error');
      setSyncSaveMessage(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setTimeout(() => { setSyncSaveStatus('idle'); setSyncSaveMessage(''); }, 4000);
    }
  }

  async function handleRunMigrations() {
    setMigrationStatus('running');
    setMigrationMessage('');
    try {
      const result = await runMigrations();
      setMigrationStatus('success');
      setMigrationMessage(result.message);
    } catch (err: unknown) {
      setMigrationStatus('error');
      setMigrationMessage(err instanceof Error ? err.message : 'Migration failed');
    } finally {
      setTimeout(() => {
        setMigrationStatus('idle');
        setMigrationMessage('');
      }, 5000);
    }
  }

  return (
    <aside className="w-56 bg-lndark border-r border-lnborder flex flex-col h-screen sticky top-0 shrink-0">
      <div className="px-4 py-4 border-b border-lnborder">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-lncyan2 rounded flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-lntext font-semibold text-sm leading-none tracking-wide">Akamai CCM</div>
            <div className="text-lnfaint text-xs mt-0.5">Cloud compliance Manager</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        {navGroups.map(group => (
          <div key={group.label} className="mb-1">
            <div className="px-4 pt-2 pb-1 text-[10px] font-bold text-lnfaint uppercase tracking-widest">
              {group.label}
            </div>
            {group.items.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors relative ${
                  currentView === id
                    ? 'text-lncyan2 bg-lncyan2/10'
                    : 'text-lnmuted hover:text-lntext hover:bg-ln-hover'
                }`}
              >
                {currentView === id && (
                  <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-lncyan2 rounded-r" />
                )}
                <Icon className="w-4 h-4 shrink-0" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        ))}

        {(user?.role === 'admin' || user?.role === 'power_user') && (
          <div className="mb-1">
            <div className="px-4 pt-2 pb-1 text-[10px] font-bold text-lnfaint uppercase tracking-widest">
              {powerUserGroup.label}
            </div>
            {powerUserGroup.items.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors relative ${
                  currentView === id
                    ? 'text-lncyan2 bg-lncyan2/10'
                    : 'text-lnmuted hover:text-lntext hover:bg-ln-hover'
                }`}
              >
                {currentView === id && (
                  <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-lncyan2 rounded-r" />
                )}
                <Icon className="w-4 h-4 shrink-0" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}

        {user?.role !== 'admin' && (
          <div className="mb-1">
            <div className="px-4 pt-2 pb-1 text-[10px] font-bold text-lnfaint uppercase tracking-widest">
              {mcpGroup.label}
            </div>
            {mcpGroup.items.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors relative ${
                  currentView === id
                    ? 'text-lncyan2 bg-lncyan2/10'
                    : 'text-lnmuted hover:text-lntext hover:bg-ln-hover'
                }`}
              >
                {currentView === id && (
                  <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-lncyan2 rounded-r" />
                )}
                <Icon className="w-4 h-4 shrink-0" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}

        {user?.role === 'admin' && (
          <div className="mb-1">
            <div className="px-4 pt-2 pb-1 text-[10px] font-bold text-lnfaint uppercase tracking-widest">
              {adminGroup.label}
            </div>
            {adminGroup.items.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors relative ${
                  currentView === id
                    ? 'text-lncyan2 bg-lncyan2/10'
                    : 'text-lnmuted hover:text-lntext hover:bg-ln-hover'
                }`}
              >
                {currentView === id && (
                  <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-lncyan2 rounded-r" />
                )}
                <Icon className="w-4 h-4 shrink-0" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}

        {user?.role === 'admin' && (
          <div className="mt-2 px-3">
            <button
              onClick={() => setSettingsOpen(v => !v)}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded text-[10px] font-bold text-lnfaint uppercase tracking-widest hover:text-lnmuted transition-colors"
            >
              <span>Settings</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
            </button>

            {settingsOpen && (
              <div className="mt-1 space-y-1">
                <div className="border border-lnborder rounded overflow-hidden">
                  <div className="px-3 py-2 bg-lnbg flex items-center gap-2 border-b border-lnborder">
                    <Clock className="w-3 h-3 text-lnfaint" />
                    <span className="text-[10px] font-bold text-lnfaint uppercase tracking-widest">Auto-Sync</span>
                  </div>
                  <div className="px-3 py-3 bg-lndark">
                    <p className="text-xs text-lnfaint mb-3 leading-relaxed">
                      How often to sync account data (min 5 min).
                    </p>
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="number"
                        min={5}
                        value={syncIntervalInput}
                        onChange={e => setSyncIntervalInput(e.target.value)}
                        className="w-16 bg-lnbg border border-lnborder rounded px-2 py-1 text-xs text-lntext focus:outline-none focus:border-lncyan2 text-center"
                        placeholder="60"
                      />
                      <span className="text-xs text-lnfaint">minutes</span>
                    </div>
                    {syncInterval !== '' && (
                      <p className="text-[10px] text-lnfaint mb-2">Current: {syncInterval} min</p>
                    )}
                    <button
                      onClick={handleSaveSyncSchedule}
                      disabled={syncSaveStatus === 'saving'}
                      className={`w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition ${
                        syncSaveStatus === 'saving'
                          ? 'bg-lnborder text-lnfaint cursor-not-allowed'
                          : syncSaveStatus === 'success'
                          ? 'bg-lngreen/10 text-lngreen border border-lngreen/30'
                          : syncSaveStatus === 'error'
                          ? 'bg-lnred/10 text-lnred border border-lnred/30'
                          : 'bg-lncyan2 hover:bg-lncyan text-white'
                      }`}
                    >
                      {syncSaveStatus === 'saving' && <RefreshCw className="w-3 h-3 animate-spin" />}
                      {syncSaveStatus === 'success' && <CheckCircle className="w-3 h-3" />}
                      {syncSaveStatus === 'error' && <AlertCircle className="w-3 h-3" />}
                      {syncSaveStatus === 'saving' ? 'Saving…' : 'Save'}
                    </button>
                    {syncSaveMessage && (
                      <p className={`mt-2 text-xs leading-relaxed ${
                        syncSaveStatus === 'success' ? 'text-lngreen' : 'text-lnred'
                      }`}>
                        {syncSaveMessage}
                      </p>
                    )}
                  </div>
                </div>

                <div className="border border-lnborder rounded overflow-hidden">
                  <div className="px-3 py-2 bg-lnbg flex items-center gap-2 border-b border-lnborder">
                    <Database className="w-3 h-3 text-lnfaint" />
                    <span className="text-[10px] font-bold text-lnfaint uppercase tracking-widest">Database</span>
                  </div>
                  <div className="px-3 py-3 bg-lndark">
                    <p className="text-xs text-lnfaint mb-3 leading-relaxed">
                      Apply pending schema migrations.
                    </p>
                    <button
                      onClick={handleRunMigrations}
                      disabled={migrationStatus === 'running'}
                      className={`w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition ${
                        migrationStatus === 'running'
                          ? 'bg-lnborder text-lnfaint cursor-not-allowed'
                          : migrationStatus === 'success'
                          ? 'bg-lngreen/10 text-lngreen border border-lngreen/30'
                          : migrationStatus === 'error'
                          ? 'bg-lnred/10 text-lnred border border-lnred/30'
                          : 'bg-lncyan2 hover:bg-lncyan text-white'
                      }`}
                    >
                      {migrationStatus === 'running' && <RefreshCw className="w-3 h-3 animate-spin" />}
                      {migrationStatus === 'success' && <CheckCircle className="w-3 h-3" />}
                      {migrationStatus === 'error' && <AlertCircle className="w-3 h-3" />}
                      {migrationStatus === 'running' ? 'Running…' : 'Update DB'}
                    </button>
                    {migrationMessage && (
                      <p className={`mt-2 text-xs leading-relaxed ${
                        migrationStatus === 'success' ? 'text-lngreen' : 'text-lnred'
                      }`}>
                        {migrationMessage}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-3 py-3 border-t border-lnborder">
        <div className="flex items-center gap-2.5 mb-2.5 px-1">
          <div className="w-7 h-7 rounded-full bg-lncyan2/20 border border-lncyan2/40 flex items-center justify-center text-xs font-bold text-lncyan2 shrink-0">
            {(user?.full_name || user?.email || '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm text-lntext font-medium truncate leading-tight">{user?.full_name || user?.email}</div>
            <div className="text-xs text-lnfaint capitalize leading-tight mt-0.5">{user?.role?.replace('_', ' ')}</div>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded text-sm text-lnmuted hover:text-lntext hover:bg-ln-hover transition-colors"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
