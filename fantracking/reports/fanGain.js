/**
 * fantracking/reports/fanGain.js
 * ──────────────────────────────
 * renderFanGain      — Phase 1 flagship dashboard card
 * renderTotalFan     — personal lifetime fan count
 * renderCircleTotals — circle-wide daily/weekly/monthly/lifetime totals
 */

import { renderHtml } from '../../utils/imageReport-browser.js';
import { esc, gainColor, COLORS, STANDARD_CSS } from './ImageReportStandard.js';

// ── Number helpers ────────────────────────────────────────────────────────────

const FMT = new Intl.NumberFormat('en-US');
function fmt(n) {
  if (typeof n !== 'number' || isNaN(n)) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.?0+$/, '') + 'K';
  return FMT.format(Math.round(n));
}

function fmtFull(n) {
  if (typeof n !== 'number' || isNaN(n)) return '—';
  return FMT.format(Math.round(n));
}

function pct(raw, target) {
  if (typeof raw !== 'number' || !target || raw <= 0) return 0;
  return Math.min(100, Math.round((raw / target) * 100));
}

// ── Sub-section builders ──────────────────────────────────────────────────────

function sectionTitle(label) {
  return `<div class="sec-title">${label}</div>`;
}

function divider() {
  return `<div class="divider"></div>`;
}

// ── Main render ───────────────────────────────────────────────────────────────

