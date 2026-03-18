import { api } from './client';

export interface McpApiKey {
  id: string;
  user_id: string;
  user_email: string;
  user_full_name: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface CreatedMcpKey extends McpApiKey {
  raw_key: string;
  note: string;
}

export interface McpSettings {
  mcp_enabled: boolean;
}

export const mcpApi = {
  listKeys: () => api.get<McpApiKey[]>('/api/mcp/keys'),
  createKey: (name: string, expires_at?: string | null) =>
    api.post<CreatedMcpKey>('/api/mcp/keys', { name, expires_at: expires_at ?? null }),
  updateKey: (id: string, body: { name?: string; is_active?: boolean }) =>
    api.put<{ id: string; name: string; is_active: boolean }>(`/api/mcp/keys/${id}`, body),
  deleteKey: (id: string) => api.delete<{ ok: boolean }>(`/api/mcp/keys/${id}`),
  getSettings: () => api.get<McpSettings>('/api/mcp/keys/settings'),
  updateSettings: (mcp_enabled: boolean) =>
    api.put<McpSettings>('/api/mcp/keys/settings', { mcp_enabled }),
};
