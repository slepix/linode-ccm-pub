import { Resource } from '../api/resources';
import { ComplianceResult } from '../api/compliance';

interface NoteEntry {
  id: string;
  note: string;
  created_at: string;
  author_name?: string;
}

interface ComplianceResultWithNotes extends ComplianceResult {
  notes?: NoteEntry[];
}

function csvCell(value: string | number | boolean | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function rowsToCsv(rows: string[][]): string {
  return rows.map(row => row.map(csvCell).join(',')).join('\n');
}

function buildRows(resource: Resource, results: ComplianceResultWithNotes[]): string[][] {
  const typeLabel = resource.resource_type.replace(/_/g, ' ');

  const meta: string[][] = [
    ['Resource', resource.label],
    ['Type', typeLabel],
    ['Region', resource.region ?? ''],
    ['Status', resource.status ?? ''],
    ['Last Synced', resource.last_synced_at ?? ''],
    ['Exported', new Date().toLocaleString()],
    [],
    ['Rule', 'Severity', 'Status', 'Acknowledged', 'Acknowledged Note', 'Detail'],
  ];

  const rows = results.map(r => [
    r.rule?.name ?? r.rule_id,
    r.rule?.severity ?? '',
    r.status.replace(/_/g, ' '),
    r.acknowledged ? 'Yes' : 'No',
    r.acknowledged_note ?? '',
    r.detail ?? '',
  ]);

  return [...meta, ...rows];
}

function triggerDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
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

export function exportResourceCsv(resource: Resource, results: ComplianceResultWithNotes[]): void {
  const rows = buildRows(resource, results);
  const csv = rowsToCsv(rows);
  triggerDownload(csv, `${safeName(resource.label)}_resource.csv`, 'text/csv;charset=utf-8;');
}

export function exportResourceXls(resource: Resource, results: ComplianceResultWithNotes[]): void {
  const rows = buildRows(resource, results);

  const xmlRows = rows.map(row =>
    '<Row>' + row.map(cell =>
      `<Cell><Data ss:Type="String">${String(cell).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</Data></Cell>`
    ).join('') + '</Row>'
  ).join('\n');

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Resource">
  <Table>
${xmlRows}
  </Table>
 </Worksheet>
</Workbook>`;

  triggerDownload(xml, `${safeName(resource.label)}_resource.xls`, 'application/vnd.ms-excel;charset=utf-8;');
}

export type { ComplianceResultWithNotes, NoteEntry };
