import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus, Trash2, Copy, Check, X, Loader2, Key, ToggleLeft, ToggleRight,
  Eye, EyeOff, AlertCircle, Info, Terminal, Clock,
} from 'lucide-react';
import { mcpApi, McpApiKey, CreatedMcpKey } from '../api/mcp';
import { useAuth } from '../context/AuthContext';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="p-1.5 text-lnmuted hover:text-lncyan2 hover:bg-lncyan2/10 rounded transition"
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-lngreen" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function NewKeyReveal({ created, onDone }: { created: CreatedMcpKey; onDone: () => void }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(created.raw_key).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-lndark border border-lngreen/30 rounded-lg p-5 mb-6 shadow-lg">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-lngreen/10 border border-lngreen/30 flex items-center justify-center shrink-0 mt-0.5">
          <Check className="w-4 h-4 text-lngreen" />
        </div>
        <div>
          <div className="text-sm font-semibold text-lngreen">Key created: {created.name}</div>
          <div className="text-xs text-lnmuted mt-0.5">
            This is the only time the full key will be shown. Copy it now.
          </div>
        </div>
      </div>

      <div className="bg-lnbg border border-lnborder rounded-md p-3 flex items-center gap-3 mb-4 font-mono text-xs">
        <span className="flex-1 text-lntext break-all select-all">
          {visible ? created.raw_key : created.raw_key.slice(0, 8) + '•'.repeat(40)}
        </span>
        <button
          onClick={() => setVisible(v => !v)}
          className="p-1.5 text-lnmuted hover:text-lntext rounded transition shrink-0"
          title={visible ? 'Hide key' : 'Reveal key'}
        >
          {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-lncyan2 hover:bg-lncyan text-white text-xs rounded transition shrink-0"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      <div className="flex items-start gap-2 text-xs text-lnamber mb-4">
        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>Store this key in a secure location such as your password manager or secrets vault. It cannot be retrieved again.</span>
      </div>

      <button
        onClick={onDone}
        className="px-4 py-2 text-sm bg-lncard hover:bg-lnborder text-lnmuted hover:text-lntext rounded transition"
      >
        I've saved it
      </button>
    </div>
  );
}

