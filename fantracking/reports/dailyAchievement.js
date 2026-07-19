// @ts-check
/**
 * utils/reports/dailyAchievement.js
 * ───────────────────────────────────
 * Renders a Daily Achievement milestone card as a PNG buffer.
 * Used by tasks/dailyAchievement.js for both channel posts and member DMs.
 */

import { renderHtml } from '../../utils/imageReport-browser.js';
import { FONT_IMPORT } from './ImageReportStandard.js';

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
 * Render a daily achievement milestone card as a PNG buffer.
 *
 * @param {{
 *   emoji: string,
 *   milestoneLabel: string,
 *   body: string,
 *   date: string,
 *   color: string,
 *   color2?: string,
 * }} opts
 * @returns {Promise<Buffer>}
 */
export async function renderDailyAchievement({ emoji, milestoneLabel, body, date, color, color2 }) {
  const c2 = color2 ?? color + '99';
  const htmlBody = formatBody(body);

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
  color: rgba(255,255,255,0.05);
  white-space: nowrap;
  pointer-events: none;
  z-index: 0;
  letter-spacing: -4px;
  user-select: none;
}
.accent-bar { height: 4px; background: linear-gradient(90deg,${color},${c2}); }
.header {
  padding: 20px 26px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  position: relative; z-index: 1;
}
.milestone-badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  background: rgba(255,255,255,0.04);
  border: 1px solid ${color}55;
  border-radius: 8px;
  padding: 8px 16px;
  margin-bottom: 10px;
}
.badge-emoji { font-size: 28px; line-height: 1; }
.badge-label {
  font-size: 22px;
  font-weight: 900;
  color: ${color};
  letter-spacing: -0.5px;
}
.badge-sub {
  font-size: 12px;
  color: rgba(255,255,255,0.45);
  font-weight: 400;
  margin-left: 4px;
}
.htitle {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255,255,255,0.45);
  text-transform: uppercase;
  letter-spacing: 0.8px;
}
.hdate {
  font-size: 11px;
  color: rgba(255,255,255,0.28);
  margin-top: 3px;
}
.body {
  padding: 22px 26px 26px;
  position: relative; z-index: 1;
}
.body p {
  font-size: 13.5px;
  line-height: 1.78;
  color: rgba(255,255,255,0.82);
  margin-bottom: 13px;
}
.body p:last-child { margin-bottom: 0; }
.body .hl { color: ${color}; font-weight: 700; }
.footer {
  padding: 10px 26px 14px;
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
    <div class="milestone-badge">
      <span class="badge-emoji">${emoji}</span>
      <span class="badge-label">${milestoneLabel}<span class="badge-sub"> Daily Fans</span></span>
    </div>
    <div class="htitle">Daily Achievement Unlocked</div>
    <div class="hdate">${date} · UmaKraft Circle</div>
  </div>
  <div class="body">${htmlBody}</div>
  <div class="footer">
    <span>UmaKraft Circle Bot</span>
    <span>Daily Achievement</span>
  </div>
</div>
</body>
</html>`;

  return renderHtml(html, 660);
}
