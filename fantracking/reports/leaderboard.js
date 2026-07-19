/**
 * fantracking/reports/leaderboard.js
 * ─────────────────────────────────────
 * renderLeaderboard            — full per-circle ranked image
 * renderInterCircleLeaderboard — unified cross-circle table
 */

import { renderHtml } from '../../utils/imageReport-browser.js';
import { esc, trainerColor, gainColor, FONT_IMPORT } from './ImageReportStandard.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCompact(n) {
  if (!n || n === 0) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.?0+$/, '') + 'K';
  return String(Math.round(n));
}

function movementHtml(movement) {
  if (movement == null) return '';
  if (movement === 0)
    return `<span style="font-size:10px;color:rgba(0,0,0,0.25);margin-left:3px">—</span>`;
  if (movement > 0)
    return `<span style="font-size:10px;color:#2e7d32;font-weight:700;margin-left:3px">⬆${movement}</span>`;
  return `<span style="font-size:10px;color:#c62828;font-weight:700;margin-left:3px">⬇${Math.abs(movement)}</span>`;
}

/** Returns the permanent trainer-name color. */
function nameColor(name, _rank) {
  return trainerColor(name);
}

// ── Main leaderboard renderer ─────────────────────────────────────────────────

export async function renderLeaderboard(data) {
  const ICONS   = { Daily: '🏆', Weekly: '📊', Monthly: '🌟' };
  const icon    = data.isHistorical ? '📅' : (ICONS[data.scope] ?? '🏆');

  const rows    = data.rows ?? [];
  const podium  = rows.slice(0, 3);
  const rest    = rows.slice(3);
  const stats   = data.guildStats ?? {};
  const caller  = data.caller ?? null;
  const climber = data.biggestClimber ?? null;

  // ── Podium cards (top 3): classic order 2nd | 1st | 3rd ──────────────────
  const podiumCols = [podium[1] ?? null, podium[0] ?? null, podium[2] ?? null];
  const medalMap   = { 0: '🥇', 1: '🥈', 2: '🥉' };

  function podiumCard(row, isCenter) {
    if (!row) return `<div style="flex:1"></div>`;
    const clr      = gainColor(row.pct ?? 0);
    const movHtml  = movementHtml(row.movement);
    const medal    = medalMap[row.rank - 1] ?? `#${row.rank}`;
    const gainNum  = typeof row.gainRaw === 'number' ? fmtCompact(row.gainRaw) : row.gainStr;
    const dName    = row.discordName
      ? `<div style="font-size:11px;color:rgba(0,0,0,0.4);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:170px">${esc(row.discordName)}</div>`
      : '';
    const badgesHtml = (row.badges ?? []).join(' ');
    const nColor     = nameColor(row.name, row.rank);
    const border     = isCenter ? `border-color:${nColor}55;box-shadow:0 0 14px ${nColor}18;` : '';
    return `
    <div style="flex:1;background:#ffffff;border:1.5px solid #000000;border-radius:10px;padding:14px 10px 12px;text-align:center;${border}">
      <div style="font-size:28px;line-height:1;margin-bottom:6px">${medal}</div>
      ${dName}
      <div style="font-size:13px;font-weight:700;color:${nColor};margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:170px">${esc(row.name)}</div>
      <div style="font-size:20px;font-weight:800;color:${clr};letter-spacing:-0.5px">+${gainNum}</div>
      <div style="margin-top:7px;display:flex;justify-content:center;align-items:center;gap:3px;flex-wrap:wrap;min-height:18px">
        ${badgesHtml ? `<span style="font-size:13px">${badgesHtml}</span>` : ''}
        ${movHtml}
        ${row.isNew ? '<span style="font-size:9px;padding:1px 5px;background:rgba(46,125,50,0.1);color:#2e7d32;border:1px solid rgba(46,125,50,0.3);border-radius:3px">NEW</span>' : ''}
      </div>
    </div>`;
  }

  const podiumHtml = podium.length > 0 ? `
  <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:rgba(0,0,0,0.35);padding:10px 14px 4px;position:relative;z-index:1">Top 3</div>
  <div style="display:flex;gap:8px;padding:6px 14px 12px;position:relative;z-index:1;background:#ffffff">
    ${podiumCard(podiumCols[0], false)}
    ${podiumCard(podiumCols[1], true)}
    ${podiumCard(podiumCols[2], false)}
  </div>` : '';

  // ── Rankings 4-N ──────────────────────────────────────────────────────────
  const rankRows = rest.map((r, i) => {
    const clr      = gainColor(r.pct ?? 0);
    const barW     = Math.min(100, r.pct ?? 0);
    const barClr   = gainColor(r.pct ?? 0);
    const gapClr   = (r.gapRaw ?? 0) >= 0 ? '#2e7d32' : 'rgba(0,0,0,0.35)';
    const rowBg    = i % 2 === 0 ? 'rgba(240,98,146,0.04)' : '#ffffff';
    const movHtml  = movementHtml(r.movement);
    const badgeStr = (r.badges ?? []).filter(b => b !== '🏆' && b !== '⭐').join('');
    const dName    = r.discordName
      ? `<span style="font-size:10px;color:rgba(0,0,0,0.35);margin-left:5px;font-weight:700">${esc(r.discordName)}</span>`
      : '';
    const nColor   = nameColor(r.name, r.rank);
    return `<tr style="background:${rowBg}">
      <td style="padding:7px 8px 7px 14px;font-size:12px;font-weight:700;color:rgba(0,0,0,0.35);white-space:nowrap">#${r.rank}</td>
      <td style="padding:7px 4px;font-size:13px;font-weight:700;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${nColor}">
        ${esc(r.name)}${dName}
        ${r.isNew ? '<span style="font-size:9px;padding:1px 4px;background:rgba(46,125,50,0.1);color:#2e7d32;border:1px solid rgba(46,125,50,0.3);border-radius:3px;margin-left:4px">NEW</span>' : ''}
      </td>
      <td style="padding:7px 4px;white-space:nowrap;font-size:12px">${movHtml}${badgeStr ? `<span style="margin-left:2px">${badgeStr}</span>` : ''}</td>
      <td style="padding:7px 6px;font-size:13px;font-weight:700;color:${clr};text-align:right;white-space:nowrap">+${fmtCompact(r.gainRaw)}</td>
      <td style="padding:7px 6px;font-size:11px;color:${gapClr};text-align:right;white-space:nowrap;font-weight:700">${esc(r.gapStr)}</td>
      <td style="padding:7px 14px 7px 8px;min-width:80px">
        <div style="height:5px;background:rgba(0,0,0,0.08);border-radius:3px;overflow:hidden">
          <div style="width:${barW}%;height:100%;background:${barClr};border-radius:3px"></div>
        </div>
      </td>
    </tr>`;
  }).join('');

  const rankingsHtml = rest.length > 0 ? `
  <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:rgba(0,0,0,0.35);padding:10px 14px 4px;position:relative;z-index:1;background:#ffffff">Rankings</div>
  <table style="position:relative;z-index:1;background:#ffffff">
    <thead><tr style="background:#fafafa;border-bottom:1.5px solid #000000">
      <th style="text-align:left;padding-left:14px;min-width:36px;color:rgba(0,0,0,0.42);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;padding-top:5px;padding-bottom:5px">#</th>
      <th style="text-align:left;color:rgba(0,0,0,0.42);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">Trainer</th>
      <th style="min-width:44px"></th>
      <th style="text-align:right;color:rgba(0,0,0,0.42);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">Gain</th>
      <th style="text-align:right;color:rgba(0,0,0,0.42);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">vs Quota</th>
      <th style="text-align:left;padding-left:8px;min-width:80px;color:rgba(0,0,0,0.42);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">Progress</th>
    </tr></thead>
    <tbody>${rankRows}</tbody>
  </table>` : '';

  // ── Bar chart ─────────────────────────────────────────────────────────────
  const topGain  = rows[0]?.gainRaw ?? 1;
  const barChart = rows.length > 1 ? `
  <div style="padding:10px 14px 4px;border-top:1.5px solid #000000;position:relative;z-index:1;background:#ffffff">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:rgba(0,0,0,0.35);margin-bottom:7px">Top ${rows.length} Comparison</div>
    ${rows.map(r => {
      const pct  = topGain > 0 ? Math.round((r.gainRaw / topGain) * 100) : 0;
      const clr  = gainColor(r.pct ?? 0);
      const lbl  = r.discordName ?? r.name;
      const nClr = nameColor(r.name, r.rank);
      return `<div style="display:flex;align-items:center;margin-bottom:5px;gap:7px">
        <div style="font-size:9px;color:rgba(0,0,0,0.35);width:18px;text-align:right;flex-shrink:0;font-weight:700">#${r.rank}</div>
        <div style="font-size:10px;color:${nClr};font-weight:700;width:95px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0">${esc(lbl)}</div>
        <div style="flex:1;height:7px;background:rgba(0,0,0,0.07);border-radius:4px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:${clr};border-radius:4px"></div>
        </div>
        <div style="font-size:10px;color:${clr};font-weight:700;width:46px;text-align:right;flex-shrink:0">+${fmtCompact(r.gainRaw)}</div>
      </div>`;
    }).join('')}
  </div>` : '';

  // ── Guild statistics ──────────────────────────────────────────────────────
  function statCell(label, value) {
    return `<div style="flex:1;text-align:center;padding:10px 4px">
      <div style="font-size:17px;font-weight:800;color:#1a1a1a;letter-spacing:-0.5px">${esc(String(value))}</div>
      <div style="font-size:9px;color:rgba(0,0,0,0.38);margin-top:2px;text-transform:uppercase;letter-spacing:0.5px;font-weight:700">${esc(label)}</div>
    </div>`;
  }

  const statsHtml = `
  <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:rgba(0,0,0,0.35);padding:10px 14px 2px;border-top:1.5px solid #000000;position:relative;z-index:1;background:#ffffff">Guild Stats</div>
  <div style="display:flex;padding:0 6px 6px;position:relative;z-index:1;background:#ffffff">
    ${statCell('Completed', `${stats.completedCount ?? 0} / ${stats.totalMembers ?? 0}`)}
    <div style="width:1px;background:rgba(0,0,0,0.08);margin:10px 0"></div>
    ${statCell('Completion', `${stats.completionPct ?? 0}%`)}
    <div style="width:1px;background:rgba(0,0,0,0.08);margin:10px 0"></div>
    ${statCell('Highest', fmtCompact(stats.highestGain ?? 0))}
    <div style="width:1px;background:rgba(0,0,0,0.08);margin:10px 0"></div>
    ${statCell('Average', fmtCompact(stats.avgGain ?? 0))}
    <div style="width:1px;background:rgba(0,0,0,0.08);margin:10px 0"></div>
    ${statCell('Median', fmtCompact(stats.medianGain ?? 0))}
  </div>`;

  // ── Biggest Climber ───────────────────────────────────────────────────────
  const climberHtml = climber ? `
  <div style="margin:4px 14px 0;padding:9px 14px;background:#ffffff;border:1.5px solid #000000;border-radius:8px;display:flex;align-items:center;gap:10px;position:relative;z-index:1">
    <span style="font-size:18px">🚀</span>
    <div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:rgba(0,0,0,0.4)">Biggest Climber</div>
      <div style="font-size:13px;font-weight:700;color:${trainerColor(climber.name ?? '')};margin-top:1px">
        ${esc(climber.discordName ?? climber.name)}
        <span style="font-size:11px;color:rgba(0,0,0,0.35);font-weight:700;margin-left:6px">
          #${climber.wasRank} → #${climber.nowRank} · +${climber.climb} position${climber.climb !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  </div>` : '';

  // ── Your Position ─────────────────────────────────────────────────────────
  let yourPosHtml = '';
  if (caller) {
    const rh = caller.rankHistory;
    const historyLine = rh
      ? [
          rh.yesterday  != null ? `Yesterday #${rh.yesterday}` : null,
          rh.weekBest   != null ? `7-day best #${rh.weekBest}` : null,
          rh.monthBest  != null ? `30-day best #${rh.monthBest}` : null,
        ].filter(Boolean).join(' · ')
      : null;

    if (caller.inTopTen) {
      yourPosHtml = `
      <div style="margin:8px 14px 0;padding:9px 14px;background:#ffffff;border:1.5px solid #000000;border-radius:8px;display:flex;align-items:center;gap:10px;position:relative;z-index:1">
        <span style="font-size:16px">⭐</span>
        <div>
          <div style="font-size:13px;color:#1a1a1a;font-weight:700">You are currently in the Top ${rows.length}.</div>
          ${historyLine ? `<div style="font-size:10px;color:rgba(0,0,0,0.38);margin-top:2px;font-weight:700">${esc(historyLine)}</div>` : ''}
        </div>
      </div>`;
    } else {
      yourPosHtml = `
      <div style="margin:8px 14px 0;padding:12px 14px;background:rgba(0,0,0,0.03);border:1.5px solid #000000;border-radius:8px;position:relative;z-index:1">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:rgba(0,0,0,0.38);margin-bottom:6px">Your Position</div>
        <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
          <span style="font-size:22px;font-weight:800;color:#1a1a1a">#${caller.rank}</span>
          <span style="font-size:14px;font-weight:700;color:${gainColor(0)}">+${fmtCompact(caller.gain)}</span>
          ${caller.gapToNext != null && caller.nextRank
            ? `<span style="font-size:12px;color:rgba(0,0,0,0.42);font-weight:700">
                Need <strong style="color:#E65100">+${fmtCompact(caller.gapToNext)}</strong>
                to overtake <strong>#${caller.nextRank}</strong>
              </span>`
            : ''}
        </div>
        ${historyLine ? `<div style="font-size:10px;color:rgba(0,0,0,0.38);margin-top:5px;font-weight:700">${esc(historyLine)}</div>` : ''}
      </div>`;
    }
  }

  // ── Historical badge ──────────────────────────────────────────────────────
  const historicalBadge = data.isHistorical ? `
  <div style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;background:rgba(0,0,0,0.06);border:1px solid rgba(0,0,0,0.15);border-radius:20px;font-size:10px;font-weight:700;color:rgba(0,0,0,0.45);letter-spacing:0.4px;margin-left:8px">
    📅 ARCHIVED
  </div>` : '';

  // ── Full HTML ─────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
${FONT_IMPORT}
* { margin:0;padding:0;box-sizing:border-box; }
body { background:#ffffff;font-family:'Noto Sans JP','Noto Sans Symbols 2','Noto Color Emoji',system-ui,-apple-system,Arial,sans-serif;color:#1a1a1a;font-weight:700;display:inline-block;width:720px; }
.card { background:#ffffff;position:relative;overflow:hidden;border:1.5px solid #000000;border-radius:6px; }
</style></head>
<body><div class="card">
  <div style="height:3px;background:linear-gradient(90deg,#f06292,#ec407a)"></div>

  <div style="padding:14px 18px 12px;background:linear-gradient(135deg,#f06292 0%,#ec407a 100%);display:flex;justify-content:space-between;align-items:flex-start;position:relative;z-index:1">
    <div>
      <div style="font-size:18px;font-weight:900;letter-spacing:-0.3px;display:flex;align-items:center;color:#ffffff">
        ${icon} ${esc(data.scope)} Leaderboard${historicalBadge}
      </div>
      <div style="font-size:11px;color:rgba(255,255,255,0.70);margin-top:3px;font-weight:700">${esc(data.circleName)} · ${esc(data.date)} · quota ${esc(data.quotaLabel ?? '')}</div>
    </div>
    <div style="text-align:right;flex-shrink:0;margin-left:12px">
      <div style="font-size:11px;color:rgba(255,255,255,0.72);font-weight:700">Updated</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.55);margin-top:1px;font-weight:700">${esc(data.lastUpdated ?? '')}</div>
    </div>
  </div>

  ${podiumHtml}
  ${rankingsHtml}
  ${barChart}
  ${statsHtml}
  ${climberHtml}
  ${yourPosHtml}

  <div style="padding:8px 18px;border-top:1.5px solid #000000;font-size:10px;color:rgba(0,0,0,0.38);display:flex;justify-content:space-between;position:relative;z-index:1;margin-top:10px;background:#ffffff;font-weight:700">
    <span>${esc(data.circleName)} · uma.moe</span>
    <span>v3${data.isHistorical ? ' · archive' : ''} · ${esc(data.date)}</span>
  </div>
</div></body></html>`;

  return renderHtml(html, 720);
}

// ── Inter-circle leaderboard ──────────────────────────────────────────────────

export async function renderInterCircleLeaderboard(data) {
  const ICONS   = { Daily: '🏆', Weekly: '📊', Monthly: '🌟' };
  const icon    = ICONS[data.scope] ?? '🏆';

  const CIRCLE_COLORS = ['#7B1FA2', '#0277BD', '#E65100', '#00838F'];
  const circleNames   = [...new Set((data.rows ?? []).map(r => r.circleName))];
  const circleColor   = name => CIRCLE_COLORS[circleNames.indexOf(name) % CIRCLE_COLORS.length];

  const rows = (data.rows ?? [])
    .map((r, i) => {
      const m = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
      const rankCell = m
        ? `<span style="font-size:18px;min-width:32px;text-align:center;display:inline-block">${m}</span>`
        : `<span style="font-size:13px;font-weight:700;color:rgba(0,0,0,0.35);min-width:32px;text-align:right;display:inline-block">#${i + 1}</span>`;
      const clr      = nameColor(r.name, i + 1);
      const badgeClr = circleColor(r.circleName);
      const rowBg    = i % 2 === 0 ? 'rgba(240,98,146,0.04)' : '#ffffff';
      return `<tr style="background:${rowBg}">
      <td style="padding:7px 6px 7px 12px;white-space:nowrap">${rankCell}</td>
      <td style="padding:7px 6px;font-size:13px;font-weight:700;color:${clr};max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.name)}</td>
      <td style="padding:7px 6px;white-space:nowrap">
        <span style="display:inline-block;font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;background:${badgeClr}18;color:${badgeClr};border:1px solid ${badgeClr}44;white-space:nowrap;max-width:110px;overflow:hidden;text-overflow:ellipsis">${esc(r.circleName)}</span>
      </td>
      <td style="padding:7px 12px 7px 6px;font-size:13px;font-weight:700;color:#1a1a1a;text-align:right;white-space:nowrap">${esc(r.gainStr)}</td>
    </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
${FONT_IMPORT}
* { margin:0;padding:0;box-sizing:border-box; }
body { background:#ffffff;font-family:'Noto Sans JP','Noto Sans Symbols 2','Noto Color Emoji',system-ui,-apple-system,Arial,sans-serif;color:#1a1a1a;font-weight:700;display:inline-block;width:680px; }
.card { background:#ffffff;position:relative;overflow:hidden;border:1.5px solid #000000;border-radius:6px; }
table { width:100%;border-collapse:collapse; }
thead th { padding:6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:rgba(0,0,0,0.42);border-bottom:1.5px solid #000000;background:#fafafa; }
thead th:first-child { padding-left:12px; }
thead th:last-child { padding-right:12px; }
td { border-bottom:1.5px solid #000000; }
</style></head>
<body><div class="card">
  <div style="height:3px;background:linear-gradient(90deg,#f06292,#ec407a)"></div>
  <div style="padding:14px 18px 10px;background:linear-gradient(135deg,#f06292 0%,#ec407a 100%)">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div style="font-size:16px;font-weight:900;color:#ffffff">${icon} Inter-Circle — ${esc(data.scope)} Leaderboard</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.72);white-space:nowrap;margin-top:2px;font-weight:700">${esc(data.date)}</div>
    </div>
    <div style="font-size:11px;color:rgba(255,255,255,0.70);margin-top:3px;font-weight:700">${esc(String(data.rows?.length ?? 0))} trainers ranked across ${esc(String(data.circleCount ?? 2))} circles · ${esc(String(data.totalMembers ?? 0))} total members</div>
  </div>
  <table>
    <thead><tr>
      <th style="text-align:center;min-width:40px">#</th>
      <th style="text-align:left">Trainer</th>
      <th style="text-align:left">Circle</th>
      <th style="text-align:right;padding-right:12px">${esc(data.scope)} Fan Gain</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="padding:9px 18px;border-top:1.5px solid #000000;font-size:10px;color:rgba(0,0,0,0.38);display:flex;justify-content:space-between;font-weight:700">
    <span>All Circles Combined</span>
    <span>${esc(data.date)}</span>
  </div>
</div></body></html>`;

  return renderHtml(html, 680);
}
