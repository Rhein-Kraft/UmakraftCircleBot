/**
 * utils/reports/fanDeficit.js
 * ────────────────────────────
 * renderDailyDeficitReport   — posted daily at 7:35 AM JST
 * renderWeeklyDeficitReport  — posted daily at 7:35 AM JST
 * renderMonthlyDeficitReport — posted daily at 7:35 AM JST
 *
 * Sort order: lowest gain → top. Quota-met members at bottom with 👍 banner.
 */

import { renderHtml } from '../../utils/imageReport-browser.js';
import { esc, trainerColor, COLORS, STANDARD_CSS } from './ImageReportStandard.js';

// ── Shared helpers ─────────────────────────────────────────────────────────────

function fmt(n) {
  return Number(n ?? 0).toLocaleString('en-US');
}

function pct(gain, quota) {
  if (!quota) return '0.0%';
  return Math.min(100, (gain / quota) * 100).toFixed(1) + '%';
}

/**
 * Build the progress bar HTML for a single member row.
 */
function progressBar(gain, quota) {
  const ratio = quota > 0 ? Math.min(1, gain / quota) : 0;
  const pctW  = (ratio * 100).toFixed(1);
  const color = ratio >= 1 ? COLORS.GREEN : COLORS.RED;
  return `<div class="bar-track"><div class="bar-fill" style="width:${pctW}%;background:${color}"></div></div>`;
}

/**
 * Extra CSS injected into the shared base.
 */
function extraCss() {
  return `
<style>
.deficit-row {
  padding: 9px 22px;
  display: flex; align-items: center; gap: 10px;
}
.deficit-row:nth-child(odd)  { background: rgba(255,255,255,0.022); }
.deficit-row:nth-child(even) { background: transparent; }
.dr-rank  { font-size:14px; font-weight:700; min-width:36px; text-align:right; color:rgba(255,255,255,0.38); flex-shrink:0; }
.dr-name  { flex:1; font-size:15px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dr-gain  { font-size:15px; font-weight:700; min-width:108px; text-align:right; flex-shrink:0; }
.dr-pct   { font-size:11px; color:rgba(255,255,255,0.38); min-width:48px; text-align:right; flex-shrink:0; }
.dr-bars  { min-width:90px; flex-shrink:0; }
.dr-miss  { font-size:11px; color:#ef9a9a; min-width:90px; text-align:right; flex-shrink:0; }
.met-banner {
  margin: 6px 16px 4px;
  background: rgba(102,187,106,0.12);
  border: 1px solid rgba(102,187,106,0.28);
  border-radius: 7px;
  padding: 9px 16px;
  font-size: 13px; font-weight: 700; color: #81c784;
  display: flex; align-items: center; gap: 8px;
}
.met-list  { padding: 0 0 4px; }
.met-row {
  padding: 6px 22px;
  display: flex; align-items: center; gap: 10px;
  font-size: 13px;
}
.met-row:nth-child(odd)  { background: rgba(255,255,255,0.016); }
.met-row:nth-child(even) { background: transparent; }
.met-name { flex:1; color:rgba(255,255,255,0.6); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.met-gain { font-size:13px; font-weight:600; color:#66bb6a; min-width:108px; text-align:right; flex-shrink:0; }
</style>`;
}

/**
 * Build the full HTML card for any deficit period.
 *
 * @param {{
 *   period: 'Daily'|'Weekly'|'Monthly',
 *   accent: string,
 *   circleName: string,
 *   date: string,
 *   quota: number,
 *   quotaLabel: string,
 *   daysLeft?: number,
 *   below: Array<{rank:number, name:string, gain:number}>,
 *   met:   Array<{rank:number, name:string, gain:number}>,
 * }} data
 */
