// @ts-check
/**
 * utils/reports/dailyFanWarning.js
 * ──────────────────────────────────
 * Renders a Daily Fan Warning card as a PNG buffer.
 * Used by tasks/dailyFanWarning.js when the circle's total daily fan gain
 * ends the day below the 1,000,000 fan goal.
 *
 * Layout:
 *  ┌──────────────────────────────────────┐
 *  │ ▓▓▓ red accent bar                  │
 *  │ ⚠️ Daily Fan Warning  [date]         │
 *  │ ─────────────────────────────────── │
 *  │ [Circle Gain] [Goal]  [Shortfall]   │  ← stat grid
 *  │ ─ progress bar ─────────────────── │
 *  │ body paragraphs (variant message)   │
 *  │ ─────────────────────────────────── │
 *  │ UmaKraft Circle Bot · Daily Warning │
 *  └──────────────────────────────────────┘
 */

import { renderHtml } from '../../utils/imageReport-browser.js';
import { FONT_IMPORT } from './ImageReportStandard.js';

/**
 * Format a large number compactly (e.g. 875000 → "875K", 1200000 → "1.2M").
 * @param {number} n
 * @returns {string}
 */
function fmt(n) {
  if (!n || n === 0) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.?0+$/, '') + 'K';
  return String(Math.round(n));
}

/**
 * Convert raw variant body text (**bold** markers + \n\n paragraph breaks)
 * into safe, styled HTML paragraphs.
 * @param {string} raw
 * @returns {string}
 */
