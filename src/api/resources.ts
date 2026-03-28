import { api } from './client';

export interface Resource {
  id: string;
  account_id: string;
  resource_id: string;
  resource_type: string;
  label: string;
  region?: string;
  status?: string;
  specs?: Record<string, unknown>;
  pricing?: Record<string, unknown>;
  plan_type?: string;
  monthly_cost: number;
  resource_created_at?: string;
  last_synced_at?: string;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export const resourcesApi = {
  list: (account_id: string, resource_type?: string, region?: string, include_deleted?: boolean) => {
    const p = new URLSearchParams({ account_id });
    if (resource_type) p.set('resource_type', resource_type);
    if (region) p.set('region', region);
    if (include_deleted) p.set('include_deleted', 'true');
    return api.get<Resource[]>(`/api/resources?${p}`);
  },
  get: (id: string) => api.get<Resource>(`/api/resources/${id}`),
  getSnapshots: (id: string) => api.get<unknown[]>(`/api/resources/${id}/snapshots`),
};
