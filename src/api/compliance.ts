import { api } from './client';

export type ComplianceSeverity = 'critical' | 'warning' | 'info';
export type ComplianceStatus = 'compliant' | 'non_compliant' | 'not_applicable';

export interface ComplianceRule {
  id: string;
  name: string;
  description: string;
  resource_types: string[];
  condition_type: string;
  condition_config: Record<string, unknown>;
  severity: ComplianceSeverity;
  is_active: boolean;
  is_builtin: boolean;
  account_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ComplianceResult {
  id: string;
  rule_id: string;
  resource_id: string | null;
  account_id: string;
  status: ComplianceStatus;
  detail: string | null;
  acknowledged: boolean;
  acknowledged_at: string | null;
  acknowledged_note: string | null;
  acknowledged_by: string | null;
  acknowledged_by_name: string | null;
  evaluated_at: string;
  created_at: string;
  rule?: ComplianceRule;
  resource?: {
    id: string;
    label: string;
    resource_type: string;
    region?: string;
    status?: string;
  };
}

export interface ComplianceScore {
  id: string;
  account_id: string;
  evaluated_at: string;
  total_results: number;
  compliant_count: number;
  non_compliant_count: number;
  not_applicable_count: number;
  acknowledged_count: number;
  compliance_score: number | null;
  total_rules_evaluated: number;
  rule_breakdown: Array<{
    rule_id: string;
    rule_name: string;
    severity: string;
    compliant: number;
    non_compliant: number;
    not_applicable: number;
  }>;
}

export interface ComplianceProfile {
  id: string;
  name: string;
  slug: string;
  description?: string;
  tier?: string;
  is_builtin: boolean;
  version?: string;
  icon?: string;
  rule_condition_types: string[];
  created_at: string;
}

export interface ComplianceRuleWithOverride extends ComplianceRule {
  is_overridden_disabled: boolean;
}

export interface RuleOverride {
  id: string;
  account_id: string;
  rule_id: string;
  is_active: boolean;
  applied_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RuleConfig {
  rule_id: string;
  account_id: string;
  config_override: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface TimelineSnapshot {
  snapshot_time: string;
  compliant: number;
  non_compliant: number;
  not_applicable: number;
  total: number;
  compliance_score: number | null;
}

export interface TimelineRuleEntry {
  rule_id: string;
  rule_name: string;
  severity: string;
  resource_type: string;
  snapshot_time: string;
  status: string;
  detail: string | null;
}

export interface ResourceTimeline {
  snapshots: TimelineSnapshot[];
  rule_history: TimelineRuleEntry[];
}

export const complianceApi = {
  getResults: (params: {
    account_id: string;
    status?: string;
    severity?: string;
    resource_type?: string;
    rule_id?: string;
    search?: string;
  }) => {
    const p = new URLSearchParams({ account_id: params.account_id });
    if (params.status) p.set('status', params.status);
    if (params.severity) p.set('severity', params.severity);
    if (params.resource_type) p.set('resource_type', params.resource_type);
    if (params.rule_id) p.set('rule_id', params.rule_id);
    if (params.search) p.set('search', params.search);
    return api.get<ComplianceResult[]>(`/api/compliance/results?${p}`);
  },
  getScore: (account_id: string) =>
    api.get<ComplianceScore>(`/api/compliance/score?account_id=${account_id}`),
  getScoreHistory: (account_id: string, limit = 30) =>
    api.get<ComplianceScore[]>(`/api/compliance/score/history?account_id=${account_id}&limit=${limit}`),
  acknowledge: (result_id: string, acknowledged: boolean, note?: string) =>
    api.put(`/api/compliance/results/${result_id}/acknowledge`, { acknowledged, acknowledged_note: note }),
  bulkAcknowledge: (result_ids: string[], acknowledged: boolean, note?: string) =>
    api.put(`/api/compliance/results/bulk-acknowledge`, { result_ids: result_ids, acknowledged, acknowledged_note: note }),
  addNote: (result_id: string, note: string) =>
    api.post(`/api/compliance/results/${result_id}/notes`, { note }),
  getNotes: (result_id: string) =>
    api.get<Array<{ id: string; note: string; created_at: string; author_name?: string }>>(`/api/compliance/results/${result_id}/notes`),
  getRules: (account_id?: string) => {
    const p = account_id ? `?account_id=${account_id}` : '';
    return api.get<ComplianceRuleWithOverride[]>(`/api/compliance/rules${p}`);
  },
  getProfiles: () => api.get<ComplianceProfile[]>('/api/compliance/profiles'),
  getActiveProfiles: (account_id: string) =>
    api.get<ComplianceProfile[]>(`/api/compliance/profiles/active?account_id=${account_id}`),
  setActiveProfiles: (account_id: string, profile_ids: string[]) =>
    api.put(`/api/compliance/profiles/active?account_id=${account_id}`, { profile_ids }),
  toggleProfile: (profile_id: string, account_id: string, active: boolean) =>
    api.put(`/api/compliance/profiles/${profile_id}/activate`, { account_id, active }),
  getRuleOverrides: (account_id: string) =>
    api.get<RuleOverride[]>(`/api/compliance/rules/overrides?account_id=${account_id}`),
  setRuleOverride: (rule_id: string, account_id: string, is_active: boolean) =>
    api.put(`/api/compliance/rules/${rule_id}/override?account_id=${account_id}`, { is_active }),
  getRuleConfig: (rule_id: string, account_id: string) =>
    api.get<RuleConfig>(`/api/compliance/rules/${rule_id}/config?account_id=${account_id}`),
  setRuleConfig: (rule_id: string, account_id: string, config_override: Record<string, unknown>) =>
    api.put<RuleConfig>(`/api/compliance/rules/${rule_id}/config`, { account_id, config_override }),
  getResourceTimeline: (resource_id: string, account_id: string) =>
    api.get<ResourceTimeline>(`/api/compliance/resources/${resource_id}/timeline?account_id=${account_id}`),
};
