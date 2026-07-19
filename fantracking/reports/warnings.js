/**
 * fantracking/reports/warnings.js
 * ──────────────────────────────
 * renderDailyWarnings      — below-daily-target member list
 * renderWeeklyReport       — weekly contribution table
 * renderTallyResults       — week-end tally results
 * renderInfoCard           — generic info/error card
 * renderMonthlyWarningCard — monthly 30M goal progress
 * renderPlayerWarning      — individual daily warning DM card
 */

import { renderHtml } from '../../utils/imageReport-browser.js';
import { esc, rankCell, gainColor, trainerColor, COLORS, STANDARD_CSS, FONT_IMPORT } from './ImageReportStandard.js';

export async function renderDailyWarnings(data) {
  const rows = (data.rows || [])
    .map(
      (r, i) => `
    <div class="row">
      <span class="rank">#${i + 1}</span>
      <span style="min-width:0px;width:0"></span>
      <span class="name" style="color:${trainerColor(r.name)}">${esc(r.name)}</span>
      <span class="gain" style="color:${COLORS.RED};min-width:96px">${esc(r.yesterday)}</span>
      <span class="sub-gain">${esc(r.monthly)}</span>
    </div>`
    )
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${STANDARD_CSS}
body{width:640px}</style></head>
<body><div class="card">
  <div class="accent-bar"></div>
  <div class="header">
    <div class="hrow">
      <div class="htitle">⚠️ Daily Reminder — Below ${esc(data.threshold)}</div>
      <div class="hdate">${esc(data.date)}</div>
    </div>
    <div class="hsub">${esc(data.circleName)} · Trainers below the daily fan target</div>
  </div>
  <div class="col-labels">
    <span style="min-width:34px"></span>
    <span style="min-width:0px"></span>
    <span style="flex:1">Trainer</span>
    <span style="min-width:96px;text-align:right">Yesterday</span>
    <span style="min-width:90px;text-align:right">Monthly</span>
  </div>
  <div class="body">${rows}</div>
  <div class="footer">
    <span>Safe: members above 20M monthly with &gt;15 days remaining are excluded</span>
  </div>
</div></body></html>`;
  return renderHtml(html, 640);
}

export async function renderWeeklyReport(data) {
  const rows = (data.rows || [])
    .map(
      r => `
    <div class="row">
      ${rankCell(r.rank)}
      <span style="min-width:0px;width:0"></span>
      <span class="name" style="color:${trainerColor(r.name)}">${esc(r.name)}</span>
      <span class="sub-gain" style="color:${gainColor(r.dailyPct ?? 0)}">${esc(r.daily)}</span>
      <span class="gain" style="min-width:96px;color:${gainColor(r.weeklyPct ?? 0)}">${esc(r.weekly)}</span>
      <span class="sub-gain" style="color:${gainColor(r.monthlyPct ?? 0)}">${esc(r.monthly)}</span>
    </div>`
    )
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${STANDARD_CSS}
body{width:700px}</style></head>
<body><div class="card">
  <div class="accent-bar"></div>
  <div class="header">
    <div class="hrow">
      <div class="htitle">📈 ${esc(data.circleName)} — Weekly Contribution</div>
      <div class="hdate">Week ending ${esc(data.date)}</div>
    </div>
    <div class="hsub">Weekly Contribution Report</div>
  </div>
  <div class="col-labels">
    <span style="min-width:34px;margin-right:0px"></span>
    <span style="min-width:0px"></span>
    <span style="flex:1">Trainer</span>
    <span style="min-width:90px;text-align:right">Daily</span>
    <span style="min-width:96px;text-align:right">Weekly</span>
    <span style="min-width:90px;text-align:right">Monthly</span>
  </div>
  <div class="body">${rows}</div>
  <div class="footer">
    <span>${esc(data.circleName)}</span>
    <span>Week ending ${esc(data.date)}</span>
  </div>
</div></body></html>`;
  return renderHtml(html, 700);
}

