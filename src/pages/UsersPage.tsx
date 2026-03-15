import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Check, X, Loader2, Shield, User, KeyRound, ChevronDown, ChevronRight, Link2, Unlink, Lock } from 'lucide-react';
import { api } from '../api/client';
import { accountsApi, LinodeAccount } from '../api/accounts';
import ChangePasswordModal from '../components/ChangePasswordModal';

interface OrgUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  can_view_costs: boolean;
  can_view_compliance: boolean;
  created_at: string;
}

interface AccountAccess {
  id: string;
  user_id: string;
  account_id: string;
  account_name: string;
  can_view_costs: boolean;
  can_view_compliance: boolean;
  granted_at: string;
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-lnred/10 text-lnred border-lnred/40',
  power_user: 'bg-ln-icon-blue text-lnblue border-lnborder2',
  auditor: 'bg-lncard text-lnmuted border-lnborder',
};

function AccountAccessModal({
  user,
  onClose,
}: {
  user: OrgUser;
  onClose: () => void;
}) {
  const [access, setAccess] = useState<AccountAccess[]>([]);
  const [allAccounts, setAllAccounts] = useState<LinodeAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState('');

  const loadAccess = async () => {
    const [acc, accounts] = await Promise.all([
      api.get<AccountAccess[]>(`/api/users/${user.id}/access`),
      accountsApi.list(),
    ]);
    setAccess(acc);
    setAllAccounts(accounts);
    setLoading(false);
  };

  useEffect(() => { loadAccess(); }, []);

  const assignedIds = new Set(access.map(a => a.account_id));
  const unassigned = allAccounts.filter(a => !assignedIds.has(a.id));

  const handleGrant = async () => {
    if (!selectedAccount) return;
    setSaving('grant');
    try {
      await api.post(`/api/users/${user.id}/access`, { account_id: selectedAccount, can_view_costs: true, can_view_compliance: true });
      setSelectedAccount('');
      await loadAccess();
    } finally {
      setSaving(null);
    }
  };

  const handleRevoke = async (accountId: string) => {
    setSaving(accountId);
    try {
      await api.delete(`/api/users/${user.id}/access/${accountId}`);
      await loadAccess();
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-lndark border border-lncard rounded-lg w-full max-w-lg mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-lncard">
          <div>
            <h2 className="text-sm font-semibold text-lntext">Manage Account Access</h2>
            <p className="text-xs text-lnmuted mt-0.5">{user.full_name || user.email}</p>
          </div>
          <button onClick={onClose} className="text-lnmuted hover:text-lntext transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="w-5 h-5 text-lncyan animate-spin" />
            </div>
          ) : (
            <>
              {user.role !== 'admin' && (
                <div className="mb-5">
                  <label className="block text-xs font-medium text-lnmuted mb-2">Assign Account</label>
                  <div className="flex gap-2">
                    <select
                      value={selectedAccount}
                      onChange={e => setSelectedAccount(e.target.value)}
                      className="flex-1 bg-lncard border border-lnborder rounded px-3 py-2 text-sm text-lntext focus:outline-none focus:border-lncyan2"
                    >
                      <option value="">Select an account…</option>
                      {unassigned.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleGrant}
                      disabled={!selectedAccount || saving === 'grant'}
                      className="flex items-center gap-1.5 px-3 py-2 bg-lncyan2 hover:bg-lncyan disabled:opacity-40 text-white text-sm rounded font-medium transition"
                    >
                      {saving === 'grant' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                      Assign
                    </button>
                  </div>
                  {unassigned.length === 0 && allAccounts.length > 0 && (
                    <p className="text-xs text-lnfaint mt-2">All accounts are already assigned.</p>
                  )}
                  {allAccounts.length === 0 && (
                    <p className="text-xs text-lnfaint mt-2">No Linode accounts configured yet.</p>
                  )}
                </div>
              )}

              {user.role === 'admin' ? (
                <div className="flex items-center gap-2 px-3 py-3 rounded bg-lngreen/5 border border-lngreen/20">
                  <Shield className="w-4 h-4 text-lngreen shrink-0" />
                  <p className="text-xs text-lngreen">Admin users have access to all accounts automatically.</p>
                </div>
              ) : access.length === 0 ? (
                <div className="text-center py-8 text-lnfaint text-sm">
                  No accounts assigned yet.
                </div>
              ) : (
                <div>
                  <p className="text-xs font-medium text-lnmuted mb-2">Assigned Accounts</p>
                  <div className="rounded border border-lncard overflow-hidden">
                    {access.map(a => (
                      <div key={a.account_id} className="flex items-center gap-3 px-4 py-3 border-b border-lncard last:border-0">
                        <div className="w-7 h-7 rounded bg-lncyan2/10 border border-lncyan2/20 flex items-center justify-center shrink-0">
                          <KeyRound className="w-3.5 h-3.5 text-lncyan2" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-lntext font-medium truncate">{a.account_name}</div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className={`text-xs ${a.can_view_costs ? 'text-lngreen' : 'text-lnfaint'}`}>
                              {a.can_view_costs ? 'Costs visible' : 'No cost view'}
                            </span>
                            <span className={`text-xs ${a.can_view_compliance ? 'text-lngreen' : 'text-lnfaint'}`}>
                              {a.can_view_compliance ? 'Compliance visible' : 'No compliance view'}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRevoke(a.account_id)}
                          disabled={saving === a.account_id}
                          className="p-1.5 text-lnmuted hover:text-lnred hover:bg-lnred/10 rounded transition disabled:opacity-40"
                          title="Revoke access"
                        >
                          {saving === a.account_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-3 border-t border-lncard flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-lnmuted hover:text-lntext bg-lncard hover:bg-lnborder rounded transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'auditor' });
  const [error, setError] = useState('');
  const [accessUser, setAccessUser] = useState<OrgUser | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<OrgUser | null>(null);

  const load = () => {
    setLoading(true);
    api.get<OrgUser[]>('/api/users').then(setUsers).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    setError('');
    setLoading(true);
    try {
      await api.post('/api/users', form);
      setForm({ email: '', password: '', full_name: '', role: 'auditor' });
      setShowAdd(false);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete user "${name}"?`)) return;
    await api.delete(`/api/users/${id}`);
    load();
  };

  const handleToggleActive = async (u: OrgUser) => {
    await api.put(`/api/users/${u.id}`, { is_active: !u.is_active });
    load();
  };

  return (
    <div className="flex-1 p-8 overflow-auto">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-lntext">Users</h1>
            <p className="text-lnmuted text-sm mt-1">Manage organization members and access</p>
          </div>
          <button
            onClick={() => setShowAdd(v => !v)}
            className="flex items-center gap-2 bg-lncyan2 hover:bg-lncyan text-lntext px-4 py-2 rounded text-sm font-medium transition"
          >
            <Plus className="w-4 h-4" /> Invite User
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded bg-lnred/10 border border-lnred/40 text-lnred text-sm">{error}</div>
        )}

        {showAdd && (
          <div className="bg-lndark rounded border border-lncard p-6 mb-6">
            <h3 className="text-sm font-semibold text-lntext mb-4">New User</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-lnmuted mb-1">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full bg-lncard border border-lnborder rounded px-3 py-2 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2"
                  placeholder="user@company.com" />
              </div>
              <div>
                <label className="block text-xs font-medium text-lnmuted mb-1">Full Name</label>
                <input type="text" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  className="w-full bg-lncard border border-lnborder rounded px-3 py-2 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2"
                  placeholder="Jane Doe" />
              </div>
              <div>
                <label className="block text-xs font-medium text-lnmuted mb-1">Password</label>
                <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full bg-lncard border border-lnborder rounded px-3 py-2 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2"
                  placeholder="Temporary password" />
              </div>
              <div>
                <label className="block text-xs font-medium text-lnmuted mb-1">Role</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full bg-lncard border border-lnborder rounded px-3 py-2 text-sm text-lntext focus:outline-none focus:border-lncyan2">
                  <option value="auditor">Auditor</option>
                  <option value="power_user">Power User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={handleAdd} disabled={loading}
                className="flex items-center gap-2 bg-lncyan2 hover:bg-lncyan disabled:opacity-50 text-lntext px-4 py-2 rounded text-sm font-medium transition">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Create User
              </button>
              <button onClick={() => setShowAdd(false)}
                className="flex items-center gap-2 bg-lnborder hover:bg-lnborder2 text-lnmuted px-4 py-2 rounded text-sm font-medium transition">
                <X className="w-4 h-4" /> Cancel
              </button>
            </div>
          </div>
        )}

        {loading && users.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 text-lncyan animate-spin" />
          </div>
        ) : (
          <div className="bg-lndark rounded border border-lncard overflow-hidden">
            {users.map(u => (
              <div key={u.id} className="flex items-center gap-4 px-5 py-4 border-b border-lncard last:border-0">
                <div className="w-9 h-9 rounded-full bg-lnborder flex items-center justify-center text-sm font-semibold text-lntext shrink-0">
                  {(u.full_name || u.email)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-lntext">{u.full_name || u.email}</span>
                    {!u.is_active && <span className="text-xs text-lnfaint">(inactive)</span>}
                  </div>
                  <div className="text-xs text-lnmuted">{u.email}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded border capitalize ${ROLE_COLORS[u.role]}`}>
                  {u.role.replace('_', ' ')}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setAccessUser(u)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-lnmuted hover:text-lncyan2 hover:bg-lncyan2/10 rounded transition"
                    title="Manage account access"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Accounts</span>
                  </button>
                  <button
                    onClick={() => setResetPasswordUser(u)}
                    className="p-1.5 text-lnmuted hover:text-lncyan2 hover:bg-lncyan2/10 rounded transition"
                    title="Reset password"
                  >
                    <Lock className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleToggleActive(u)}
                    className={`p-1.5 rounded transition ${u.is_active ? 'text-lnmuted hover:text-lnamber hover:bg-ln-icon-amber' : 'text-lngreen hover:bg-lngreen/10'}`}
                    title={u.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {u.is_active ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleDelete(u.id, u.full_name || u.email)}
                    className="p-1.5 text-lnmuted hover:text-lnred hover:bg-lnred/10 rounded transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {accessUser && (
        <AccountAccessModal user={accessUser} onClose={() => setAccessUser(null)} />
      )}

      {resetPasswordUser && (
        <ChangePasswordModal
          adminReset
          userId={resetPasswordUser.id}
          userName={resetPasswordUser.full_name || resetPasswordUser.email}
          onClose={() => setResetPasswordUser(null)}
        />
      )}
    </div>
  );
}
