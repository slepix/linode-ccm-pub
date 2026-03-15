import { api, getToken } from './client';

const BASE = import.meta.env.VITE_API_BASE || (
  import.meta.env.DEV ? 'http://localhost:8000' : ''
);

export interface RefreshResult {
  success: boolean;
  accounts_processed: number;
  results: Array<{
    account_id: string;
    sync?: { success: boolean; count: number };
    eval?: { evaluated: number; compliant: number; non_compliant: number; score?: number };
    error?: string;
  }>;
  log: string[];
  completed_at: string;
}

export type SyncEvent =
  | { type: 'phase'; phase: 'sync' | 'evaluate'; account_id: string }
  | { type: 'log'; message: string }
  | { type: 'sync_done'; count: number }
  | { type: 'eval_done'; result: { evaluated: number; compliant: number; non_compliant: number; score?: number } }
  | { type: 'done'; accounts_processed: number; results: RefreshResult['results']; completed_at: string }
  | { type: 'error'; message: string };

export function streamRefresh(
  opts: { account_id?: string; skip_sync?: boolean; skip_eval?: boolean },
  onEvent: (event: SyncEvent) => void,
  onClose: () => void,
): () => void {
  const params = new URLSearchParams();
  if (opts.account_id) params.set('account_id', opts.account_id);
  if (opts.skip_sync) params.set('skip_sync', 'true');
  if (opts.skip_eval) params.set('skip_eval', 'true');

  const token = getToken();
  const url = `${BASE}/api/refresh/stream?${params}`;

  let closed = false;

  fetch(url, {
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
      Accept: 'text/event-stream',
    },
  }).then(async (res) => {
    if (!res.ok || !res.body) {
      onEvent({ type: 'error', message: `Request failed: ${res.statusText}` });
      onClose();
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (!closed) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        const line = part.trim();
        if (line.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(line.slice(6)) as SyncEvent;
            onEvent(parsed);
          } catch {
          }
        }
      }
    }
    if (!closed) onClose();
  }).catch((err: unknown) => {
    if (!closed) {
      onEvent({ type: 'error', message: err instanceof Error ? err.message : 'Stream error' });
      onClose();
    }
  });

  return () => {
    closed = true;
  };
}

export const refreshApi = {
  run: (account_id?: string, skip_sync = false, skip_eval = false) =>
    api.post<RefreshResult>('/api/refresh', { account_id, skip_sync, skip_eval }),
};