function formatBody(raw) {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<span class="hl">$1</span>')
    .split('\n\n')
    .filter(p => p.trim())
    .map(p => `<p>${p.trim().replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * Render a daily fan warning card as a PNG buffer.
 *
 * @param {{
 *   emoji: string,
 *   body: string,
 *   date: string,
 *   circleName: string,
 *   circleDailyGain: number,
 *   goalFans?: number,
 *   trainerName?: string,
 * }} opts
 * @returns {Promise<Buffer>}
 */
export async function renderDailyFanWarning({
  emoji,
  body,
  date,
  circleName,
  circleDailyGain,
  goalFans = 1_000_000,
  trainerName = null,
}) {
  const shortfall   = Math.max(0, goalFans - circleDailyGain);
  const progressPct = Math.min(99, Math.round((circleDailyGain / goalFans) * 100));
  const htmlBody    = formatBody(body);
  const escape = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeTrainerName = trainerName != null ? escape(trainerName) : null;
  const safeCircleName  = circleName != null ? escape(circleName) : null;

  const ACCENT  = '#c62828';
  const ACCENT2 = '#ef5350';
  const BG_TINT = 'rgba(198,40,40,0.07)';

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${FONT_IMPORT}
* { margin:0; padding:0; box-sizing:border-box; }
body {
  background: #0d0d1f;
  font-family: 'Noto Sans JP', 'Noto Color Emoji', 'Noto Sans', system-ui, Arial, sans-serif;
  color: #fff;
  display: inline-block;
  width: 660px;
}
.card {
  background: linear-gradient(170deg,#161628 0%,#0d0d1f 100%);
  position: relative;
  overflow: hidden;
  width: 660px;
}
.card::after {
  content: 'UmaKraft';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%,-50%) rotate(-20deg);
  font-size: 150px;
  font-weight: 900;
  color: rgba(255,255,255,0.04);
  white-space: nowrap;
  pointer-events: none;
  z-index: 0;
  letter-spacing: -4px;
  user-select: none;
}
.accent-bar { height: 4px; background: linear-gradient(90deg,${ACCENT},${ACCENT2}); }

/* ── Header ── */
.header {
  padding: 20px 26px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  position: relative; z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.warn-badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  background: ${BG_TINT};
  border: 1px solid ${ACCENT}66;
  border-radius: 8px;
  padding: 8px 16px;
}
.badge-emoji { font-size: 26px; line-height: 1; }
.badge-title {
  font-size: 18px;
  font-weight: 900;
  color: ${ACCENT2};
  letter-spacing: -0.3px;
}
.badge-sub {
  font-size: 11px;
  color: rgba(255,255,255,0.38);
  margin-top: 2px;
}
.hright { text-align: right; }
.htag {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.9px;
  color: rgba(255,255,255,0.28);
  margin-bottom: 3px;
}
.hdate {
  font-size: 11px;
  color: rgba(255,255,255,0.38);
}

/* ── Stats grid ── */
.stats {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 1px;
  background: rgba(255,255,255,0.06);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  position: relative; z-index: 1;
}
.stat-cell {
  background: #161628;
  padding: 14px 18px;
  text-align: center;
}
.stat-val {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.5px;
}
.stat-lbl {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.7px;
  color: rgba(255,255,255,0.28);
  margin-top: 4px;
}

/* ── Progress bar ── */
.progress-wrap {
  padding: 14px 26px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  position: relative; z-index: 1;
}
.prog-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: rgba(255,255,255,0.32);
  margin-bottom: 6px;
}
.prog-track {
  height: 8px;
  background: rgba(255,255,255,0.07);
  border-radius: 4px;
  overflow: hidden;
}
.prog-fill {
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg,${ACCENT},${ACCENT2});
}

/* ── Body ── */
.body {
  padding: 20px 26px 24px;
  position: relative; z-index: 1;
}
.body p {
  font-size: 13px;
  line-height: 1.8;
  color: rgba(255,255,255,0.78);
  margin-bottom: 12px;
}
.body p:last-child { margin-bottom: 0; }
.body .hl { color: ${ACCENT2}; font-weight: 700; }

/* ── Footer ── */
.footer {
  padding: 9px 26px 13px;
  border-top: 1px solid rgba(255,255,255,0.05);
  font-size: 10px;
  color: rgba(255,255,255,0.2);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  display: flex;
  justify-content: space-between;
  position: relative; z-index: 1;
}
</style>
</head>
<body>
<div class="card">
  <div class="accent-bar"></div>

  <div class="header">
    <div>
      <div class="warn-badge">
        <span class="badge-emoji">${emoji}</span>
        <div>
          <div class="badge-title">⚠️ Daily Fan Warning</div>
          <div class="badge-sub">${safeTrainerName ? "You didn't reach today's goal" : "Circle did not reach today's goal"}</div>
        </div>
      </div>
    </div>
    <div class="hright">
      <div class="htag">${safeCircleName || 'UmaKraft Circle'}</div>
      <div class="hdate">${date}</div>
      ${safeTrainerName ? `<div style="margin-top:6px;font-size:12px;font-weight:700;color:rgba(255,255,255,0.55);">${safeTrainerName}</div>` : ''}
    </div>
  </div>

  <div class="stats">
    <div class="stat-cell">
      <div class="stat-val" style="color:${ACCENT2}">+${fmt(circleDailyGain)}</div>
      <div class="stat-lbl">Today's Gain</div>
    </div>
    <div class="stat-cell">
      <div class="stat-val" style="color:rgba(255,255,255,0.4)">+${fmt(goalFans)}</div>
      <div class="stat-lbl">Daily Goal</div>
    </div>
    <div class="stat-cell">
      <div class="stat-val" style="color:rgba(255,255,255,0.55)">−${fmt(shortfall)}</div>
      <div class="stat-lbl">Shortfall</div>
    </div>
  </div>

  <div class="progress-wrap">
    <div class="prog-labels">
      <span>Today's Progress — ${progressPct}% of goal</span>
      <span>Goal: +${fmt(goalFans)}</span>
    </div>
    <div class="prog-track">
      <div class="prog-fill" style="width:${progressPct}%"></div>
    </div>
  </div>

  <div class="body">${htmlBody}</div>

  <div class="footer">
    <span>UmaKraft Circle Bot</span>
    <span>Daily Fan Warning</span>
  </div>
</div>
</body>
</html>`;

  return renderHtml(html, 660);
}