export async function renderFanGain(data) {
  const {
    trainerName, circleName, totalFans, date, weekLabel, daysLeft,
    dailyRaw, weeklyRaw, monthlyRaw,
    daily, weekly, monthly,
    dailyTarget, weeklyTarget, monthlyReq,
    status,
    rank, dailyRankNum, weeklyRankNum, monthlyRankNum, totalEligible,
    competition,
    trend,
    guildCompleted, guildTotal, guildPct,
  } = data;

  const dailyPct   = pct(dailyRaw,   dailyTarget);
  const weeklyPct  = pct(weeklyRaw,  weeklyTarget);
  const monthlyPct = pct(monthlyRaw, monthlyReq);

  // ── Status color (fan-gain context — green/yellow/red OK here) ──
  const statusColor = status
    ? (status.emoji === '🟢' ? '#2e7d32' : status.emoji === '🟡' ? '#E65100' : '#c62828')
    : '#546E7A';

  // ── Daily remaining ──
  const dailyRemaining = (dailyTarget && typeof dailyRaw === 'number')
    ? Math.max(0, dailyTarget - dailyRaw)
    : null;

  // ── Trend ──
  let trendHtml = '';
  if (trend) {
    const isUp   = trend.pct !== null && trend.pct >= 0;
    const arrow  = trend.pct === null ? '' : (isUp ? '📈' : '📉');
    const pctStr = trend.pct === null ? 'N/A' : `${isUp ? '+' : ''}${trend.pct}%`;
    const col    = trend.pct === null ? '#546E7A'
                 : isUp ? '#2e7d32' : '#c62828';
    trendHtml = `
    ${sectionTitle('📊 Trend — Today vs Yesterday')}
    <div class="two-col" style="padding:10px 20px 12px">
      <div class="mini-stat">
        <div class="mini-lbl">Yesterday</div>
        <div class="mini-val">${esc(fmt(trend.yesterdayGain))}</div>
      </div>
      <div class="mini-stat">
        <div class="mini-lbl">Today</div>
        <div class="mini-val">${esc(fmt(trend.todayGain))}</div>
      </div>
      <div class="mini-stat">
        <div class="mini-lbl">Change</div>
        <div class="mini-val" style="color:${col}">${arrow} ${esc(pctStr)}</div>
      </div>
    </div>`;
  }

  // ── Competition ──
  let compHtml = '';
  if (competition) {
    if (competition.firstPlace) {
      compHtml = `
    ${sectionTitle('⚔️ Competition')}
    <div style="padding:10px 20px 14px;text-align:center">
      <span style="font-size:26px">🏆</span>
      <div style="font-size:14px;font-weight:700;color:#E65100;margin-top:4px">Currently First Place</div>
    </div>`;
    } else {
      compHtml = `
    ${sectionTitle('⚔️ Competition')}
    <div class="comp-row">
      <div>
        <div class="mini-lbl">Gap to rank above</div>
        <div class="mini-val" style="color:#c62828">-${esc(fmt(competition.gap))}</div>
      </div>
      <div style="text-align:right">
        <div class="mini-lbl">Rival trainer</div>
        <div class="mini-val" style="font-size:13px;color:#1a1a1a">${esc(competition.name)}</div>
      </div>
    </div>`;
    }
  }

  // ── Rankings row ──
  function rankBadge(rankNum, label) {
    if (!rankNum) return `<div class="rank-pill"><div class="rp-label">${esc(label)}</div><div class="rp-val">—</div></div>`;
    const medal = rankNum === 1 ? '🥇' : rankNum === 2 ? '🥈' : rankNum === 3 ? '🥉' : `#${rankNum}`;
    return `<div class="rank-pill"><div class="rp-label">${esc(label)}</div><div class="rp-val">${esc(medal)}</div></div>`;
  }

  // ── Guild stats (fan-gain completion — green/red binary) ──
  const guildBarPct = guildTotal > 0 ? Math.round((guildCompleted / guildTotal) * 100) : 0;
  const guildColor  = gainColor(guildBarPct);

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>${STANDARD_CSS}
body{width:620px}</style>
<style>
.two-col {
  display: flex;
  gap: 8px;
  align-items: stretch;
}
.mini-stat {
  flex: 1;
  background: rgba(0,0,0,0.04);
  border-radius: 8px;
  padding: 10px 12px;
  border:1.5px solid #000000;
}
.mini-lbl {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: rgba(0,0,0,0.42);
  margin-bottom: 4px;
  font-weight: 700;
}
.mini-val {
  font-size: 15px;
  font-weight: 700;
  color: #1a1a1a;
}
.progress-section {
  padding: 10px 20px 4px;
}
.prog-bar-track {
  width: 100%;
  height: 10px;
  background: rgba(0,0,0,0.09);
  border-radius: 6px;
  overflow: hidden;
  margin: 6px 0;
}
.prog-bar-fill {
  height: 100%;
  border-radius: 6px;
}
.prog-meta {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: rgba(0,0,0,0.42);
  margin-top: 2px;
  font-weight: 700;
}
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid;
}
.gain-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  margin-bottom: 6px;
}
.gl { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:rgba(0,0,0,0.45); min-width:68px; }
.gt { flex:1; height:6px; background:rgba(0,0,0,0.09); border-radius:3px; overflow:hidden; }
.gf { height:100%; border-radius:3px; }
.gv { font-size:13px; font-weight:700; color:#1a1a1a; min-width:90px; text-align:right; }
.rank-row {
  display: flex;
  gap: 8px;
  padding: 10px 20px 14px;
}
.rank-pill {
  flex: 1;
  background: rgba(0,0,0,0.04);
  border-radius: 8px;
  padding: 10px 8px;
  text-align: center;
  border:1.5px solid #000000;
}
.rp-label { font-size:9px; text-transform:uppercase; letter-spacing:0.6px; color:rgba(0,0,0,0.42); margin-bottom:5px; font-weight:700; }
.rp-val   { font-size:17px; font-weight:700; color:#1a1a1a; }
.comp-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px 14px;
  background: rgba(198,40,40,0.05);
  margin: 0 20px;
  border-radius: 8px;
  margin-bottom: 4px;
  border: 1px solid rgba(198,40,40,0.12);
}
.guild-bar-track {
  flex: 1;
  height: 8px;
  background: rgba(0,0,0,0.09);
  border-radius: 4px;
  overflow: hidden;
}
.guild-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px 14px;
}
</style>
</head>
<body><div class="card">
  <div class="accent-bar"></div>

  <!-- HEADER -->
  <div class="header">
    <div class="hrow">
      <div class="htitle">🏇 ${esc(trainerName)}</div>
      <div class="hdate">${esc(date)}</div>
    </div>
    <div class="hsub" style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
      <span>${esc(circleName)} · Fan Gain Report</span>
      <span style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.75)">${esc(fmt(totalFans))} fans total</span>
    </div>
  </div>

  ${divider()}

  <!-- DAILY PROGRESS -->
  ${sectionTitle('📅 Daily Progress')}
  <div class="progress-section">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
      <span style="font-size:22px;font-weight:800;color:${gainColor(dailyPct)}">${esc(daily)}</span>
      ${status ? `<span class="status-pill" style="color:${statusColor};border-color:${statusColor}30;background:${statusColor}10">${esc(status.emoji)} ${esc(status.label)}</span>` : ''}
    </div>
    <div class="prog-bar-track">
      <div class="prog-bar-fill" style="width:${dailyPct}%;background:${gainColor(dailyPct)}"></div>
    </div>
    <div class="prog-meta">
      <span>${dailyPct}% of daily target (${esc(fmt(dailyTarget))})</span>
      ${dailyRemaining !== null ? `<span>${esc(fmt(dailyRemaining))} remaining</span>` : ''}
    </div>
  </div>

  ${divider()}

  <!-- FAN GAIN SUMMARY -->
  ${sectionTitle('📈 Fan Gain Summary')}
  <div style="padding:6px 0 4px">
    <div class="gain-row"><span class="gl">Daily</span><div class="gt"><div class="gf" style="width:${dailyPct}%;background:${gainColor(dailyPct)}"></div></div><span class="gv" style="color:${gainColor(dailyPct)}">${esc(daily)}</span></div>
    <div class="gain-row"><span class="gl">Weekly</span><div class="gt"><div class="gf" style="width:${weeklyPct}%;background:${gainColor(weeklyPct)}"></div></div><span class="gv" style="color:${gainColor(weeklyPct)}">${esc(weekly)}</span></div>
    <div class="gain-row"><span class="gl">Monthly</span><div class="gt"><div class="gf" style="width:${monthlyPct}%;background:${gainColor(monthlyPct)}"></div></div><span class="gv" style="color:${gainColor(monthlyPct)}">${esc(monthly)}</span></div>
  </div>

  ${divider()}

  <!-- RANKINGS -->
  ${sectionTitle('🏆 Rankings')}
  <div class="rank-row">
    ${rankBadge(dailyRankNum,   'Daily')}
    ${rankBadge(weeklyRankNum,  'Weekly')}
    ${rankBadge(monthlyRankNum, 'Monthly')}
  </div>

  ${competition ? divider() + compHtml : ''}

  ${trend ? divider() + trendHtml : ''}

  ${divider()}

  <!-- GUILD STATS -->
  ${sectionTitle('👥 Guild Progress Today')}
  <div class="guild-row">
    <div class="guild-bar-track">
      <div style="height:100%;border-radius:4px;background:${guildColor};width:${guildBarPct}%"></div>
    </div>
    <span style="font-size:13px;font-weight:700;color:${guildColor};min-width:36px;text-align:right">${guildBarPct}%</span>
    <span style="font-size:11px;color:rgba(0,0,0,0.42);white-space:nowrap;font-weight:700">${guildCompleted}/${guildTotal} done</span>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <span>Week: ${esc(weekLabel)}</span>
    <span>${esc(String(daysLeft))} day${daysLeft !== 1 ? 's' : ''} left · uma.moe</span>
  </div>

