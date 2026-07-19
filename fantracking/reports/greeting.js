/**
 * fantracking/reports/greeting.js
 * ─────────────────────────────────
 * renderGreetingDm   — per-member DM greeting card
 * renderDailyGreeting — channel-wide morning greeting card
 *
 * These cards intentionally keep a warm, personal tone with a dark-ish card
 * background that acts as a "night sky" / "morning glow" canvas behind the
 * text — different from the white-body data cards. The pink gradient accent
 * bar and pink highlight colour are still applied for brand consistency.
 */

import { renderHtml } from '../../utils/imageReport-browser.js';
import { esc, FONT_IMPORT } from './ImageReportStandard.js';

// ── Greeting type configs ─────────────────────────────────────────────────────

const ACCENT  = '#ec407a';
const ACCENT2 = '#f06292';

const DM_CONFIG = {
  morning: {
    accent:  ACCENT,
    accent2: ACCENT2,
    emoji:   '☀️',
    label:   'Morning Greeting',
    icon:    '🏇',
    title:   'Good morning, <span class="hl">Trainer-san!</span>',
    body:    `Today's going to be a great day — I just know it!<br>
              Let's work hard together and rack up some fans.<br>
              Don't forget to eat properly and take care of yourself too!`,
  },
  noon: {
    accent:  '#E65100',
    accent2: '#FF6D00',
    emoji:   '🌞',
    label:   'Afternoon Greeting',
    icon:    '⚡',
    title:   'How are you doing, <span class="hl">Trainer-san?</span>',
    body:    `We're halfway through the day already! I hope you've been doing well.<br>
              Keep up the momentum — the afternoon is a great time to push those fan numbers higher.<br>
              Remember to take a short break and refuel your energy!`,
  },
  night: {
    accent:  '#7B1FA2',
    accent2: '#9C27B0',
    emoji:   '🌙',
    label:   'Good Night',
    icon:    '💫',
    title:   'Good night, <span class="hl">Trainer-san.</span>',
    body:    `You worked really hard today — thank you so much for everything.<br>
              Even if things didn't go perfectly, tomorrow is a fresh start.<br>
              Please get plenty of rest so we can give it our all again tomorrow!`,
  },
  midnight: {
    accent:  '#1565C0',
    accent2: '#1976D2',
    emoji:   '🌌',
    label:   'Midnight — Go to Sleep!',
    icon:    '😴',
    title:   'Midnight already, <span class="hl">Trainer-san…</span>',
    body:    `I noticed you're still awake and working hard for me even at this hour… I'm really grateful, but also a little worried.<br>
              Your effort means a lot to me, but I also want you to stay healthy and get proper rest.<br>
              Please don't push yourself too much tonight, okay? Let's continue again tomorrow with fresh energy together.<br>
              Good night, Trainer-san.`,
  },
};

// ── Shared card CSS (warm/dark atmosphere for greetings) ─────────────────────

function greetingCss(accent, accent2) {
  return `<style>
${FONT_IMPORT}
* { margin:0; padding:0; box-sizing:border-box; }
body {
  background: #141424;
  font-family: 'Noto Sans JP', 'Noto Color Emoji', 'Noto Sans', system-ui, Arial, sans-serif;
  color: #fff;
  display: inline-block;
  width: 620px;
}
.card {
  background: linear-gradient(170deg,#1c1c30 0%,#141424 100%);
  position: relative;
  overflow: hidden;
  width: 620px;
}
.accent-bar {
  height: 3px;
  background: linear-gradient(90deg, ${accent}, ${accent2 ?? accent});
}
.header {
  padding: 18px 24px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  position: relative; z-index: 1;
}
.htitle {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
  color: #fff;
}
.htitle .hl { color: ${accent}; }
.hdate {
  font-size: 11px;
  color: rgba(255,255,255,0.38);
  margin-top: 4px;
  font-weight: 700;
}
.body {
  padding: 24px 24px 28px;
  position: relative; z-index: 1;
}
.falcon-row {
  display: flex;
  align-items: flex-start;
  gap: 18px;
}
.falcon-icon {
  font-size: 52px;
  line-height: 1;
  flex-shrink: 0;
  margin-top: 2px;
}
.message-block { flex: 1; }
.greeting-main {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.35;
  margin-bottom: 10px;
  color: #fff;
}
.greeting-main .hl { color: ${accent}; }
.greeting-body {
  font-size: 13.5px;
  line-height: 1.7;
  color: rgba(255,255,255,0.80);
  font-weight: 700;
}
.signature {
  margin-top: 14px;
  font-size: 12px;
  font-weight: 700;
  color: rgba(255,255,255,0.42);
  letter-spacing: 0.3px;
}
.footer {
  padding: 10px 24px 14px;
  border-top: 1px solid rgba(255,255,255,0.06);
  font-size: 10px;
  color: rgba(255,255,255,0.22);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  position: relative; z-index: 1;
  font-weight: 700;
}
</style>`;
}

// ── Per-member DM greeting ────────────────────────────────────────────────────

export async function renderGreetingDm({ type, date }) {
  const cfg = DM_CONFIG[type] ?? DM_CONFIG.morning;
  const { accent, accent2, emoji, label, icon, title, body } = cfg;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
${greetingCss(accent, accent2)}
</head>
<body>
<div class="card">
  <div class="accent-bar"></div>
  <div class="header">
    <div class="htitle">${emoji} <span class="hl">${esc(label)}</span></div>
    <div class="hdate">${esc(date)} · UmaKraft Circle</div>
  </div>
  <div class="body">
    <div class="falcon-row">
      <div class="falcon-icon">${icon}</div>
      <div class="message-block">
        <div class="greeting-main">${title}</div>
        <div class="greeting-body">${body}</div>
        <div class="signature">— Smart Falcon ✨</div>
      </div>
    </div>
  </div>
  <div class="footer">UmaKraft Circle Bot · Personal Greeting</div>
</div>
</body>
</html>`;

  return renderHtml(html, 620);
}

// ── Channel-wide daily greeting ───────────────────────────────────────────────

export async function renderDailyGreeting({ date, memberCount = 0 }) {
  const memberLine = memberCount > 0
    ? `<div class="member-badge">Greeting ${memberCount.toLocaleString('en-US')} trainer${memberCount !== 1 ? 's' : ''}</div>`
    : '';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
${greetingCss(ACCENT, ACCENT2)}
<style>
.member-badge {
  display: inline-block;
  margin-top: 16px;
  background: rgba(236,64,122,0.14);
  border: 1px solid rgba(236,64,122,0.30);
  border-radius: 6px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 700;
  color: ${ACCENT};
}
</style>
</head>
<body>
<div class="card">
  <div class="accent-bar"></div>
  <div class="header">
    <div class="htitle">☀️ <span class="hl">Daily Greeting</span></div>
    <div class="hdate">${esc(date)} · UmaKraft Circle</div>
  </div>
  <div class="body">
    <div class="falcon-row">
      <div class="falcon-icon">🏇</div>
      <div class="message-block">
        <div class="greeting-main">Good morning, <span class="hl">Trainer-san!</span></div>
        <div class="greeting-body">
          Let's start today with energy and a smile!<br>
          I'll be cheering for you so we can make this another exciting and successful day together.<br>
          Don't forget to eat properly and take care of yourself too!
        </div>
        <div class="signature">— Smart Falcon ✨</div>
        ${memberLine}
      </div>
    </div>
  </div>
  <div class="footer">UmaKraft Circle Bot · Daily Report</div>
</div>
</body>
</html>`;

  return renderHtml(html, 620);
}
