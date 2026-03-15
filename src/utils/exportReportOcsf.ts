import { Report, ReportSnapshot, ReportResult } from '../api/reports';

const OCSF_SCHEMA_VERSION = '1.1.0';
const PRODUCT_NAME = 'Akamai CCM';
const PRODUCT_VENDOR = 'Akamai Technologies';
const CLASS_UID = 2003;
const CLASS_NAME = 'Compliance Finding';

function severityId(severity: string): number {
  switch (severity.toLowerCase()) {
    case 'critical': return 5;
    case 'high': return 4;
    case 'error': return 4;
    case 'warning': return 3;
    case 'info': return 2;
    case 'low': return 2;
    default: return 1;
  }
}

function statusId(status: string): number {
  switch (status.toLowerCase()) {
    case 'compliant': return 1;
    case 'non_compliant': return 2;
    case 'not_applicable': return 3;
    default: return 0;
  }
}

function statusLabel(status: string): string {
  switch (status.toLowerCase()) {
    case 'compliant': return 'Pass';
    case 'non_compliant': return 'Fail';
    case 'not_applicable': return 'Not Applicable';
    default: return 'Unknown';
  }
}

function toEpochMs(dateStr: string): number {
  return new Date(dateStr).getTime();
}

function buildOcsfFinding(result: ReportResult, snap: ReportSnapshot, report: Report) {
  return {
    class_uid: CLASS_UID,
    class_name: CLASS_NAME,
    category_uid: 2,
    category_name: 'Findings',
    activity_id: 1,
    activity_name: 'Create',
    schema_version: OCSF_SCHEMA_VERSION,
    time: toEpochMs(result.evaluated_at),
    type_uid: 200301,
    type_name: 'Compliance Finding: Create',
    severity: result.severity.charAt(0).toUpperCase() + result.severity.slice(1),
    severity_id: severityId(result.severity),
    status: statusLabel(result.status),
    status_id: statusId(result.status),
    message: result.detail ?? '',
    metadata: {
      product: {
        name: PRODUCT_NAME,
        vendor_name: PRODUCT_VENDOR,
        version: '1.0',
      },
      schema_version: OCSF_SCHEMA_VERSION,
      uid: result.id,
      version: OCSF_SCHEMA_VERSION,
    },
    compliance: {
      control: result.rule_name,
      desc: result.rule_description ?? '',
      requirements: (snap.active_profiles ?? []).map(p => p.name),
      standards: (snap.active_profiles ?? []).map(p => p.name),
      status: statusLabel(result.status),
      status_id: statusId(result.status),
    },
    finding: {
      uid: result.id,
      title: result.rule_name,
      desc: result.rule_description ?? '',
      created_time: toEpochMs(result.evaluated_at),
      modified_time: toEpochMs(result.evaluated_at),
      related_events: [],
      src_url: '',
      supporting_data: {
        account_name: snap.account_name,
        report_title: report.title,
        report_id: report.id,
        period_start: snap.period_start,
        period_end: snap.period_end,
        quarter: report.quarter ?? '',
        acknowledged: result.acknowledged,
        acknowledged_note: result.acknowledged_note ?? '',
      },
    },
    resources: result.resource_id
      ? [
          {
            uid: result.resource_id,
            name: result.resource_label ?? '',
            type: result.resource_type ?? '',
            cloud_partition: result.region ?? '',
            region: result.region ?? '',
          },
        ]
      : [],
    unmapped: {},
  };
}

function triggerDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportReportOcsf(report: Report): void {
  const snap = report.snapshot as ReportSnapshot | null;
  if (!snap) return;

  const findings = snap.results.map(r => buildOcsfFinding(r, snap, report));

  const bundle = {
    schema_version: OCSF_SCHEMA_VERSION,
    source: { product: PRODUCT_NAME, vendor: PRODUCT_VENDOR },
    count: findings.length,
    findings,
  };

  const filename = `${report.title.replace(/[^a-z0-9]/gi, '_')}.ocsf.json`;
  triggerDownload(JSON.stringify(bundle, null, 2), filename);
}