export async function renderTallyResults(data) {
  const rows = (data.rows || [])
    .map(
      r => `
    <div class="row">
      ${rankCell(r.rank)}
      <span style="min-width:0px;width:0"></span>
      <span class="name" style="color:${trainerColor(r.name)}">${esc(r.name)}</span>
      <span class="gain" style="color:${gainColor(r.weekGainPct ?? 0)}">${esc(r.weekGain)}</span>
      <span class="sub-gain" style="color:${gainColor(r.monthlyPct ?? 0)}">${esc(r.monthly)}</span>
    </div>`
    )
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${STANDARD_CSS}
body{width:640px}</style></head>
<body><div class="card">
  <div class="accent-bar"></div>
  <div class="header">
    <div class="hrow">
      <div class="htitle">📋 ${esc(data.circleName)} — <span class="hl">${esc(data.weekLabel)}</span> Week Results</div>
      <div class="hdate">${esc(data.date)}</div>
    </div>
    <div class="hsub">Weekly tally results</div>
  </div>
  <div class="col-labels">
    <span style="min-width:34px"></span>
    <span style="min-width:0px"></span>
    <span style="flex:1">Trainer</span>
    <span style="min-width:108px;text-align:right">Week Gain</span>
    <span style="min-width:90px;text-align:right">Monthly</span>
  </div>
  <div class="body">${rows}</div>
  <div class="divider"></div>
  <div class="total-row">
    <span class="total-label">Circle Weekly Total</span>
    <span class="total-val">${esc(data.circleWeekTotal)}</span>
  </div>
  <div class="footer">
    <span>${esc(data.circleName)}</span>
    <span>${esc(data.date)}</span>
  </div>
</div></body></html>`;
  return renderHtml(html, 640);
}

export async function renderInfoCard(data) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${STANDARD_CSS}
body{width:520px}</style></head>
<body><div class="card">
  <div class="accent-bar"></div>
  <div class="header">
    <div class="htitle">${esc(data.title)}</div>
  </div>
  <div style="padding:16px 22px;font-size:13px;line-height:1.6;color:#1a1a1a;font-weight:700">
    ${esc(data.body)}
  </div>
  <div class="footer"><span>${esc(data.footer || '')}</span></div>
</div></body></html>`;
  return renderHtml(html, 520);
}