function KeyRow({
  keyObj,
  isAdmin,
  onDelete,
  onToggle,
}: {
  keyObj: McpApiKey;
  isAdmin: boolean;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete key "${keyObj.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await onDelete(keyObj.id);
    } finally {
      setDeleting(false);
    }
  };

  const handleToggle = async () => {
    setToggling(true);
    try {
      await onToggle(keyObj.id, !keyObj.is_active);
    } finally {
      setToggling(false);
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const isExpired = keyObj.expires_at && new Date(keyObj.expires_at) < new Date();

  return (
    <div className={`flex items-center gap-4 px-5 py-4 border-b border-lncard last:border-0 ${!keyObj.is_active ? 'opacity-60' : ''}`}>
      <div className={`w-8 h-8 rounded border flex items-center justify-center shrink-0 ${
        keyObj.is_active && !isExpired ? 'bg-lncyan2/10 border-lncyan2/30' : 'bg-lncard border-lnborder'
      }`}>
        <Key className={`w-3.5 h-3.5 ${keyObj.is_active && !isExpired ? 'text-lncyan2' : 'text-lnfaint'}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-lntext">{keyObj.name}</span>
          {isExpired && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-lnred/10 border border-lnred/30 text-lnred">Expired</span>
          )}
          {!keyObj.is_active && !isExpired && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-lncard border border-lnborder text-lnfaint">Disabled</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className="text-xs text-lnfaint font-mono">{keyObj.key_prefix}…</span>
          {isAdmin && (
            <span className="text-xs text-lnmuted">{keyObj.user_full_name || keyObj.user_email}</span>
          )}
          <span className="text-xs text-lnfaint">Created {formatDate(keyObj.created_at)}</span>
          {keyObj.last_used_at && (
            <span className="text-xs text-lnfaint flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              Last used {formatDate(keyObj.last_used_at)}
            </span>
          )}
          {keyObj.expires_at && (
            <span className={`text-xs flex items-center gap-1 ${isExpired ? 'text-lnred' : 'text-lnfaint'}`}>
              Expires {formatDate(keyObj.expires_at)}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={handleToggle}
          disabled={toggling}
          className={`p-1.5 rounded transition disabled:opacity-40 ${
            keyObj.is_active
              ? 'text-lncyan2 hover:text-lnamber hover:bg-lnamber/10'
              : 'text-lnfaint hover:text-lncyan2 hover:bg-lncyan2/10'
          }`}
          title={keyObj.is_active ? 'Disable key' : 'Enable key'}
        >
          {toggling
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : keyObj.is_active
              ? <ToggleRight className="w-4 h-4" />
              : <ToggleLeft className="w-4 h-4" />
          }
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="p-1.5 text-lnmuted hover:text-lnred hover:bg-lnred/10 rounded transition disabled:opacity-40"
          title="Delete key"
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function CreateKeyForm({ onCreate, onCancel }: { onCreate: (name: string, expires?: string | null) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [useExpiry, setUseExpiry] = useState(false);
  const [expiry, setExpiry] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setError('');
    setLoading(true);
    try {
      await onCreate(name.trim(), useExpiry && expiry ? expiry : null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create key');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-lndark rounded border border-lncard p-5 mb-5">
      <h3 className="text-sm font-semibold text-lntext mb-4">New API Key</h3>
      {error && (
        <div className="mb-3 px-3 py-2 rounded bg-lnred/10 border border-lnred/30 text-lnred text-xs">{error}</div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-lnmuted mb-1">Key name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Claude Desktop"
            className="w-full bg-lncard border border-lnborder rounded px-3 py-2 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-lnmuted mb-1">Expiry (optional)</label>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="use-expiry"
              checked={useExpiry}
              onChange={e => setUseExpiry(e.target.checked)}
              className="accent-lncyan2"
            />
            <label htmlFor="use-expiry" className="text-xs text-lnmuted">Set expiry date</label>
          </div>
          {useExpiry && (
            <input
              type="date"
              value={expiry}
              onChange={e => setExpiry(e.target.value)}
              className="mt-1 w-full bg-lncard border border-lnborder rounded px-3 py-2 text-sm text-lntext focus:outline-none focus:border-lncyan2"
            />
          )}
        </div>
      </div>
      <div className="flex gap-3">
        <button
          onClick={handleCreate}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-lncyan2 hover:bg-lncyan disabled:opacity-50 text-white text-sm rounded font-medium transition"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Create Key
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-2 px-4 py-2 bg-lnborder hover:bg-lnborder2 text-lnmuted text-sm rounded transition"
        >
          <X className="w-4 h-4" /> Cancel
        </button>
      </div>
    </div>
  );
}

export default function McpPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [keys, setKeys] = useState<McpApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [mcpEnabled, setMcpEnabled] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState<CreatedMcpKey | null>(null);
  const [togglingGlobal, setTogglingGlobal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [keyList, settings] = await Promise.all([
        mcpApi.listKeys(),
        isAdmin ? mcpApi.getSettings() : Promise.resolve(null),
      ]);
      setKeys(keyList);
      if (settings) setMcpEnabled(settings.mcp_enabled);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (name: string, expires?: string | null) => {
    const expiresIso = expires ? new Date(expires).toISOString() : null;
    const created = await mcpApi.createKey(name, expiresIso);
    setNewKey(created);
    setShowCreate(false);
    await load();
  };

  const handleDelete = async (id: string) => {
    await mcpApi.deleteKey(id);
    await load();
  };

  const handleToggle = async (id: string, active: boolean) => {
    await mcpApi.updateKey(id, { is_active: active });
    await load();
  };

  const handleToggleGlobal = async () => {
    setTogglingGlobal(true);
    try {
      await mcpApi.updateSettings(!mcpEnabled);
      setMcpEnabled(v => !v);
    } finally {
      setTogglingGlobal(false);
    }
  };

  const baseUrl = window.location.origin.replace(/:\d+$/, ':8000');

  return (
    <div className="flex-1 p-8 overflow-auto">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold text-lntext">MCP Integration</h1>
            <p className="text-lnmuted text-sm mt-1">Connect AI assistants like Claude to your compliance data</p>
          </div>
          <button
            onClick={() => { setShowCreate(v => !v); setNewKey(null); }}
            disabled={!mcpEnabled}
            className="flex items-center gap-2 bg-lncyan2 hover:bg-lncyan disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm font-medium transition"
          >
            <Plus className="w-4 h-4" /> New API Key
          </button>
        </div>

        {isAdmin && (
          <div className={`flex items-center justify-between px-4 py-3 rounded-lg border mb-6 mt-4 ${
            mcpEnabled ? 'bg-lncyan2/5 border-lncyan2/20' : 'bg-lnred/5 border-lnred/20'
          }`}>
            <div className="flex items-center gap-3">
              <Terminal className={`w-4 h-4 ${mcpEnabled ? 'text-lncyan2' : 'text-lnfaint'}`} />
              <div>
                <div className="text-sm font-medium text-lntext">MCP Access</div>
                <div className="text-xs text-lnmuted mt-0.5">
                  {mcpEnabled ? 'MCP is enabled — API keys can be used to access the server.' : 'MCP is disabled — all API keys are blocked organization-wide.'}
                </div>
              </div>
            </div>
            <button
              onClick={handleToggleGlobal}
              disabled={togglingGlobal}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded border transition disabled:opacity-50 ${
                mcpEnabled
                  ? 'border-lnred/30 text-lnred hover:bg-lnred/10'
                  : 'border-lncyan2/30 text-lncyan2 hover:bg-lncyan2/10'
              }`}
            >
              {togglingGlobal
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : mcpEnabled
                  ? <ToggleRight className="w-3.5 h-3.5" />
                  : <ToggleLeft className="w-3.5 h-3.5" />
              }
              {mcpEnabled ? 'Disable MCP' : 'Enable MCP'}
            </button>
          </div>
        )}

        {!mcpEnabled && !isAdmin && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-lnamber/30 bg-lnamber/5 mb-6">
            <AlertCircle className="w-4 h-4 text-lnamber shrink-0" />
            <p className="text-sm text-lnamber">MCP access is currently disabled by your administrator.</p>
          </div>
        )}

        {newKey && (
          <NewKeyReveal
            created={newKey}
            onDone={() => setNewKey(null)}
          />
        )}

        {showCreate && (
          <CreateKeyForm
            onCreate={handleCreate}
            onCancel={() => setShowCreate(false)}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div className="bg-lndark border border-lncard rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Terminal className="w-4 h-4 text-lncyan2" />
              <span className="text-sm font-semibold text-lntext">HTTP / Streamable</span>
            </div>
            <div className="flex items-center gap-2 bg-lnbg rounded px-3 py-2 font-mono text-xs text-lnmuted border border-lnborder mb-2">
              <span className="flex-1 break-all">{baseUrl}/api/mcp</span>
              <CopyButton text={`${baseUrl}/api/mcp`} />
            </div>
            <p className="text-xs text-lnfaint">Use as <code className="text-lncyan2">command</code> transport in Claude Desktop or any MCP client that supports streamable HTTP.</p>
          </div>

          <div className="bg-lndark border border-lncard rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Terminal className="w-4 h-4 text-lncyan2" />
              <span className="text-sm font-semibold text-lntext">SSE (Server-Sent Events)</span>
            </div>
            <div className="flex items-center gap-2 bg-lnbg rounded px-3 py-2 font-mono text-xs text-lnmuted border border-lnborder mb-2">
              <span className="flex-1 break-all">{baseUrl}/api/mcp/sse</span>
              <CopyButton text={`${baseUrl}/api/mcp/sse`} />
            </div>
            <p className="text-xs text-lnfaint">SSE endpoint for clients that use the server-sent-events transport (e.g. remote agents).</p>
          </div>
        </div>

        <div className="bg-lndark border border-lncard rounded-lg p-4 mb-6">
          <div className="flex items-start gap-2 mb-3">
            <Info className="w-4 h-4 text-lncyan2 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-lntext mb-1">Claude Desktop Configuration</div>
              <p className="text-xs text-lnmuted mb-3">Add this block to your <code className="text-lncyan2">claude_desktop_config.json</code>:</p>
              <div className="relative">
                <pre className="bg-lnbg border border-lnborder rounded p-3 text-xs text-lnmuted overflow-x-auto leading-relaxed">
{`{
  "mcpServers": {
    "akamai-ccm": {
      "command": "curl",
      "args": [
        "-X", "POST",
        "-H", "Authorization: Bearer YOUR_MCP_KEY",
        "-H", "Content-Type: application/json",
        "-d", "@-",
        "${baseUrl}/api/mcp"
      ]
    }
  }
}`}
                </pre>
                <div className="absolute top-2 right-2">
                  <CopyButton text={`{
  "mcpServers": {
    "akamai-ccm": {
      "command": "curl",
      "args": [
        "-X", "POST",
        "-H", "Authorization: Bearer YOUR_MCP_KEY",
        "-H", "Content-Type: application/json",
        "-d", "@-",
        "${baseUrl}/api/mcp"
      ]
    }
  }
}`} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-lntext">
            {isAdmin ? 'All API Keys' : 'Your API Keys'}
          </h2>
          <span className="text-xs text-lnfaint">{keys.length} key{keys.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 text-lncyan2 animate-spin" />
          </div>
        ) : keys.length === 0 ? (
          <div className="bg-lndark border border-lncard rounded-lg flex flex-col items-center justify-center py-12 text-center px-6">
            <Key className="w-8 h-8 text-lnfaint mb-3" />
            <div className="text-sm font-medium text-lnmuted mb-1">No API keys yet</div>
            <div className="text-xs text-lnfaint max-w-xs">
              Create an API key to authenticate your MCP client.
            </div>
          </div>
        ) : (
          <div className="bg-lndark border border-lncard rounded-lg overflow-hidden">
            {keys.map(k => (
              <KeyRow
                key={k.id}
                keyObj={k}
                isAdmin={isAdmin}
                onDelete={handleDelete}
                onToggle={handleToggle}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
