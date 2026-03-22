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
  created_at: string;
  updated_at: string;
}

export interface DriftFieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface DriftChange {
  resource_id: string;
  resource_type: string;
  label: string;
  region: string | null;
  change_type: 'added' | 'removed' | 'modified';
  field_changes: DriftFieldChange[];
  sync_a_at: string | null;
  sync_b_at: string | null;
}

export interface DriftResult {
  sync_a: string;
  sync_b: string;
  syncs: string[];
  changes: DriftChange[];
}

export const resourcesApi = {
  list: (account_id: string, resource_type?: string, region?: string) => {
    const p = new URLSearchParams({ account_id });
    if (resource_type) p.set('resource_type', resource_type);
    if (region) p.set('region', region);
    return api.get<Resource[]>(`/api/resources?${p}`);
  },
  get: (id: string) => api.get<Resource>(`/api/resources/${id}`),
  getSnapshots: (id: string) => api.get<unknown[]>(`/api/resources/${id}/snapshots`),
  getDrift: (account_id: string, sync_a?: string, sync_b?: string) => {
    const p = new URLSearchParams({ account_id });
    if (sync_a) p.set('sync_a', sync_a);
    if (sync_b) p.set('sync_b', sync_b);
    return api.get<DriftResult>(`/api/resources/drift?${p}`);
  },
};
