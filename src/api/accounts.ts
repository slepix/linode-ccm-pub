import { api } from './client';

export interface LinodeAccount {
  id: string;
  name: string;
  api_token?: string;
  webhook_api_key?: string;
  last_sync_at?: string;
  last_evaluated_at?: string;
  created_at: string;
  updated_at: string;
}

export const accountsApi = {
  list: () => api.get<LinodeAccount[]>('/api/accounts'),
  get: (id: string) => api.get<LinodeAccount>(`/api/accounts/${id}`),
  create: (data: { name: string; api_token: string; webhook_api_key?: string }) =>
    api.post<LinodeAccount>('/api/accounts', data),
  update: (id: string, data: Partial<LinodeAccount>) =>
    api.put<LinodeAccount>(`/api/accounts/${id}`, data),
  delete: (id: string) => api.delete(`/api/accounts/${id}`),
};
