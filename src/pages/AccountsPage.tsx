import React, { useState } from 'react';
import { Plus, Trash2, CreditCard as Edit2, Check, X, Loader2, RefreshCw, Key } from 'lucide-react';
import { LinodeAccount, accountsApi } from '../api/accounts';

interface Props {
  accounts: LinodeAccount[];
  onChanged: () => void;
}

interface FormState {
  name: string;
  api_token: string;
  webhook_api_key: string;
}

const empty: FormState = { name: '', api_token: '', webhook_api_key: '' };

export default function AccountsPage({ accounts, onChanged }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = async () => {
    if (!form.name || !form.api_token) return;
    setLoading(true);
    setError('');
    try {
      await accountsApi.create({ name: form.name, api_token: form.api_token, webhook_api_key: form.webhook_api_key || undefined });
      setForm(empty);
      setShowAdd(false);
      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (id: string) => {
    setLoading(true);
    try {
      await accountsApi.update(id, {
        name: editForm.name,
        ...(editForm.api_token && { api_token: editForm.api_token }),
      });
      setEditId(null);
      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete account "${name}"? This will remove all associated resources and compliance data.`)) return;
    setLoading(true);
    try {
      await accountsApi.delete(id);
      onChanged();
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (acc: LinodeAccount) => {
    setEditId(acc.id);
    setEditForm({ name: acc.name, api_token: '', webhook_api_key: acc.webhook_api_key || '' });
  };

  return (
    <div className="flex-1 p-8 overflow-auto">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-lntext">Linode Accounts</h1>
            <p className="text-lnmuted text-sm mt-1">Manage your connected Linode accounts</p>
          </div>
          <button
            onClick={() => setShowAdd(v => !v)}
            className="flex items-center gap-2 bg-lncyan2 hover:bg-lncyan text-lntext px-4 py-2 rounded text-sm font-medium transition"
          >
            <Plus className="w-4 h-4" />
            Add Account
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded bg-lnred/10 border border-lnred/40 text-lnred text-sm">
            {error}
          </div>
        )}

        {showAdd && (
          <div className="bg-lndark rounded border border-lncard p-6 mb-6">
            <h3 className="text-sm font-semibold text-lntext mb-4">New Account</h3>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-medium text-lnmuted mb-1">Account Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-lncard border border-lnborder rounded px-3 py-2 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2"
                  placeholder="Production Account"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-lnmuted mb-1">API Token</label>
                <input
                  type="password"
                  value={form.api_token}
                  onChange={e => setForm(f => ({ ...f, api_token: e.target.value }))}
                  className="w-full bg-lncard border border-lnborder rounded px-3 py-2 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2 font-mono"
                  placeholder="Linode Personal Access Token"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleAdd}
                  disabled={loading || !form.name || !form.api_token}
                  className="flex items-center gap-2 bg-lncyan2 hover:bg-lncyan disabled:opacity-50 text-lntext px-4 py-2 rounded text-sm font-medium transition"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Save Account
                </button>
                <button
                  onClick={() => { setShowAdd(false); setForm(empty); }}
                  className="flex items-center gap-2 bg-lnborder hover:bg-lnborder2 text-lnmuted px-4 py-2 rounded text-sm font-medium transition"
                >
                  <X className="w-4 h-4" /> Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {accounts.length === 0 ? (
            <div className="bg-lndark rounded border border-lncard p-12 text-center">
              <p className="text-lnmuted">No accounts yet. Add a Linode account to get started.</p>
            </div>
          ) : accounts.map(acc => (
            <div key={acc.id} className="bg-lndark rounded border border-lncard p-5">
              {editId === acc.id ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full bg-lncard border border-lnborder rounded px-3 py-2 text-sm text-lntext focus:outline-none focus:border-lncyan2"
                  />
                  <input
                    type="password"
                    value={editForm.api_token}
                    onChange={e => setEditForm(f => ({ ...f, api_token: e.target.value }))}
                    className="w-full bg-lncard border border-lnborder rounded px-3 py-2 text-sm text-lntext font-mono focus:outline-none focus:border-lncyan2"
                    placeholder="Leave blank to keep existing token"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => handleEdit(acc.id)} disabled={loading}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-lncyan2 hover:bg-lncyan disabled:opacity-50 text-lntext rounded transition">
                      <Check className="w-3 h-3" /> Save
                    </button>
                    <button onClick={() => setEditId(null)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-lnborder hover:bg-lnborder2 text-lnmuted rounded transition">
                      <X className="w-3 h-3" /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-lntext">{acc.name}</h3>
                    <div className="mt-1 space-y-0.5">
                      {acc.last_sync_at && (
                        <p className="text-xs text-lnfaint flex items-center gap-1">
                          <RefreshCw className="w-3 h-3" />
                          Synced {new Date(acc.last_sync_at).toLocaleString()}
                        </p>
                      )}
                      {acc.last_evaluated_at && (
                        <p className="text-xs text-lnfaint flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          Evaluated {new Date(acc.last_evaluated_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="mt-2">
                      <span className="text-xs text-lnfaint font-mono">{acc.id}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEdit(acc)}
                      className="p-2 text-lnmuted hover:text-lntext hover:bg-lncard rounded transition">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(acc.id, acc.name)}
                      className="p-2 text-lnmuted hover:text-lnred hover:bg-lnred/10 rounded transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