export async function renderMonthlyWarningCard(data) {
  const goal   = 30_000_000;

  const rows = (data.rows || [])
    .map((r, i) => {
      const pct    = Math.min(100, Math.round((r.monthlyRaw / goal) * 100));
      const color  = gainColor(r.onTrack ? 100 : pct);
      const rowBg  = i % 2 === 0 ? 'rgba(240,98,146,0.04)' : '#ffffff';
      return `<tr style="background:${rowBg}">
      <td style="padding:7px 10px;font-size:12px;font-weight:700;color:${trainerColor(r.name)}">${esc(r.name)}</td>
      <td style="padding:7px 6px;font-size:12px;font-weight:700;color:${color};text-align:right">${esc(r.monthly)}</td>
      <td style="padding:7px 6px;font-size:11px;color:rgba(0,0,0,0.42);text-align:right;font-weight:700">-${esc(r.gap)}</td>
      <td style="padding:7px 10px;min-width:90px">
        <div style="height:6px;background:rgba(0,0,0,0.09);border-radius:3px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:${color};border-radius:3px"></div>
        </div>
      </td>
    </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
${FONT_IMPORT}
* { margin:0;padding:0;box-sizing:border-box; }
body { background:#ffffff;font-family:'Noto Sans JP','Noto Sans Symbols 2','Noto Color Emoji',system-ui,-apple-system,Arial,sans-serif;color:#1a1a1a;font-weight:700;display:inline-block;width:640px; }
.card { background:#ffffff;position:relative;overflow:hidden;border:1.5px solid #000000;border-radius:6px; }
.header { padding:14px 18px 10px;background:linear-gradient(135deg,#f06292 0%,#ec407a 100%); }
.htitle { font-size:16px;font-weight:900;color:#ffffff; }
.hsub { font-size:11px;color:rgba(255,255,255,0.70);margin-top:3px;font-weight:700; }
table { width:100%;border-collapse:collapse; }
thead th { padding:6px 6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:rgba(0,0,0,0.42);border-bottom:1.5px solid #000000;background:#fafafa; }
thead th:first-child { padding-left:10px; }
thead th:last-child { padding-right:10px; }
td { border-bottom:1.5px solid #000000; }
.footer { padding:9px 18px;border-top:1.5px solid #000000;font-size:10px;color:rgba(0,0,0,0.38);display:flex;justify-content:space-between;font-weight:700; }
</style></head>
<body><div class="card">
  <div style="height:3px;background:linear-gradient(90deg,#f06292,#ec407a)"></div>
  <div class="header">
    <div class="htitle">📊 Monthly Goal Warning — ${esc(data.monthName)}</div>
    <div class="hsub">${esc(String(data.rows.length))} member${data.rows.length !== 1 ? 's' : ''} below 30,000,000 fan goal · ${esc(String(data.daysLeft))} day${data.daysLeft !== 1 ? 's' : ''} remaining</div>
  </div>
  <table>
    <thead><tr>
      <th style="text-align:left">Trainer</th>
      <th style="text-align:right">Monthly</th>
      <th style="text-align:right">Gap to 30M</th>
      <th style="text-align:left;padding-left:10px;min-width:90px">Progress</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">
    <span>${esc(data.circleName)}</span>
    <span>${esc(data.date)}</span>
  </div>
</div></body></html>`;

  return renderHtml(html, 640);
}

export async function renderPlayerWarning(data) {
  const pct      = Math.min(100, Math.round((data.yesterdayRaw / data.dailyReqRaw) * 100)) || 0;
  const shortfall = data.dailyReqRaw - data.yesterdayRaw;
  const shortStr  =
    shortfall > 0
      ? (shortfall >= 1_000_000
          ? (shortfall / 1_000_000).toFixed(1) + 'M'
          : Math.round(shortfall / 1_000) + 'K') + ' short'
      : 'Met!';
  const gainClr = gainColor(pct);

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${STANDARD_CSS}
body{width:520px}</style></head>
<body><div class="card">
  <div class="accent-bar"></div>
  <div class="header">
    <div class="hrow">
      <div class="htitle">⚠️ ${esc(data.trainerName)}</div>
      <div class="hdate">${esc(data.date)}</div>
    </div>
    <div class="hsub">${esc(data.circleName)} · Daily Fan Gain Warning</div>
  </div>
  <div style="padding:16px 22px 8px">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.7px;color:rgba(0,0,0,0.42);margin-bottom:6px;font-weight:700">Yesterday's Gain</div>
    <div style="font-size:32px;font-weight:700;color:${gainClr};letter-spacing:-1px">${esc(data.yesterday)}</div>
    <div style="font-size:11px;color:rgba(0,0,0,0.42);margin-top:3px;font-weight:700">Daily requirement: ${esc(data.dailyReq)} · <span style="color:${gainClr}">${shortStr}</span></div>
    <div style="margin-top:12px">
      <div class="bar-track" style="height:8px">
        <div class="bar-fill" style="width:${pct}%;background:${gainClr}"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:rgba(0,0,0,0.38);margin-top:4px;font-weight:700">
        <span>0</span><span>${pct}% of daily target</span><span>${esc(data.dailyReq)}</span>
      </div>
    </div>
  </div>
  <div class="divider" style="margin:0 22px"></div>
  <div style="padding:10px 22px 14px;display:flex;gap:20px">
    <div>
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:rgba(0,0,0,0.42);margin-bottom:4px;font-weight:700">Monthly Total</div>
      <div style="font-size:15px;font-weight:700;color:#7B1FA2">${esc(data.monthly)}</div>
    </div>
    <div>
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:rgba(0,0,0,0.42);margin-bottom:4px;font-weight:700">Days Left</div>
      <div style="font-size:15px;font-weight:700;color:rgba(0,0,0,0.55)">${esc(String(data.daysLeft))} day${data.daysLeft !== 1 ? 's' : ''}</div>
    </div>
  </div>
  <div class="footer">
    <span>Below ${esc(data.dailyReq)} daily target</span>
    <span>${esc(data.circleName)}</span>
  </div>
</div></body></html>`;
  return renderHtml(html, 520);
}
