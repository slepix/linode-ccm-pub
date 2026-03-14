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

function esc(str: string | null | undefined): string {
  if (str == null) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function severityColor(s: string): string {
  if (s === 'critical') return '#ef4444';
  if (s === 'warning') return '#f59e0b';
  return '#3b82f6';
}

function severityBg(s: string): string {
  if (s === 'critical') return '#fef2f2';
  if (s === 'warning') return '#fffbeb';
  return '#eff6ff';
}

function statusColor(s: string): string {
  if (s === 'compliant') return '#16a34a';
  if (s === 'non_compliant') return '#dc2626';
  return '#6b7280';
}

function statusBg(s: string): string {
  if (s === 'compliant') return '#f0fdf4';
  if (s === 'non_compliant') return '#fef2f2';
  return '#f9fafb';
}

function renderSpecsTable(specs: Record<string, unknown>): string {
  const flatten = (obj: Record<string, unknown>, prefix = ''): Array<[string, string]> => {
    const rows: Array<[string, string]> = [];
    for (const [k, v] of Object.entries(obj)) {
      const label = (prefix ? `${prefix} / ` : '') + k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      if (v == null || v === '') continue;
      if (typeof v === 'object' && !Array.isArray(v)) {
        rows.push(...flatten(v as Record<string, unknown>, label));
      } else if (Array.isArray(v)) {
        if (v.length === 0) continue;
        if (typeof v[0] === 'string' || typeof v[0] === 'number') {
          rows.push([label, v.join(', ')]);
        } else {
          rows.push([label, JSON.stringify(v, null, 2)]);
        }
      } else {
        rows.push([label, String(v)]);
      }
    }
    return rows;
  };

  const rows = flatten(specs);
  if (!rows.length) return '<p style="color:#6b7280;font-size:13px">No spec data available.</p>';

  return `
    <table class="spec-table">
      <tbody>
        ${rows.map(([label, value], i) => `
          <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#ffffff'}">
            <td class="spec-label">${esc(label)}</td>
            <td class="spec-value">${esc(value)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

function renderComplianceSection(results: ComplianceResultWithNotes[]): string {
  if (!results.length) {
    return '<p style="color:#6b7280;font-size:13px;margin:0">No compliance checks found for this resource.</p>';
  }

  return results.map(r => {
    const rule = r.rule;
    const sev = rule?.severity ?? 'info';
    const stat = r.status;
    const notesHtml = r.notes?.length
      ? `<div class="notes-section">
          <div class="notes-title">Notes</div>
          ${r.notes.map(n => `
            <div class="note-item">
              <div class="note-meta">${esc(n.author_name ?? 'Unknown')} &middot; ${formatDate(n.created_at)}</div>
              <div class="note-text">${esc(n.note)}</div>
            </div>
          `).join('')}
        </div>`
      : '';

    const ackHtml = r.acknowledged
      ? `<div class="ack-box">
          <span class="ack-badge">Acknowledged</span>
          ${r.acknowledged_at ? `<span class="ack-meta"> on ${formatDate(r.acknowledged_at)}</span>` : ''}
          ${r.acknowledged_note ? `<div class="ack-note">${esc(r.acknowledged_note)}</div>` : ''}
        </div>`
      : '';

    return `
      <div class="compliance-card">
        <div class="compliance-header">
          <div style="flex:1;min-width:0">
            <span class="rule-name">${esc(rule?.name ?? r.rule_id)}</span>
            ${rule?.description ? `<div class="rule-desc">${esc(rule.description)}</div>` : ''}
          </div>
          <div class="badge-group">
            <span class="badge" style="background:${severityBg(sev)};color:${severityColor(sev)};border:1px solid ${severityColor(sev)}40">${sev.toUpperCase()}</span>
            <span class="badge" style="background:${statusBg(stat)};color:${statusColor(stat)};border:1px solid ${statusColor(stat)}40">${stat.replace('_', ' ').toUpperCase()}</span>
          </div>
        </div>
        ${r.detail ? `<div class="detail-text">${esc(r.detail)}</div>` : ''}
        ${ackHtml}
        ${notesHtml}
      </div>`;
  }).join('');
}

function buildHtml(resource: Resource, complianceResults: ComplianceResultWithNotes[]): string {
  const totalChecks = complianceResults.length;
  const nonCompliant = complianceResults.filter(r => r.status === 'non_compliant').length;
  const compliant = complianceResults.filter(r => r.status === 'compliant').length;
  const acknowledged = complianceResults.filter(r => r.acknowledged).length;
  const critical = complianceResults.filter(r => r.rule?.severity === 'critical' && r.status === 'non_compliant').length;

  const typeLabel = resource.resource_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Resource Report – ${esc(resource.label)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; background: #fff; padding: 40px 48px; font-size: 13px; line-height: 1.5; }
  .header { border-bottom: 2px solid #111827; padding-bottom: 20px; margin-bottom: 28px; }
  .header-top { display: flex; align-items: flex-start; justify-content: space-between; }
  .report-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin-bottom: 6px; }
  .resource-name { font-size: 24px; font-weight: 700; color: #111827; }
  .resource-meta { display: flex; gap: 16px; margin-top: 10px; flex-wrap: wrap; }
  .meta-item { display: flex; align-items: center; gap: 4px; font-size: 12px; color: #6b7280; }
  .meta-val { color: #374151; font-weight: 500; }
  .generated { font-size: 11px; color: #9ca3af; text-align: right; }
  .section { margin-bottom: 32px; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #374151; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; margin-bottom: 14px; }
  .summary-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
  .summary-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; text-align: center; }
  .summary-num { font-size: 22px; font-weight: 700; color: #111827; }
  .summary-num.red { color: #dc2626; }
  .summary-num.green { color: #16a34a; }
  .summary-num.amber { color: #d97706; }
  .summary-label { font-size: 11px; color: #6b7280; margin-top: 3px; }
  .spec-table { width: 100%; border-collapse: collapse; }
  .spec-table td { padding: 6px 10px; font-size: 12px; border: 1px solid #e5e7eb; vertical-align: top; }
  .spec-label { font-weight: 600; color: #374151; width: 35%; background: #f9fafb; }
  .spec-value { color: #111827; font-family: 'Menlo', 'Courier New', monospace; word-break: break-all; }
  .compliance-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; margin-bottom: 10px; page-break-inside: avoid; }
  .compliance-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
  .rule-name { font-weight: 600; font-size: 13px; color: #111827; }
  .rule-desc { font-size: 11px; color: #6b7280; margin-top: 3px; }
  .badge-group { display: flex; gap: 6px; flex-shrink: 0; }
  .badge { display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px; white-space: nowrap; }
  .detail-text { font-size: 12px; color: #374151; background: #f9fafb; border-left: 3px solid #e5e7eb; padding: 8px 10px; border-radius: 0 4px 4px 0; margin-top: 6px; }
  .ack-box { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 8px; }
  .ack-badge { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px; }
  .ack-meta { font-size: 11px; color: #6b7280; }
  .ack-note { width: 100%; font-size: 11px; color: #374151; font-style: italic; }
  .notes-section { margin-top: 10px; border-top: 1px dashed #e5e7eb; padding-top: 8px; }
  .notes-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #9ca3af; margin-bottom: 6px; }
  .note-item { background: #f9fafb; border-radius: 4px; padding: 7px 10px; margin-bottom: 5px; }
  .note-meta { font-size: 10px; color: #9ca3af; margin-bottom: 2px; }
  .note-text { font-size: 12px; color: #374151; }
  .footer { border-top: 1px solid #e5e7eb; padding-top: 14px; margin-top: 32px; display: flex; justify-content: space-between; font-size: 11px; color: #9ca3af; }
  @media print {
    body { padding: 20px 28px; }
    .compliance-card { page-break-inside: avoid; }
    .section { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<div class="header">
  <div class="header-top">
    <div>
      <div class="report-label">Resource Report</div>
      <div class="resource-name">${esc(resource.label)}</div>
      <div class="resource-meta">
        <span class="meta-item">Type: <span class="meta-val">${esc(typeLabel)}</span></span>
        ${resource.region ? `<span class="meta-item">Region: <span class="meta-val">${esc(resource.region)}</span></span>` : ''}
        ${resource.status ? `<span class="meta-item">Status: <span class="meta-val">${esc(resource.status)}</span></span>` : ''}
        ${resource.last_synced_at ? `<span class="meta-item">Last Synced: <span class="meta-val">${formatDate(resource.last_synced_at)}</span></span>` : ''}
      </div>
    </div>
    <div class="generated">Generated<br/>${new Date().toLocaleString()}</div>
  </div>
</div>

<div class="section">
  <div class="section-title">Compliance Summary</div>
  <div class="summary-grid">
    <div class="summary-card">
      <div class="summary-num">${totalChecks}</div>
      <div class="summary-label">Total Checks</div>
    </div>
    <div class="summary-card">
      <div class="summary-num green">${compliant}</div>
      <div class="summary-label">Compliant</div>
    </div>
    <div class="summary-card">
      <div class="summary-num red">${nonCompliant}</div>
      <div class="summary-label">Non-Compliant</div>
    </div>
    <div class="summary-card">
      <div class="summary-num amber">${critical}</div>
      <div class="summary-label">Critical Issues</div>
    </div>
    <div class="summary-card">
      <div class="summary-num">${acknowledged}</div>
      <div class="summary-label">Acknowledged</div>
    </div>
  </div>
</div>

<div class="section">
  <div class="section-title">Specifications</div>
  ${resource.specs && Object.keys(resource.specs).length > 0
    ? renderSpecsTable(resource.specs)
    : '<p style="color:#6b7280;font-size:13px">No specification data available.</p>'}
</div>

<div class="section">
  <div class="section-title">Compliance Checks (${totalChecks})</div>
  ${renderComplianceSection(complianceResults)}
</div>

<div class="footer">
  <span>${esc(resource.label)} &middot; ${esc(typeLabel)}</span>
  <span>Exported ${new Date().toLocaleString()}</span>
</div>

</body>
</html>`;
}

export async function exportResourcePdf(
  resource: Resource,
  accountId: string,
  fetchComplianceResults: (resourceId: string, accountId: string) => Promise<ComplianceResult[]>,
  fetchNotes: (resultId: string) => Promise<NoteEntry[]>,
): Promise<void> {
  const rawResults = await fetchComplianceResults(resource.id, accountId);

  const results: ComplianceResultWithNotes[] = await Promise.all(
    rawResults.map(async r => {
      try {
        const notes = await fetchNotes(r.id);
        return { ...r, notes };
      } catch {
        return { ...r, notes: [] };
      }
    })
  );

  const html = buildHtml(resource, results);

  const win = window.open('', '_blank');
  if (!win) return;

  win.document.write(html);
  win.document.close();

  win.addEventListener('load', () => {
    setTimeout(() => win.print(), 300);
  });
}
