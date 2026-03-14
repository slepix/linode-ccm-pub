import { api } from './client';

export interface ReportSummary {
  total_checks: number;
  compliant: number;
  non_compliant: number;
  acknowledged: number;
  compliance_score: number | null;
  total_resources: number;
  resources_by_type: Record<string, number>;
}

export interface ReportRuleSummary {
  severity: string;
  compliant: number;
  non_compliant: number;
  not_applicable: number;
  acknowledged: number;
}

export interface ReportResult {
  id: string;
  rule_id: string;
  resource_id: string;
  status: string;
  detail: string | null;
  acknowledged: boolean;
  acknowledged_at: string | null;
  acknowledged_note: string | null;
  evaluated_at: string;
  rule_name: string;
  severity: string;
  rule_description: string | null;
  resource_label: string | null;
  resource_type: string | null;
  region: string | null;
}

export interface ActiveProfile {
  id: string;
  name: string;
  description: string | null;
  tier: string | null;
}

export interface ReportSnapshot {
  account_name: string;
  generated_at: string;
  period_start: string;
  period_end: string;
  summary: ReportSummary;
  score: Record<string, unknown>;
  rule_summary: Record<string, ReportRuleSummary>;
  results: ReportResult[];
  active_profiles: ActiveProfile[];
}

export interface Report {
  id: string;
  account_id: string;
  title: string;
  description: string;
  period_start: string;
  period_end: string;
  quarter: string | null;
  status: 'generating' | 'ready' | 'error';
  snapshot: ReportSnapshot | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateReportPayload {
  account_id: string;
  title: string;
  description?: string;
  period_start: string;
  period_end: string;
  quarter?: string;
}

export const reportsApi = {
  list: (account_id: string) =>
    api.get<Report[]>(`/api/reports?account_id=${encodeURIComponent(account_id)}`),
  get: (report_id: string) =>
    api.get<Report>(`/api/reports/${report_id}`),
  create: (payload: CreateReportPayload) =>
    api.post<Report>('/api/reports', payload),
  delete: (report_id: string) =>
    api.delete<{ success: boolean }>(`/api/reports/${report_id}`),
};
