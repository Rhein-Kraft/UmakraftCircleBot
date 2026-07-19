/**
 * fantracking/reports/warningCard.js
 * ─────────────────────────────────────
 * renderWarningCard      — per-member warning DM card image
 * renderOfficerSummary   — daily officer warning overview image
 */

import { renderHtml } from '../../utils/imageReport-browser.js';
import { esc, gainColor, FONT_IMPORT } from './ImageReportStandard.js';

// ── Level metadata ────────────────────────────────────────────────────────────

const LEVELS = {
  reminder:  { label: '🟡 Reminder',      accent: '#E65100', bg: 'rgba(230,81,0,0.07)'   },
  warning:   { label: '🟠 Warning',        accent: '#FF6D00', bg: 'rgba(255,109,0,0.07)'  },
  critical:  { label: '🔴 Critical',       accent: '#c62828', bg: 'rgba(198,40,40,0.07)'  },
  final:     { label: '⚫ Final Reminder', accent: '#546E7A', bg: 'rgba(84,110,122,0.07)' },
  recovered: { label: '🟢 Recovered',      accent: '#2e7d32', bg: 'rgba(46,125,50,0.07)'  },
};

function fmtCompact(n) {
  if (!n || n === 0) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.?0+$/, '') + 'K';
  return String(Math.round(n));
}

// ── Per-member warning DM card ────────────────────────────────────────────────