function buildHtml(data) {
  const { period, circleName, date, quota, quotaLabel, daysLeft, below, met } = data;

  // ── Below-quota rows ──────────────────────────────────────────────────────
  const belowRows = below.map((r, i) => {
    const missing = Math.max(0, quota - r.gain);
    const color   = trainerColor(r.name);
    return `
    <div class="deficit-row">
      <span class="dr-rank">#${i + 1}</span>
      <span class="dr-name" style="color:${color}">${esc(r.name)}</span>
      <span class="dr-bars">${progressBar(r.gain, quota)}</span>
      <span class="dr-gain" style="color:${COLORS.RED}">${fmt(r.gain)}</span>
      <span class="dr-pct">${pct(r.gain, quota)}</span>
      <span class="dr-miss">−${fmt(missing)}</span>
    </div>`;
  }).join('');

  // ── Met-quota rows ────────────────────────────────────────────────────────
  const metRows = met.map(r => {
    const color = trainerColor(r.name);
    return `
    <div class="met-row">
      <span class="met-name" style="color:${color}">${esc(r.name)}</span>
      <span class="met-gain">✅ ${fmt(r.gain)}</span>
    </div>`;
  }).join('');

  const metSection = met.length === 0 ? '' : `
  <div class="met-banner">👍 Fan Gain Required Met 🎊 — ${met.length} trainer${met.length !== 1 ? 's' : ''}</div>
  <div class="met-list">${metRows}</div>`;

  // ── Subtitle ──────────────────────────────────────────────────────────────
  const daysNote = daysLeft != null
    ? ` · ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining`
    : '';
  const subtitle = `${circleName} · Goal: ${quotaLabel}${daysNote}`;

  // ── Stat row at bottom ────────────────────────────────────────────────────
  const total = below.length + met.length;
  const footNote = `${below.length} below quota · ${met.length} met · ${total} total`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${STANDARD_CSS}
body{width:680px}</style>${extraCss()}</head>
<body><div class="card">
  <div class="accent-bar"></div>
  <div class="header">
    <div class="hrow">
      <div class="htitle">📉 ${esc(period)} Fan Deficit Report</div>
      <div class="hdate">${esc(date)}</div>
    </div>
    <div class="hsub">${esc(subtitle)}</div>
  </div>
  <div class="col-labels">
    <span style="min-width:36px"></span>
    <span style="flex:1">Trainer</span>
    <span style="min-width:90px">Progress</span>
    <span style="min-width:108px;text-align:right">Gain</span>
    <span style="min-width:48px;text-align:right">%</span>
    <span style="min-width:90px;text-align:right">Missing</span>
  </div>
  <div class="body">${belowRows || '<div class="deficit-row"><span class="dr-name" style="color:rgba(255,255,255,0.4)">All members on track!</span></div>'}</div>
  ${metSection}
  <div class="footer">
    <span>${esc(footNote)}</span>
    <span>UmadolProject</span>
  </div>
</div></body></html>`;

  return html;
}

// ── Public renderers ──────────────────────────────────────────────────────────

/**
 * @param {{
 *   circleName: string, date: string, quota: number,
 *   below: Array<{name:string,gain:number}>,
 *   met:   Array<{name:string,gain:number}>,
 * }} data
 */
export async function renderDailyDeficitReport(data) {
  const html = buildHtml({
    period:     'Daily',
    circleName: data.circleName,
    date:       data.date,
    quota:      data.quota,
    quotaLabel: fmt(data.quota),
    below:      data.below,
    met:        data.met,
  });
  return renderHtml(html, 680);
}

/**
 * @param {{
 *   circleName: string, date: string, quota: number,
 *   below: Array<{name:string,gain:number}>,
 *   met:   Array<{name:string,gain:number}>,
 * }} data
 */
export async function renderWeeklyDeficitReport(data) {
  const html = buildHtml({
    period:     'Weekly',
    circleName: data.circleName,
    date:       data.date,
    quota:      data.quota,
    quotaLabel: fmt(data.quota),
    below:      data.below,
    met:        data.met,
  });
  return renderHtml(html, 680);
}

/**
 * @param {{
 *   circleName: string, date: string, quota: number, daysLeft: number,
 *   below: Array<{name:string,gain:number}>,
 *   met:   Array<{name:string,gain:number}>,
 * }} data
 */
export async function renderMonthlyDeficitReport(data) {
  const html = buildHtml({
    period:     'Monthly',
    circleName: data.circleName,
    date:       data.date,
    quota:      data.quota,
    quotaLabel: fmt(data.quota),
    daysLeft:   data.daysLeft,
    below:      data.below,
    met:        data.met,
  });
  return renderHtml(html, 680);
}
