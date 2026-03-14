import { Report, ReportSnapshot, ReportResult } from '../api/reports';

function csvCell(value: string | number | boolean | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function buildRows(snap: ReportSnapshot): string[][] {
  const headers = [
    'Rule', 'Severity', 'Rule Description',
    'Resource', 'Resource Type', 'Region',
    'Status', 'Acknowledged', 'Acknowledged Note', 'Evaluated At', 'Detail',
  ];

  const rows: string[][] = snap.results.map((r: ReportResult) => [
    r.rule_name,
    r.severity,
    r.rule_description ?? '',
    r.resource_label ?? '',
    (r.resource_type ?? '').replace(/_/g, ' '),
    r.region ?? '',
    r.status.replace(/_/g, ' '),
    r.acknowledged ? 'Yes' : 'No',
    r.acknowledged_note ?? '',
    r.evaluated_at,
    r.detail ?? '',
  ]);

  return [headers, ...rows];
}

function buildMetaRows(report: Report, snap: ReportSnapshot): string[][] {
  const profiles = (snap.active_profiles ?? []).map(p => p.name).join('; ') || 'None';
  return [
    ['Report Title', report.title],
    ['Account', snap.account_name],
    ['Period', `${snap.period_start} to ${snap.period_end}`],
    ['Quarter', report.quarter ?? ''],
    ['Generated At', snap.generated_at],
    ['Compliance Score', snap.summary.compliance_score != null ? `${snap.summary.compliance_score}%` : 'N/A'],
    ['Total Checks', String(snap.summary.total_checks)],
    ['Compliant', String(snap.summary.compliant)],
    ['Non-Compliant', String(snap.summary.non_compliant)],
    ['Acknowledged', String(snap.summary.acknowledged)],
    ['Active Security Profiles', profiles],
    [],
  ];
}

function rowsToCsv(rows: string[][]): string {
  return rows.map(row => row.map(csvCell).join(',')).join('\n');
}

export function exportReportCsv(report: Report): void {
  const snap = report.snapshot as ReportSnapshot | null;
  if (!snap) return;

  const meta = buildMetaRows(report, snap);
  const data = buildRows(snap);
  const csv = rowsToCsv([...meta, ...data]);

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${report.title.replace(/[^a-z0-9]/gi, '_')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportReportXls(report: Report): void {
  const snap = report.snapshot as ReportSnapshot | null;
  if (!snap) return;

  const meta = buildMetaRows(report, snap);
  const data = buildRows(snap);
  const allRows = [...meta, ...data];

  const xmlRows = allRows.map(row =>
    '<Row>' + row.map(cell =>
      `<Cell><Data ss:Type="String">${String(cell).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</Data></Cell>`
    ).join('') + '</Row>'
  ).join('\n');

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Report">
  <Table>
${xmlRows}
  </Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${report.title.replace(/[^a-z0-9]/gi, '_')}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