export async function renderWarningCard(data) {
  const meta   = LEVELS[data.level] ?? LEVELS.warning;
  const accent = meta.accent;

  const progressPct = data.quota > 0 ? Math.min(100, Math.round((data.currentGain / data.quota) * 100)) : 0;
  const expectedPct = data.quota > 0 ? Math.min(100, Math.round((data.expectedGain / data.quota) * 100)) : 0;
  const isRecovered = data.level === 'recovered';
  const gainClr     = gainColor(progressPct);

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
${FONT_IMPORT}
* { margin:0;padding:0;box-sizing:border-box; }
body { background:#ffffff;font-family:'Noto Sans JP','Noto Sans Symbols 2','Noto Color Emoji',system-ui,-apple-system,Arial,sans-serif;color:#1a1a1a;font-weight:700;display:inline-block;width:520px; }
.card { background:#ffffff;border:1.5px solid #000000;border-top:3px solid ${accent};border-radius:6px; }
.header { padding:18px 20px 14px;border-bottom:1.5px solid #000000;background:linear-gradient(135deg,#f06292 0%,#ec407a 100%); }
.level-badge { display:inline-flex;align-items:center;gap:6px;padding:4px 12px;background:rgba(255,255,255,0.20);border:1px solid rgba(255,255,255,0.40);border-radius:20px;font-size:13px;font-weight:700;color:#ffffff;margin-bottom:10px; }
.trainer { font-size:20px;font-weight:900;letter-spacing:-0.3px;margin-bottom:3px;color:#ffffff; }
.circle  { font-size:11px;color:rgba(255,255,255,0.72);font-weight:700; }
.stats { padding:16px 20px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;border-bottom:1.5px solid #000000; }
.stat-box { background:rgba(0,0,0,0.04);border-radius:8px;padding:10px 12px;text-align:center;border:1.5px solid #000000; }
.stat-val { font-size:18px;font-weight:800;letter-spacing:-0.5px; }
.stat-lbl { font-size:9px;text-transform:uppercase;letter-spacing:0.6px;color:rgba(0,0,0,0.42);margin-top:3px;font-weight:700; }
.progress-section { padding:14px 20px;border-bottom:1.5px solid #000000; }
.prog-label { display:flex;justify-content:space-between;font-size:11px;color:rgba(0,0,0,0.42);margin-bottom:6px;font-weight:700; }
.prog-track { height:8px;background:rgba(0,0,0,0.09);border-radius:4px;position:relative;overflow:visible; }
.prog-expected { position:absolute;top:-3px;height:14px;width:2px;background:rgba(0,0,0,0.25);border-radius:1px;z-index:2; }
.prog-fill { height:100%;border-radius:4px; }
.recommendation { padding:14px 20px;font-size:13px;line-height:1.5;color:#1a1a1a;background:${meta.bg};font-weight:700; }
.footer { padding:10px 20px;font-size:10px;color:rgba(0,0,0,0.38);display:flex;justify-content:space-between;border-top:1.5px solid #000000;font-weight:700; }
</style></head>
<body><div class="card">
  <div class="header">
    <div class="level-badge">${esc(meta.label)}</div>
    <div class="trainer">${esc(data.trainerName)}</div>
    <div class="circle">${esc(data.circleName)} · ${esc(data.date)}</div>
  </div>

  <div class="stats">
    <div class="stat-box">
      <div class="stat-val" style="color:${gainClr}">+${fmtCompact(data.currentGain)}</div>
      <div class="stat-lbl">Current Gain</div>
    </div>
    <div class="stat-box">
      <div class="stat-val" style="color:rgba(0,0,0,0.45)">+${fmtCompact(data.expectedGain)}</div>
      <div class="stat-lbl">Expected Now</div>
    </div>
    <div class="stat-box">
      <div class="stat-val" style="color:${data.remaining <= 0 ? '#2e7d32' : 'rgba(0,0,0,0.45)'}">
        ${data.remaining <= 0 ? '✓ Done' : '+' + fmtCompact(data.remaining)}
      </div>
      <div class="stat-lbl">Still Needed</div>
    </div>
  </div>

  <div class="progress-section">
    <div class="prog-label">
      <span>Daily Progress</span>
      <span>${progressPct}% of quota</span>
    </div>
    <div class="prog-track">
      <div class="prog-expected" style="left:${expectedPct}%" title="Expected ${expectedPct}%"></div>
      <div class="prog-fill" style="width:${progressPct}%;background:${gainClr}"></div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:10px;color:rgba(0,0,0,0.38);margin-top:5px;font-weight:700">
      <span>0</span>
      <span style="margin-left:${expectedPct}%">▲ Expected</span>
      <span>Quota: +${fmtCompact(data.quota)}</span>
    </div>
  </div>

  <div class="recommendation">
    ${esc(data.recommendation)}
  </div>

  <div class="footer">
    <span>UmaKraft Warning System · uma.moe</span>
    <span>${esc(data.date)}</span>
  </div>
</div></body></html>`;

  return renderHtml(html, 520);
}

// ── Officer summary ───────────────────────────────────────────────────────────

export async function renderOfficerSummary(data) {
  const counts = data.counts ?? {};

  function levelRow(key, emoji, label, color) {
    const n = counts[key] ?? 0;
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1.5px solid #000000">
      <span style="font-size:16px">${emoji}</span>
      <span style="flex:1;font-size:13px;color:rgba(0,0,0,0.65);font-weight:700">${label}</span>
      <span style="font-size:18px;font-weight:800;color:${n > 0 ? color : 'rgba(0,0,0,0.20)'}; min-width:32px;text-align:right">${n}</span>
    </div>`;
  }

  const completionPct = data.totalMembers > 0
    ? Math.round((data.completedCount / data.totalMembers) * 100) : 0;

  const belowRows = (data.belowQuota ?? []).slice(0, 20).map(m => {
    const meta = LEVELS[m.level] ?? LEVELS.warning;
    const pct  = m.quota > 0 ? Math.min(100, Math.round((m.currentGain / m.quota) * 100)) : 0;
    const clr  = gainColor(pct);
    return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid rgba(0,0,0,0.04)">
      <span style="font-size:10px;padding:2px 7px;background:${meta.bg};border:1px solid ${meta.accent}44;border-radius:10px;color:${meta.accent};font-weight:700;white-space:nowrap">${esc(meta.label)}</span>
      <span style="flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700">${esc(m.name)}</span>
      <span style="font-size:11px;color:rgba(0,0,0,0.42);white-space:nowrap;font-weight:700">+${fmtCompact(m.currentGain)} / need +${fmtCompact(m.remaining)}</span>
      <div style="width:50px;height:5px;background:rgba(0,0,0,0.09);border-radius:3px;overflow:hidden;flex-shrink:0">
        <div style="width:${pct}%;height:100%;background:${clr}"></div>
      </div>
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
${FONT_IMPORT}
* { margin:0;padding:0;box-sizing:border-box; }
body { background:#ffffff;font-family:'Noto Sans JP','Noto Sans Symbols 2','Noto Color Emoji',system-ui,-apple-system,Arial,sans-serif;color:#1a1a1a;font-weight:700;display:inline-block;width:640px; }
.card { background:#ffffff;border:1.5px solid #000000;border-radius:6px; }
.header { padding:16px 20px 12px;border-bottom:1.5px solid #000000;background:linear-gradient(135deg,#f06292 0%,#ec407a 100%); }
.title { font-size:18px;font-weight:900;margin-bottom:3px;color:#ffffff; }
.sub { font-size:11px;color:rgba(255,255,255,0.72);font-weight:700; }
.body { padding:14px 20px; }
.section-label { font-size:10px;text-transform:uppercase;letter-spacing:0.8px;color:rgba(0,0,0,0.42);margin-bottom:8px;font-weight:700; }
.summary-row { display:flex;gap:10px;margin-bottom:16px; }
.stat-pill { flex:1;text-align:center;padding:10px 8px;background:rgba(0,0,0,0.04);border-radius:8px;border:1.5px solid #000000; }
.stat-num { font-size:22px;font-weight:800;line-height:1; }
.stat-lbl { font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:rgba(0,0,0,0.42);margin-top:3px;font-weight:700; }
.footer { padding:10px 20px;border-top:1.5px solid #000000;font-size:10px;color:rgba(0,0,0,0.38);display:flex;justify-content:space-between;font-weight:700; }
</style></head>
<body><div class="card">
  <div style="height:3px;background:linear-gradient(90deg,#f06292,#ec407a)"></div>
  <div class="header">
    <div class="title">📋 Officer Warning Summary</div>
    <div class="sub">${esc(data.circleName)} · ${esc(data.date)}</div>
  </div>
  <div class="body">
    <div class="section-label">Overview</div>
    <div class="summary-row">
      <div class="stat-pill">
        <div class="stat-num" style="color:#2e7d32">${data.completedCount ?? 0}</div>
        <div class="stat-lbl">Completed</div>
      </div>
      <div class="stat-pill">
        <div class="stat-num" style="color:#1a1a1a">${data.totalMembers ?? 0}</div>
        <div class="stat-lbl">Total Members</div>
      </div>
      <div class="stat-pill">
        <div class="stat-num" style="color:${gainColor(completionPct)}">${completionPct}%</div>
        <div class="stat-lbl">Completion</div>
      </div>
    </div>

    <div class="section-label">Warning Distribution</div>
    <div style="background:rgba(0,0,0,0.03);border-radius:8px;padding:8px 14px;margin-bottom:16px;border:1.5px solid #000000">
      ${levelRow('safe',      '🟢', 'Safe',           '#2e7d32')}
      ${levelRow('reminder',  '🟡', 'Reminder',       '#E65100')}
      ${levelRow('warning',   '🟠', 'Warning',        '#FF6D00')}
      ${levelRow('critical',  '🔴', 'Critical',       '#c62828')}
      ${levelRow('final',     '⚫', 'Final Reminder', '#546E7A')}
      ${levelRow('recovered', '✅', 'Recovered',      '#2e7d32')}
    </div>

    ${belowRows ? `
    <div class="section-label">Members Needing Attention</div>
    <div style="background:rgba(0,0,0,0.03);border-radius:8px;padding:8px 14px;border:1.5px solid #000000">
      ${belowRows}
    </div>` : ''}
  </div>
  <div class="footer">
    <span>${esc(data.circleName)} · UmaKraft Warning System</span>
    <span>${esc(data.date)}</span>
  </div>
</div></body></html>`;

  return renderHtml(html, 640);
}
