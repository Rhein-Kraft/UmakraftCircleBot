/**
 * fantracking/reports/linkList.js
 * ──────────────────────────────────
 * renderLinkList — Discord ↔ Uma.moe linked member table image
 */

import { renderHtml } from '../../utils/imageReport-browser.js';
import { esc, trainerColor, FONT_IMPORT } from './ImageReportStandard.js';

export async function renderLinkList(data) {
  const rows = (data.rows || [])
    .map((r, i) => {
      const rowBg     = i % 2 === 0 ? 'rgba(240,98,146,0.04)' : '#ffffff';
      const nameColor = r.status === 'missing' ? '#c62828' : trainerColor(r.trainerName);
      const badge     = r.status === 'missing'
        ? `<span class="badge missing">LEFT</span>`
        : `<span class="badge linked">LINKED</span>`;

      return `<tr style="background:${rowBg}">
        <td class="td-num">${r.index}</td>
        <td class="td-discord" style="color:#1a1a1a">${esc(r.discordName)}</td>
        <td class="td-trainer" style="color:${nameColor}">${esc(r.trainerName)}${badge}</td>
        <td class="td-id">${esc(r.trainerId)}</td>
        <td class="td-circle">${esc(r.circleName)}</td>
      </tr>`;
    })
    .join('');

  const emptyRow = `<tr><td colspan="5" style="text-align:center;padding:28px;color:rgba(0,0,0,0.35);font-size:13px;font-weight:700">No links found</td></tr>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
${FONT_IMPORT}
* { margin:0;padding:0;box-sizing:border-box; }
body {
  background:#ffffff;
  font-family:'Noto Sans JP','Noto Sans Symbols 2','Noto Color Emoji',system-ui,-apple-system,Arial,sans-serif;
  color:#1a1a1a;
  font-weight:700;
  display:inline-block;
  width:720px;
}
.card {
  background:#ffffff;
  overflow:hidden;
  border:1.5px solid #000000;
  border-radius:6px;
}
.header {
  padding:14px 18px 10px;
  background:linear-gradient(135deg,#f06292 0%,#ec407a 100%);
}
.htitle { font-size:16px;font-weight:900;color:#ffffff; }
.hsub { font-size:11px;color:rgba(255,255,255,0.72);margin-top:3px;font-weight:700; }
table { width:100%;border-collapse:collapse; }
thead th {
  padding:6px 8px;
  font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;
  color:rgba(0,0,0,0.42);
  border-bottom:1.5px solid #000000;
  background:#fafafa;
}
thead th:first-child { padding-left:14px; }
thead th:last-child  { padding-right:14px; }
td { border-bottom:1.5px solid #000000;font-size:12px;font-weight:700; }
.td-num     { padding:8px 6px 8px 14px;font-size:11px;font-weight:700;color:rgba(0,0,0,0.35);min-width:30px;text-align:center; }
.td-discord { padding:8px 6px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.td-trainer { padding:8px 6px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.td-id      { padding:8px 6px;font-size:11px;color:rgba(0,0,0,0.45);font-family:monospace;white-space:nowrap; }
.td-circle  { padding:8px 14px 8px 6px;font-size:11px;color:rgba(0,0,0,0.45);white-space:nowrap; }
.badge {
  display:inline-block;font-size:8px;font-weight:700;padding:1px 5px;
  border-radius:3px;margin-left:5px;vertical-align:middle;white-space:nowrap;
}
.badge.linked { background:rgba(46,125,50,0.10);color:#2e7d32;border:1px solid rgba(46,125,50,0.28); }
.badge.missing { background:rgba(198,40,40,0.10);color:#c62828;border:1px solid rgba(198,40,40,0.28); }
.footer { padding:9px 18px;border-top:1.5px solid #000000;font-size:10px;color:rgba(0,0,0,0.38);display:flex;justify-content:space-between;font-weight:700; }
.summary-row { display:flex;gap:20px;padding:10px 18px;border-bottom:1.5px solid #000000;background:#fafafa; }
.stat { font-size:11px;font-weight:700;color:rgba(0,0,0,0.55); }
.stat span { font-size:15px;font-weight:800;color:#1a1a1a;margin-right:4px; }
</style></head>
<body><div class="card">
  <div style="height:3px;background:linear-gradient(90deg,#f06292,#ec407a)"></div>
  <div class="header">
    <div class="htitle">🔗 Link List — Discord ↔ Uma.moe</div>
    <div class="hsub">${esc(String(data.total ?? 0))} linked · ${esc(String(data.missing ?? 0))} not in circle · ${esc(data.date ?? '')}</div>
  </div>
  <table>
    <thead><tr>
      <th style="text-align:center">#</th>
      <th style="text-align:left">Discord Name</th>
      <th style="text-align:left">Trainer Name</th>
      <th style="text-align:left">Trainer ID</th>
      <th style="text-align:left">Circle</th>
    </tr></thead>
    <tbody>${rows || emptyRow}</tbody>
  </table>
  <div class="footer">
    <span>UmaKraft · Discord ↔ uma.moe link registry</span>
    <span>${esc(data.date ?? '')}</span>
  </div>
</div></body></html>`;

  return renderHtml(html, 720);
}