</div></body></html>`;

  return renderHtml(html, 620);
}

// ── Supporting renders ────────────────────────────────────────────────────────

export async function renderTotalFan(data) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${STANDARD_CSS}
body{width:500px}</style></head>
<body><div class="card">
  <div class="accent-bar"></div>
  <div class="header">
    <div class="hrow">
      <div class="htitle">⭐ ${esc(data.trainerName)}</div>
    </div>
    <div class="hsub">${esc(data.circleName)} · Lifetime Fan Count</div>
  </div>
  <div style="padding:20px 22px;display:flex;gap:14px">
    <div style="flex:1;text-align:center;background:rgba(0,0,0,0.04);border-radius:9px;padding:18px 14px;border:1.5px solid #000000">
      <div class="stat-lbl">Lifetime Rank</div>
      <div style="font-size:30px;font-weight:700;color:${COLORS.BLACK}">${esc(data.rank)}</div>
    </div>
    <div style="flex:1;text-align:center;background:rgba(0,0,0,0.04);border-radius:9px;padding:18px 14px;border:1.5px solid #000000">
      <div class="stat-lbl">Total Fans</div>
      <div style="font-size:26px;font-weight:700;color:${COLORS.BLACK}">${esc(data.totalFans)}</div>
    </div>
  </div>
  <div class="footer">
    <span>${esc(data.circleName)}</span>
    <span>Active members only · left members excluded</span>
  </div>
</div></body></html>`;
  return renderHtml(html, 500);
}

export async function renderCircleTotals(data) {
  const pending = data.pendingCount > 0 ? ` · ${data.pendingCount} pending excluded` : '';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${STANDARD_CSS}
body{width:580px}</style></head>
<body><div class="card">
  <div class="accent-bar"></div>
  <div class="header">
    <div class="hrow">
      <div class="htitle">🌸 ${esc(data.circleName)} — Circle Totals</div>
      <div class="hdate">${esc(data.date)}</div>
    </div>
    <div class="hsub">${esc(data.activeMembers)} active members${pending}</div>
  </div>
  <div class="stat-grid">
    <div class="stat-cell">
      <div class="stat-lbl">Daily Total</div>
      <div class="stat-val">${esc(data.totalDaily)}</div>
      <div class="stat-sub">fans gained today</div>
    </div>
    <div class="stat-cell">
      <div class="stat-lbl">Weekly Total</div>
      <div class="stat-val">${esc(data.totalWeekly)}</div>
      <div class="stat-sub">this week</div>
    </div>
    <div class="stat-cell">
      <div class="stat-lbl">Monthly Total</div>
      <div class="stat-val">${esc(data.totalMonthly)}</div>
      <div class="stat-sub">this month</div>
    </div>
    <div class="stat-cell">
      <div class="stat-lbl">Lifetime Total</div>
      <div class="stat-val">${esc(data.totalLifetime)}</div>
      <div class="stat-sub">all time (active)</div>
    </div>
  </div>
  <div class="footer">
    <span>${esc(data.circleName)}</span>
    <span>Members who left are excluded</span>
  </div>
</div></body></html>`;
  return renderHtml(html, 580);
}
