import { Resource } from '../api/resources';
import { ComplianceResult } from '../api/compliance';

const OCSF_SCHEMA_VERSION = '1.1.0';
const PRODUCT_NAME = 'Akamai CCM';
const PRODUCT_VENDOR = 'Akamai Technologies';
const CLASS_UID = 2003;
const CLASS_NAME = 'Compliance Finding';

interface NoteEntry {
  id: string;
  note: string;
  created_at: string;
  author_name?: string;
}

interface ComplianceResultWithNotes extends ComplianceResult {
  notes?: NoteEntry[];
}

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

function toEpochMs(dateStr: string | undefined | null): number {
  if (!dateStr) return Date.now();
  return new Date(dateStr).getTime();
}

function buildOcsfFinding(result: ComplianceResultWithNotes, resource: Resource) {
  const rule = result.rule;
  const severity = rule?.severity ?? 'info';
  const notes = (result.notes ?? []).map(n => ({
    uid: n.id,
    text: n.note,
    author: n.author_name ?? '',
    time: toEpochMs(n.created_at),
  }));

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
    severity: severity.charAt(0).toUpperCase() + severity.slice(1),
    severity_id: severityId(severity),
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
      control: rule?.name ?? result.rule_id,
      desc: rule?.description ?? '',
      requirements: [],
      standards: [],
      status: statusLabel(result.status),
      status_id: statusId(result.status),
    },
    finding: {
      uid: result.id,
      title: rule?.name ?? result.rule_id,
      desc: rule?.description ?? '',
      created_time: toEpochMs(result.evaluated_at),
      modified_time: toEpochMs(result.evaluated_at),
      notes,
      supporting_data: {
        acknowledged: result.acknowledged,
        acknowledged_note: result.acknowledged_note ?? '',
        acknowledged_at: result.acknowledged_at ?? '',
      },
    },
    resources: [
      {
        uid: resource.id,
        name: resource.label,
        type: resource.resource_type,
        cloud_partition: resource.region ?? '',
        region: resource.region ?? '',
        attributes: {
          plan_type: resource.plan_type ?? '',
          status: resource.status ?? '',
          monthly_cost: resource.monthly_cost,
          last_synced_at: resource.last_synced_at ?? '',
        },
      },
    ],
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

function safeName(label: string) {
  return label.replace(/[^a-z0-9]/gi, '_');
}

export function exportResourceOcsf(resource: Resource, results: ComplianceResultWithNotes[]): void {
  const findings = results.map(r => buildOcsfFinding(r, resource));

  const bundle = {
    schema_version: OCSF_SCHEMA_VERSION,
    source: { product: PRODUCT_NAME, vendor: PRODUCT_VENDOR },
    resource: {
      uid: resource.id,
      name: resource.label,
      type: resource.resource_type,
      region: resource.region ?? '',
    },
    count: findings.length,
    findings,
  };

  const filename = `${safeName(resource.label)}_resource.ocsf.json`;
  triggerDownload(JSON.stringify(bundle, null, 2), filename);
}

export type { ComplianceResultWithNotes, NoteEntry };
