import { Report, ReportSnapshot, ReportResult, ReportRuleSummary } from '../api/reports';

function esc(s: string | null | undefined): string {
  if (s == null) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function sevColor(s: string) {
  if (s === 'critical') return '#dc2626';
  if (s === 'warning') return '#d97706';
  return '#2563eb';
}
function sevBg(s: string) {
  if (s === 'critical') return '#fef2f2';
  if (s === 'warning') return '#fffbeb';
  return '#eff6ff';
}

function statusColor(s: string) {
  if (s === 'compliant') return '#16a34a';
  if (s === 'non_compliant') return '#dc2626';
  return '#6b7280';
}
function statusBg(s: string) {
  if (s === 'compliant') return '#f0fdf4';
  if (s === 'non_compliant') return '#fef2f2';
  return '#f9fafb';
}

function badge(text: string, fg: string, bg: string, border: string) {
  return `<span style="display:inline-block;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:${bg};color:${fg};border:1px solid ${border};white-space:nowrap">${esc(text)}</span>`;
}

function progressBar(pct: number) {
  const color = pct >= 80 ? '#16a34a' : pct >= 60 ? '#d97706' : '#dc2626';
  return `
    <div style="display:flex;align-items:center;gap:8px">
      <div style="flex:1;height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden">
        <div style="width:${pct.toFixed(1)}%;height:100%;background:${color};border-radius:3px"></div>
      </div>
      <span style="font-size:11px;color:#6b7280;min-width:32px;text-align:right">${pct.toFixed(0)}%</span>
    </div>`;
}

function scoreArc(score: number | null): string {
  const s = score ?? 0;
  const color = s >= 80 ? '#16a34a' : s >= 60 ? '#d97706' : '#dc2626';
  const r = 44;
  const circ = 2 * Math.PI * r;
  const offset = circ - (s / 100) * circ;
  return `
    <svg width="112" height="112" style="transform:rotate(-90deg)">
      <circle cx="56" cy="56" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="8"/>
      <circle cx="56" cy="56" r="${r}" fill="none" stroke="${color}" stroke-width="8"
        stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
        stroke-linecap="round"/>
    </svg>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
      ${score !== null
        ? `<span style="font-size:24px;font-weight:800;color:${color}">${s.toFixed(0)}</span><span style="font-size:11px;color:#6b7280">%</span>`
        : `<span style="font-size:12px;color:#9ca3af">N/A</span>`
      }
    </div>`;
}

function renderResultRow(r: ReportResult, i: number): string {
  const bg = i % 2 === 0 ? '#f9fafb' : '#fff';
  return `
    <tr style="background:${bg}">
      <td style="padding:7px 10px;font-size:12px;color:#111827;font-weight:600;border-bottom:1px solid #e5e7eb">${esc(r.rule_name)}</td>
      <td style="padding:7px 10px;font-size:12px;border-bottom:1px solid #e5e7eb">${badge(r.severity, sevColor(r.severity), sevBg(r.severity), sevColor(r.severity) + '33')}</td>
      <td style="padding:7px 10px;font-size:12px;color:#374151;border-bottom:1px solid #e5e7eb">${esc(r.resource_label ?? '—')}</td>
      <td style="padding:7px 10px;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;text-transform:capitalize">${esc((r.resource_type ?? '—').replace(/_/g, ' '))}</td>
      <td style="padding:7px 10px;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb">${esc(r.region ?? '—')}</td>
      <td style="padding:7px 10px;font-size:12px;border-bottom:1px solid #e5e7eb">${badge(r.status.replace('_', ' ').toUpperCase(), statusColor(r.status), statusBg(r.status), statusColor(r.status) + '33')}</td>
      <td style="padding:7px 10px;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb">${r.acknowledged ? '<span style="color:#16a34a;font-weight:600">Yes</span>' : 'No'}</td>
      <td style="padding:7px 10px;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;max-width:200px;word-break:break-word">${esc(r.detail ?? '—')}</td>
    </tr>`;
}

function renderRuleSection(name: string, rs: ReportRuleSummary, results: ReportResult[]): string {
  const total = rs.compliant + rs.non_compliant + rs.not_applicable;
  const pct = total > 0 ? (rs.compliant / (rs.compliant + rs.non_compliant || 1)) * 100 : 100;

  return `
    <div style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:10px;overflow:hidden;page-break-inside:avoid">
      <div style="background:#f9fafb;padding:12px 14px;border-bottom:1px solid #e5e7eb">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px">
          <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
            <div style="width:8px;height:8px;border-radius:50%;background:${sevColor(rs.severity)};flex-shrink:0"></div>
            <span style="font-size:13px;font-weight:600;color:#111827">${esc(name)}</span>
            ${badge(rs.severity.toUpperCase(), sevColor(rs.severity), sevBg(rs.severity), sevColor(rs.severity) + '33')}
          </div>
          <div style="display:flex;gap:12px;font-size:12px;flex-shrink:0">
            <span style="color:#16a34a;font-weight:600">${rs.compliant} compliant</span>
            <span style="color:#dc2626;font-weight:600">${rs.non_compliant} non-compliant</span>
            ${rs.acknowledged > 0 ? `<span style="color:#d97706">${rs.acknowledged} ack'd</span>` : ''}
          </div>
        </div>
        ${progressBar(pct)}
      </div>
      ${results.length > 0 ? `
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#f9fafb;border-bottom:1px solid #e5e7eb">
              <th style="padding:6px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280">Resource</th>
              <th style="padding:6px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280">Type</th>
              <th style="padding:6px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280">Region</th>
              <th style="padding:6px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280">Status</th>
              <th style="padding:6px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280">Ack</th>
              <th style="padding:6px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280">Detail</th>
            </tr>
          </thead>
          <tbody>
            ${results.map((r, i) => `
              <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'}">
                <td style="padding:6px 10px;color:#374151;font-weight:500;border-bottom:1px solid #f3f4f6">${esc(r.resource_label ?? '—')}</td>
                <td style="padding:6px 10px;color:#6b7280;border-bottom:1px solid #f3f4f6;text-transform:capitalize">${esc((r.resource_type ?? '—').replace(/_/g, ' '))}</td>
                <td style="padding:6px 10px;color:#6b7280;border-bottom:1px solid #f3f4f6">${esc(r.region ?? '—')}</td>
                <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6">${badge(r.status.replace('_', ' ').toUpperCase(), statusColor(r.status), statusBg(r.status), statusColor(r.status) + '33')}</td>
                <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6">${r.acknowledged ? '<span style="color:#16a34a;font-weight:600">Yes</span>' : '<span style="color:#9ca3af">No</span>'}</td>
                <td style="padding:6px 10px;color:#6b7280;border-bottom:1px solid #f3f4f6;word-break:break-word">${esc(r.detail ?? '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<p style="padding:10px 14px;font-size:12px;color:#9ca3af;font-style:italic">No results for this rule.</p>'}
    </div>`;
}

function buildHtml(report: Report, snap: ReportSnapshot): string {
  const summary = snap.summary;
  const score = summary.compliance_score;

  const sortedRules = Object.entries(snap.rule_summary).sort((a, b) => {
    const ord: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    const diff = (ord[a[1].severity] ?? 3) - (ord[b[1].severity] ?? 3);
    return diff !== 0 ? diff : b[1].non_compliant - a[1].non_compliant;
  });

  const nonCompliant = snap.results.filter(r => r.status === 'non_compliant');
  const allResults = snap.results;

  const criticalCount = snap.results.filter(r => r.severity === 'critical' && r.status === 'non_compliant').length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${esc(report.title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; background: #fff; padding: 40px 48px; font-size: 13px; line-height: 1.6; }
  h1 { font-size: 26px; font-weight: 800; color: #111827; }
  h2 { font-size: 14px; font-weight: 700; color: #111827; margin-bottom: 12px; }
  .section { margin-bottom: 32px; }
  .section-header { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #374151; padding-bottom: 8px; border-bottom: 2px solid #e5e7eb; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; padding: 8px 10px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; }
  @media print {
    body { padding: 20px 28px; }
    .page-break { page-break-before: always; padding-top: 20px; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<!-- COVER -->
<div style="border-bottom:2px solid #111827;padding-bottom:24px;margin-bottom:32px;display:flex;justify-content:space-between;align-items:flex-start">
  <div style="flex:1">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;margin-bottom:6px">Compliance Report</div>
    <h1>${esc(report.title)}</h1>
    <div style="margin-top:10px;font-size:13px;color:#6b7280">
      <span>${esc(snap.account_name)}</span>
      &nbsp;&middot;&nbsp;
      <span>${fmtDate(snap.period_start)} &ndash; ${fmtDate(snap.period_end)}</span>
      ${report.quarter ? `&nbsp;&middot;&nbsp;<span style="font-weight:600;color:#374151">${esc(report.quarter)}</span>` : ''}
    </div>
    ${report.description ? `<p style="margin-top:10px;font-size:13px;color:#374151;max-width:600px;line-height:1.5">${esc(report.description)}</p>` : ''}
    <div style="margin-top:8px;font-size:11px;color:#9ca3af">
      Generated ${fmtDateTime(snap.generated_at)}
      &nbsp;&middot;&nbsp;
      Exported ${new Date().toLocaleString()}
    </div>
  </div>
  <div style="position:relative;width:112px;height:112px;flex-shrink:0;margin-left:24px">
    ${scoreArc(score)}
  </div>
</div>

${(snap.active_profiles ?? []).length > 0 ? `
<!-- SECURITY PROFILES -->
<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:14px 18px;margin-bottom:24px;display:flex;align-items:flex-start;gap:14px">
  <div style="flex-shrink:0;margin-top:2px">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0369a1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
  </div>
  <div>
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#0369a1;margin-bottom:6px">Active Security Profiles</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">
      ${(snap.active_profiles ?? []).map(p => `
        <div style="background:#fff;border:1px solid #7dd3fc;border-radius:6px;padding:5px 10px">
          <div style="font-size:12px;font-weight:700;color:#0c4a6e">${esc(p.name)}</div>
          ${p.tier ? `<div style="font-size:10px;color:#0369a1;text-transform:uppercase;letter-spacing:0.04em;margin-top:1px">${esc(p.tier)}</div>` : ''}
          ${p.description ? `<div style="font-size:11px;color:#374151;margin-top:2px;max-width:260px">${esc(p.description)}</div>` : ''}
        </div>
      `).join('')}
    </div>
  </div>
</div>` : `
<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 16px;margin-bottom:24px;font-size:12px;color:#6b7280">
  <strong style="color:#374151">Active Security Profiles:</strong> None configured
</div>`}

<!-- SUMMARY CARDS -->
<div class="section">
  <div class="section-header">Executive Summary</div>
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:20px">
    ${[
      { label: 'Compliance Score', value: score != null ? `${score.toFixed(0)}%` : 'N/A', color: score == null ? '#6b7280' : score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626' },
      { label: 'Total Checks', value: String(summary.total_checks), color: '#111827' },
      { label: 'Compliant', value: String(summary.compliant), color: '#16a34a' },
      { label: 'Non-Compliant', value: String(summary.non_compliant), color: '#dc2626' },
      { label: 'Critical Issues', value: String(criticalCount), color: '#dc2626' },
    ].map(c => `
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:${c.color}">${esc(c.value)}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:3px;text-transform:uppercase;letter-spacing:0.04em">${esc(c.label)}</div>
      </div>
    `).join('')}
  </div>

  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">
    <!-- Resources by type -->
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#374151;margin-bottom:10px">Resources by Type</div>
      <table style="width:100%;border-collapse:collapse">
        ${Object.entries(summary.resources_by_type).map(([type, count], i) => `
          <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'}">
            <td style="padding:4px 8px;font-size:12px;color:#374151;text-transform:capitalize;border-bottom:1px solid #e5e7eb">${esc(type.replace(/_/g, ' '))}</td>
            <td style="padding:4px 8px;font-size:12px;font-weight:700;color:#111827;text-align:right;border-bottom:1px solid #e5e7eb">${count}</td>
          </tr>
        `).join('')}
      </table>
    </div>
    <!-- Stats -->
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#374151;margin-bottom:10px">Check Breakdown</div>
      <table style="width:100%;border-collapse:collapse">
        ${[
          { label: 'Total Resources', value: String(summary.total_resources) },
          { label: 'Total Checks', value: String(summary.total_checks) },
          { label: 'Compliant', value: String(summary.compliant) },
          { label: 'Non-Compliant', value: String(summary.non_compliant) },
          { label: 'Acknowledged', value: String(summary.acknowledged) },
          { label: 'Rules Evaluated', value: String(Object.keys(snap.rule_summary).length) },
        ].map((item, i) => `
          <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'}">
            <td style="padding:4px 8px;font-size:12px;color:#374151;border-bottom:1px solid #e5e7eb">${esc(item.label)}</td>
            <td style="padding:4px 8px;font-size:12px;font-weight:700;color:#111827;text-align:right;border-bottom:1px solid #e5e7eb">${esc(item.value)}</td>
          </tr>`).join('')}
      </table>
    </div>
  </div>
</div>

<!-- RULE SUMMARY -->
<div class="section page-break">
  <div class="section-header">Rule-by-Rule Summary (${sortedRules.length} rules)</div>
  ${sortedRules.map(([name, rs]) => {
    const ruleResults = snap.results.filter(r => r.rule_name === name);
    return renderRuleSection(name, rs, ruleResults);
  }).join('')}
</div>

<!-- NON-COMPLIANT FINDINGS TABLE -->
${nonCompliant.length > 0 ? `
<div class="section page-break">
  <div class="section-header">Non-Compliant Findings (${nonCompliant.length})</div>
  <table>
    <thead>
      <tr>
        <th>Rule</th>
        <th>Severity</th>
        <th>Resource</th>
        <th>Type</th>
        <th>Region</th>
        <th>Status</th>
        <th>Ack</th>
        <th>Detail</th>
      </tr>
    </thead>
    <tbody>
      ${nonCompliant.map((r, i) => renderResultRow(r, i)).join('')}
    </tbody>
  </table>
</div>
` : ''}

<!-- ALL RESULTS -->
<div class="section page-break">
  <div class="section-header">All Compliance Results (${allResults.length})</div>
  <table>
    <thead>
      <tr>
        <th>Rule</th>
        <th>Severity</th>
        <th>Resource</th>
        <th>Type</th>
        <th>Region</th>
        <th>Status</th>
        <th>Ack</th>
        <th>Detail</th>
      </tr>
    </thead>
    <tbody>
      ${allResults.map((r, i) => renderResultRow(r, i)).join('')}
    </tbody>
  </table>
</div>

<!-- FOOTER -->
<div style="border-top:1px solid #e5e7eb;padding-top:14px;margin-top:24px;display:flex;justify-content:space-between;font-size:11px;color:#9ca3af">
  <span>${esc(snap.account_name)} &middot; ${esc(report.title)}</span>
  <span>Exported ${new Date().toLocaleString()}</span>
</div>

</body>
</html>`;
}

export function exportReportPdf(report: Report): void {
  const snap = report.snapshot as ReportSnapshot | null;
  if (!snap) return;

  const html = buildHtml(report, snap);
  const win = window.open('', '_blank');
  if (!win) return;

  win.document.write(html);
  win.document.close();

  win.addEventListener('load', () => {
    setTimeout(() => win.print(), 300);
  });
}
