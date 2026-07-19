/**
 * fantracking/reports/milestone.js
 * ─────────────────────────────────
 * renderMilestone       — personal fan-count milestone celebration card
 * renderCircleMilestone — circle-wide collective milestone card
 */

import { renderHtml } from '../../utils/imageReport-browser.js';
import { esc, trainerColor, FONT_IMPORT } from './ImageReportStandard.js';

// ── Milestone tier lookup ─────────────────────────────────────────────────────

const TIERS = [
  { threshold: 1_000_000_000, label: 'ONE BILLION FANS', emoji: '🌌', color: '#ffd700' },
  { threshold: 500_000_000,   label: '500 MILLION FANS', emoji: '💫', color: '#ffd700' },
  { threshold: 100_000_000,   label: '100 MILLION FANS', emoji: '⭐', color: '#E65100' },
  { threshold: 50_000_000,    label: '50 MILLION FANS',  emoji: '🌟', color: '#7B1FA2' },
  { threshold: 30_000_000,    label: '30 MILLION FANS',  emoji: '🎯', color: '#1565C0' },
  { threshold: 10_000_000,    label: '10 MILLION FANS',  emoji: '🏆', color: '#0277BD' },
  { threshold: 1_000_000,     label: '1 MILLION FANS',   emoji: '🎉', color: '#2e7d32' },
  { threshold: 0,             label: 'FAN MILESTONE',    emoji: '🎊', color: '#ec407a' },
];

function tierFor(fans) {
  return TIERS.find(t => fans >= t.threshold) ?? TIERS[TIERS.length - 1];
}

function fmtFull(n) {
  if (typeof n !== 'number') return '—';
  return n.toLocaleString('en-US');
}

function fmtCompact(n) {
  if (!n) return '0';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '') + 'B';
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (n >= 1_000)         return (n / 1_000).toFixed(1).replace(/\.?0+$/, '') + 'K';
  return String(Math.round(n));
}

// ── Personal milestone ────────────────────────────────────────────────────────

