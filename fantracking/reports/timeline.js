/**
 * fantracking/reports/timeline.js
 * ─────────────────────────────────
 * renderTimeline       — vertical event timeline card
 * renderTimelineSetup  — channel/role configuration confirmation card
 */

import { renderHtml } from '../../utils/imageReport-browser.js';
import { esc, trainerColor, FONT_IMPORT, STANDARD_CSS } from './ImageReportStandard.js';

// ── Event type metadata ───────────────────────────────────────────────────────

const EVENT_META = {
  milestone: { icon: '🎯', color: '#7B1FA2', label: 'Milestone'  },
  rank:      { icon: '🏆', color: '#E65100', label: 'Rank Up'    },
  join:      { icon: '🌸', color: '#2e7d32', label: 'Joined'     },
  leave:     { icon: '👋', color: '#c62828', label: 'Left'       },
  warning:   { icon: '⚠️', color: '#FF6D00', label: 'Warning'    },
  record:    { icon: '💎', color: '#1565C0', label: 'Record'     },
  event:     { icon: '📅', color: '#ec407a', label: 'Event'      },
  generic:   { icon: '📌', color: '#546E7A', label: 'Update'     },
};

function eventMeta(type) {
  return EVENT_META[type] ?? EVENT_META.generic;
}

function fmtDateLabel(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Main timeline render ──────────────────────────────────────────────────────

export async function renderTimeline(data) {
  const events  = data.events ?? [];
  const titleLn = data.title ?? 'Circle Timeline';
  const desc    = data.description ?? '';
  const period  = data.period ?? '';

  const timelineItems = events.map((evt, i) => {
    const meta    = eventMeta(evt.type);
    const isLast  = i === events.length - 1;
    const nameClr = evt.trainerName ? trainerColor(evt.trainerName) : '#1a1a1a';
    const notesHtml = evt.notes
      ? `<div style="font-size:11px;color:rgba(0,0,0,0.50);margin-top:4px;line-height:1.4;font-weight:700">${esc(evt.notes)}</div>`
      : '';
    const nameHtml = evt.trainerName
      ? `<span style="color:${nameClr};font-weight:700"> · ${esc(evt.trainerName)}</span>`
      : '';

    return `
    <div style="display:flex;gap:14px;padding:0 0 ${isLast ? '0' : '18px'}">
      <!-- Timeline spine -->
      <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:36px">
        <div style="width:32px;height:32px;border-radius:50%;background:${meta.color}18;border:2px solid ${meta.color}44;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;z-index:1;position:relative">${meta.icon}</div>
        ${!isLast ? `<div style="flex:1;width:2px;background:linear-gradient(to bottom,${meta.color}44,rgba(0,0,0,0.07));margin-top:4px;min-height:14px"></div>` : ''}
      </div>
      <!-- Content -->
      <div style="flex:1;padding-top:5px;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
          <span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:10px;background:${meta.color}16;color:${meta.color};border:1px solid ${meta.color}33;white-space:nowrap">${esc(meta.label)}</span>
          <span style="font-size:10px;color:rgba(0,0,0,0.38);white-space:nowrap;font-weight:700">${fmtDateLabel(evt.date)}</span>
        </div>
        <div style="font-size:13px;font-weight:700;color:#1a1a1a;line-height:1.35">
          ${esc(evt.title ?? '')}${nameHtml}
        </div>
        ${notesHtml}
      </div>
    </div>`;
  }).join('');

  const emptyState = events.length === 0 ? `
  <div style="text-align:center;padding:34px 20px;color:rgba(0,0,0,0.35)">
    <div style="font-size:30px;margin-bottom:8px">📅</div>
    <div style="font-size:13px;font-weight:700">No events recorded yet.</div>
  </div>` : '';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
${FONT_IMPORT}
* { margin:0;padding:0;box-sizing:border-box; }
body { background:#ffffff;font-family:'Noto Sans JP','Noto Sans Symbols 2','Noto Color Emoji',system-ui,-apple-system,Arial,sans-serif;color:#1a1a1a;font-weight:700;display:inline-block;width:560px; }
.card { background:#ffffff;overflow:hidden;border:1.5px solid #000000;border-radius:6px; }
</style></head>
<body><div class="card">
  <div style="height:3px;background:linear-gradient(90deg,#f06292,#ec407a)"></div>
  <div style="padding:14px 20px 10px;background:linear-gradient(135deg,#f06292 0%,#ec407a 100%)">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div style="font-size:16px;font-weight:900;color:#ffffff">📅 ${esc(titleLn)}</div>
      ${period ? `<div style="font-size:10px;color:rgba(255,255,255,0.72);white-space:nowrap;margin-top:3px;font-weight:700">${esc(period)}</div>` : ''}
    </div>
    ${desc ? `<div style="font-size:11px;color:rgba(255,255,255,0.70);margin-top:3px;font-weight:700">${esc(desc)}</div>` : ''}
  </div>
  <div style="padding:18px 20px 16px;background:#ffffff">
    ${timelineItems || emptyState}
  </div>
  <div style="padding:9px 20px;border-top:1.5px solid #000000;font-size:10px;color:rgba(0,0,0,0.38);display:flex;justify-content:space-between;font-weight:700;background:#ffffff">
    <span>${esc(data.circleName ?? '')} · uma.moe</span>
    <span>${esc(String(events.length))} event${events.length !== 1 ? 's' : ''}</span>
  </div>
</div></body></html>`;

  return renderHtml(html, 560);
}

// ── Setup confirmation ────────────────────────────────────────────────────────

export async function renderTimelineSetup(data) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${STANDARD_CSS}
body{width:460px}</style></head>
<body><div class="card">
  <div class="accent-bar"></div>
  <div class="header">
    <div class="htitle">⚙️ Timeline Configured</div>
    <div class="hsub">${esc(data.circleName ?? '')}</div>
  </div>
  <div class="stat-grid">
    <div class="stat-cell">
      <div class="stat-lbl">Channel</div>
      <div class="stat-val" style="font-size:14px">${esc(data.channelName ?? '—')}</div>
    </div>
    <div class="stat-cell">
      <div class="stat-lbl">Ping Role</div>
      <div class="stat-val" style="font-size:14px">${esc(data.roleName ?? 'None')}</div>
    </div>
    <div class="stat-cell" style="grid-column:1/-1">
      <div class="stat-lbl">Status</div>
      <div class="stat-val" style="color:#2e7d32">✅ Ready to post</div>
    </div>
  </div>
  <div class="footer">
    <span>Use /timeline_post to add events</span>
    <span>${esc(data.date ?? '')}</span>
  </div>
</div></body></html>`;
  return renderHtml(html, 460);
}
