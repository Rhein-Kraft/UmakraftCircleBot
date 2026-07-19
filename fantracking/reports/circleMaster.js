/**
 * fantracking/reports/circleMaster.js
 * ──────────────────────────────────────
 * renderCircleMaster    — full month Excel-style day-by-day grid
 * renderCircleMasterDay — single-day ranked view
 */

import { renderHtml } from '../../utils/imageReport-browser.js';
import {
  esc, rankCell, gainColor, FONT_IMPORT, trainerColor, STANDARD_CSS,
} from './ImageReportStandard.js';

export async function renderCircleMaster(data) {
  const accent = '#ec407a';

  function compactNum(n) {
    if (!n || n === 0) return '—';
    if (n >= 1_000_000) {
      const v = n / 1_000_000;
      return (v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)) + 'M';
    }
    if (n >= 1_000) return Math.round(n / 1_000) + 'K';
    return String(n);
  }

  const nameCW = 140;
  const dayCW  = 58;
  const monCW  = 88;
  const totalW = nameCW + data.days.length * dayCW + monCW;

  const dayHeaders = data.days
    .map(d => `<th style="min-width:${dayCW}px;max-width:${dayCW}px;text-align:center;font-size:10px;font-weight:700;color:rgba(0,0,0,0.42);padding:5px 4px;background:#fafafa;border-bottom:1.5px solid #000000">${d}</th>`)
    .join('');

  const dailyReq   = data.dailyReq ?? 0;
  const monthlyReq = data.monthlyReq ?? 0;

  const memberRows = data.members
    .map((m, ri) => {
      const nColor = trainerColor(m.name);
      const cells = m.gains
        .map(g => {
          const v     = compactNum(g);
          // Green = met daily quota, red = below it (no data yet stays neutral grey).
          const color =
            g <= 0 ? 'rgba(0,0,0,0.22)'
            : gainColor(dailyReq > 0 ? Math.round((g / dailyReq) * 100) : 0);
          return `<td style="text-align:center;font-size:11px;color:${color};font-weight:700">${v}</td>`;
        })
        .join('');
      const rowBg   = ri % 2 === 0 ? 'rgba(240,98,146,0.04)' : '#ffffff';
      const monPct  = monthlyReq > 0 ? Math.round((m.monthly / monthlyReq) * 100) : 0;
      const monClr  = gainColor(monPct);
      return `<tr style="background:${rowBg}">
      <td style="padding:6px 10px;font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:${nameCW}px;color:${nColor}">${esc(m.name)}</td>
      ${cells}
      <td style="text-align:right;padding-right:10px;font-size:12px;font-weight:700;color:${monClr};min-width:${monCW}px">${compactNum(m.monthly)}</td>
    </tr>`;
    })
    .join('');

  const totalCells = data.totals
    .map(g => {
      const v = compactNum(g);
      return `<td style="text-align:center;font-size:11px;color:#1565C0;font-weight:700">${v}</td>`;
    })
    .join('');

  const totalRow = `<tr style="background:rgba(21,101,192,0.06);border-top:1px solid rgba(21,101,192,0.18)">
    <td style="padding:6px 10px;font-size:11px;font-weight:700;color:#1565C0">Circle Total</td>
    ${totalCells}
    <td style="text-align:right;padding-right:10px;font-size:12px;font-weight:700;color:#1565C0">${compactNum(data.circleMonthly)}</td>
  </tr>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
${FONT_IMPORT}
* { margin:0;padding:0;box-sizing:border-box; }
body { background:#ffffff;font-family:'Noto Sans JP','Noto Sans Symbols 2','Noto Color Emoji',system-ui,-apple-system,Arial,sans-serif;color:#1a1a1a;font-weight:700;display:inline-block;width:${totalW}px; }
.card { background:#ffffff;position:relative;overflow:hidden;border:1.5px solid #000000;border-radius:6px; }
.accent-bar { height:3px;background:linear-gradient(90deg,#f06292,#ec407a); }
.header { padding:14px 16px 10px;border-bottom:1.5px solid #000000;background:linear-gradient(135deg,#f06292 0%,#ec407a 100%); }
.htitle { font-size:16px;font-weight:900;color:#ffffff; }
.hsub { font-size:11px;color:rgba(255,255,255,0.72);margin-top:4px;font-weight:700; }
table { width:100%;border-collapse:collapse; }
td { border-bottom:1.5px solid #000000; }
.footer { padding:9px 16px;border-top:1.5px solid #000000;font-size:10px;color:rgba(0,0,0,0.38);display:flex;justify-content:space-between;font-weight:700; }
</style></head>
<body><div class="card">
  <div class="accent-bar"></div>
  <div class="header">
    <div class="htitle">${esc(data.circleName ?? 'Circle Master')}</div>
    <div class="hsub">${esc(data.monthLabel ?? '')} · ${data.members.length} members</div>
  </div>
  <table>
    <thead><tr>
      <th style="text-align:left;padding:5px 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:rgba(0,0,0,0.42);background:#fafafa;border-bottom:1.5px solid #000000;min-width:${nameCW}px">Trainer</th>
      ${dayHeaders}
      <th style="text-align:right;padding:5px 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:rgba(0,0,0,0.42);background:#fafafa;border-bottom:1.5px solid #000000;min-width:${monCW}px">Monthly</th>
    </tr></thead>
    <tbody>
      ${memberRows}
      ${totalRow}
    </tbody>
  </table>
  <div class="footer">
    <span>${esc(data.circleName ?? '')} · uma.moe</span>
    <span>${esc(data.date ?? '')}</span>
  </div>
</div></body></html>`;

  return renderHtml(html, totalW);
}

export async function renderCircleMasterDay(data) {
  const rows = (data.rows || [])
    .map(r => `
    <div style="padding:10px 22px;display:flex;align-items:center;gap:10px;border-bottom:1.5px solid #000000">
      ${rankCell(r.rank)}
      <span style="flex:1;font-size:15px;font-weight:700;color:${trainerColor(r.name)};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.name)}</span>
      <span style="font-size:15px;font-weight:700;color:${gainColor(r.pct ?? 0)};min-width:110px;text-align:right">${esc(r.gainStr)}</span>
    </div>`)
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${STANDARD_CSS}
body{width:560px}</style></head>
<body><div class="card">
  <div class="accent-bar"></div>
  <div class="header">
    <div class="hrow">
      <div class="htitle">📊 ${esc(data.circleName)} — Day ${esc(String(data.day))}</div>
      <div class="hdate">${esc(data.date)}</div>
    </div>
    <div class="hsub">Daily gain for ${esc(data.monthLabel ?? '')}</div>
  </div>
  <div style="padding:4px 0 6px;background:#ffffff">${rows}</div>
  <div class="footer">
    <span>${esc(data.circleName)}</span>
    <span>${esc(data.date)}</span>
  </div>
</div></body></html>`;

  return renderHtml(html, 560);
}