export async function renderMilestone(data) {
  const tier        = tierFor(data.totalFans ?? 0);
  const nameColor   = trainerColor(data.trainerName);
  const circleColor = '#ec407a';

  const prevFansHtml = data.prevFans != null
    ? `<div style="font-size:12px;color:rgba(255,255,255,0.60);margin-top:3px;font-weight:700">Previously: ${fmtCompact(data.prevFans)} fans</div>`
    : '';

  const achievementsHtml = (data.achievements ?? []).length > 0
    ? `<div style="margin:0 20px 14px;padding:10px 14px;background:rgba(0,0,0,0.04);border-radius:8px;border:1.5px solid #000000">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.7px;color:rgba(0,0,0,0.40);margin-bottom:7px;font-weight:700">Also achieved</div>
        ${data.achievements.map(a => `<div style="font-size:13px;font-weight:700;color:#1a1a1a;margin-bottom:4px">${esc(a)}</div>`).join('')}
      </div>`
    : '';

  // ── Art panel ──────────────────────────────────────────────────────────────
  // Character art section (white area, image shown if URL provided)
  const artHtml = data.artUrl
    ? `<div style="width:100%;background:#ffffff;display:flex;justify-content:center;align-items:center;padding:14px 0 0;overflow:hidden">
         <img src="${esc(data.artUrl)}" style="max-height:180px;max-width:100%;object-fit:contain;display:block" onerror="this.style.display='none'" />
       </div>`
    : '';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
${FONT_IMPORT}
* { margin:0;padding:0;box-sizing:border-box; }
body { background:#ffffff;font-family:'Noto Sans JP','Noto Sans Symbols 2','Noto Color Emoji',system-ui,-apple-system,Arial,sans-serif;color:#1a1a1a;font-weight:700;display:inline-block;width:560px; }
.card { background:#ffffff;overflow:hidden;border:1.5px solid #000000;border-radius:6px; }
</style></head>
<body><div class="card">
  <div style="height:4px;background:linear-gradient(90deg,#f06292,#ec407a,${tier.color})"></div>

  <!-- Header gradient -->
  <div style="padding:20px 22px 16px;background:linear-gradient(135deg,#f06292 0%,#ec407a 100%);text-align:center">
    <div style="font-size:40px;line-height:1;margin-bottom:8px">${tier.emoji}</div>
    <div style="font-size:21px;font-weight:900;letter-spacing:0.5px;color:#ffffff;text-transform:uppercase;letter-spacing:1px">${esc(tier.label)}</div>
    <div style="font-size:14px;color:rgba(255,255,255,0.75);margin-top:4px;font-weight:700">🎉 Milestone Reached!</div>
  </div>

  <!-- White body -->
  <div style="background:#ffffff">
    ${artHtml}

    <!-- Trainer info -->
    <div style="padding:18px 22px 4px;text-align:center">
      <div style="font-size:22px;font-weight:900;color:${nameColor}">${esc(data.trainerName)}</div>
      <div style="font-size:11px;color:rgba(0,0,0,0.42);margin-top:2px;font-weight:700">${esc(data.circleName)} · ${esc(data.date)}</div>
    </div>

    <!-- Fan count -->
    <div style="text-align:center;padding:12px 22px 16px">
      <div style="font-size:36px;font-weight:900;color:${tier.color};letter-spacing:-1px;line-height:1">${fmtCompact(data.totalFans)}</div>
      <div style="font-size:13px;color:rgba(0,0,0,0.45);margin-top:4px;font-weight:700">${fmtFull(data.totalFans)} fans total</div>
    </div>

    <!-- Stats row -->
    <div style="display:flex;padding:0 14px 14px;gap:10px">
      <div style="flex:1;text-align:center;padding:10px 8px;background:rgba(0,0,0,0.04);border-radius:8px;border:1.5px solid #000000">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.6px;color:rgba(0,0,0,0.42);margin-bottom:4px;font-weight:700">This Month</div>
        <div style="font-size:15px;font-weight:700;color:#1a1a1a">${esc(fmtCompact(data.monthlyGain))}</div>
      </div>
      <div style="flex:1;text-align:center;padding:10px 8px;background:rgba(0,0,0,0.04);border-radius:8px;border:1.5px solid #000000">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.6px;color:rgba(0,0,0,0.42);margin-bottom:4px;font-weight:700">Circle Rank</div>
        <div style="font-size:15px;font-weight:700;color:#ec407a">${esc(data.circleRank ?? '—')}</div>
      </div>
      <div style="flex:1;text-align:center;padding:10px 8px;background:rgba(0,0,0,0.04);border-radius:8px;border:1.5px solid #000000">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.6px;color:rgba(0,0,0,0.42);margin-bottom:4px;font-weight:700">Days Active</div>
        <div style="font-size:15px;font-weight:700;color:#1a1a1a">${esc(String(data.daysActive ?? '—'))}</div>
      </div>
    </div>

    ${achievementsHtml}
  </div>

  <div style="padding:9px 22px;border-top:1.5px solid #000000;font-size:10px;color:rgba(0,0,0,0.38);display:flex;justify-content:space-between;font-weight:700;background:#ffffff">
    <span>${esc(data.circleName)} · uma.moe</span>
    <span>${esc(data.date)}</span>
  </div>
</div></body></html>`;

  return renderHtml(html, 560);
}

// ── Circle milestone ──────────────────────────────────────────────────────────

export async function renderCircleMilestone(data) {
  const tier = tierFor(data.totalFans ?? 0);

  const memberHtml = (data.topContributors ?? [])
    .slice(0, 5)
    .map((m, i) => {
      const medal  = ['🥇', '🥈', '🥉'][i] ?? `#${i + 1}`;
      const nColor = trainerColor(m.name);
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 20px;border-bottom:1.5px solid #000000">
        <span style="font-size:18px;flex-shrink:0;min-width:28px">${medal}</span>
        <span style="flex:1;font-size:13px;font-weight:700;color:${nColor};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.name)}</span>
        <span style="font-size:13px;font-weight:700;color:#E65100;min-width:80px;text-align:right">${esc(fmtCompact(m.monthlyGain))}</span>
      </div>`;
    })
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
${FONT_IMPORT}
* { margin:0;padding:0;box-sizing:border-box; }
body { background:#ffffff;font-family:'Noto Sans JP','Noto Sans Symbols 2','Noto Color Emoji',system-ui,-apple-system,Arial,sans-serif;color:#1a1a1a;font-weight:700;display:inline-block;width:560px; }
.card { background:#ffffff;overflow:hidden;border:1.5px solid #000000;border-radius:6px; }
</style></head>
<body><div class="card">
  <div style="height:4px;background:linear-gradient(90deg,#f06292,#ec407a,${tier.color})"></div>
  <div style="padding:20px 22px 16px;background:linear-gradient(135deg,#f06292 0%,#ec407a 100%);text-align:center">
    <div style="font-size:40px;line-height:1;margin-bottom:8px">${tier.emoji} 🌸 ${tier.emoji}</div>
    <div style="font-size:19px;font-weight:900;color:#ffffff;letter-spacing:0.5px">${esc(data.circleName)}</div>
    <div style="font-size:15px;color:rgba(255,255,255,0.85);margin-top:4px;font-weight:700">Circle ${esc(tier.label)} Reached!</div>
  </div>
  <div style="background:#ffffff">
    <div style="text-align:center;padding:18px 22px 10px">
      <div style="font-size:38px;font-weight:900;color:${tier.color};letter-spacing:-1px;line-height:1">${fmtCompact(data.totalFans)}</div>
      <div style="font-size:13px;color:rgba(0,0,0,0.45);margin-top:4px;font-weight:700">combined circle fans · ${fmtFull(data.totalFans)} total</div>
    </div>
    <div style="display:flex;padding:0 14px 14px;gap:10px">
      <div style="flex:1;text-align:center;padding:10px 8px;background:rgba(0,0,0,0.04);border-radius:8px;border:1.5px solid #000000">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:rgba(0,0,0,0.42);margin-bottom:4px;font-weight:700">Members</div>
        <div style="font-size:17px;font-weight:700;color:#1a1a1a">${esc(String(data.memberCount ?? '—'))}</div>
      </div>
      <div style="flex:1;text-align:center;padding:10px 8px;background:rgba(0,0,0,0.04);border-radius:8px;border:1.5px solid #000000">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:rgba(0,0,0,0.42);margin-bottom:4px;font-weight:700">Monthly Gain</div>
        <div style="font-size:17px;font-weight:700;color:#2e7d32">${esc(fmtCompact(data.monthlyGain ?? 0))}</div>
      </div>
    </div>
    ${memberHtml ? `
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.7px;color:rgba(0,0,0,0.40);padding:6px 20px;border-top:1.5px solid #000000;font-weight:700">Top Contributors</div>
    ${memberHtml}` : ''}
  </div>
  <div style="padding:9px 22px;border-top:1.5px solid #000000;font-size:10px;color:rgba(0,0,0,0.38);display:flex;justify-content:space-between;font-weight:700;background:#ffffff">
    <span>${esc(data.circleName)} · uma.moe</span>
    <span>${esc(data.date)}</span>
  </div>
</div></body></html>`;

  return renderHtml(html, 560);
}
