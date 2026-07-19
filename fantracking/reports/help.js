/**
 * fantracking/reports/help.js
 * ─────────────────────────────
 * renderHelpCard — auto-generated command reference card from registered modules
 */

import { renderHtml } from '../../utils/imageReport-browser.js';
import { esc, FONT_IMPORT } from './ImageReportStandard.js';

const HELP_CATEGORIES = [
  {
    label: 'Fan Tracking',
    icon:  '📊',
    accent: '#1565C0',
    test: n => ['fan_gain','leaderboard','total_fan','total_circlefan_gain','circle_master','memberlist'].includes(n),
  },
  {
    label: 'Trainer',
    icon:  '🔗',
    accent: '#0277BD',
    test: n => ['link','unlink','search_trainer','store','keep'].includes(n),
  },
  {
    label: 'Music',
    icon:  '🎵',
    accent: '#7B1FA2',
    test: n => ['storesong','godplay'].includes(n),
  },
  {
    label: 'Tools',
    icon:  '🛠️',
    accent: '#E65100',
    test: n => ['set_timezone','set_quota','timeline_setup','timeline_post'].includes(n),
  },
  {
    label: 'General',
    icon:  'ℹ️',
    accent: '#3949AB',
    test: n => n === 'help',
  },
  {
    label: 'Admin',
    icon:  '🔧',
    accent: '#BF360C',
    test: n => n.startsWith('admin') || n.startsWith('test'),
  },
];

function groupCommands(modules) {
  const cats  = HELP_CATEGORIES.map(c => ({ ...c, cmds: [] }));
  const other = { label: 'Other', icon: '📦', accent: '#546E7A', cmds: [] };

  for (const mod of modules) {
    const name    = mod.data.name;
    const desc    = mod.data.description;
    const matched = cats.find(c => c.test(name));
    if (matched) matched.cmds.push({ name, desc });
    else other.cmds.push({ name, desc });
  }

  const result = cats.filter(c => c.cmds.length > 0);
  if (other.cmds.length > 0) result.push(other);
  return result;
}

export async function renderHelpCard(modules) {
  const date  = new Date().toISOString().slice(0, 10);
  const total = modules.length;
  const cats  = groupCommands(modules);

  const categorySections = cats
    .map(cat => {
      const rows = cat.cmds
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c, i) => {
          const bg = i % 2 === 0 ? 'rgba(240,98,146,0.04)' : '#ffffff';
          return `<div style="padding:5px 20px 5px 32px;display:flex;gap:10px;align-items:baseline;background:${bg}">
          <span style="font-size:12px;font-weight:700;font-family:'Courier New',monospace;color:${esc(cat.accent)};white-space:nowrap;flex-shrink:0;min-width:190px">/${esc(c.name)}</span>
          <span style="font-size:11px;color:rgba(0,0,0,0.55);line-height:1.4;font-weight:700">${esc(c.desc)}</span>
        </div>`;
        })
        .join('');

      return `
      <div style="padding:9px 20px 5px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.9px;display:flex;align-items:center;gap:7px;border-top:1.5px solid #000000;margin-top:2px;background:#fafafa">
        <div style="width:7px;height:7px;border-radius:50%;background:${esc(cat.accent)};flex-shrink:0"></div>
        <span style="color:${esc(cat.accent)}">${cat.icon} ${esc(cat.label)}</span>
        <span style="color:rgba(0,0,0,0.35);font-weight:700;text-transform:none;letter-spacing:0">${cat.cmds.length} command${cat.cmds.length !== 1 ? 's' : ''}</span>
      </div>
      ${rows}`;
    })
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
${FONT_IMPORT}
* { margin:0;padding:0;box-sizing:border-box; }
body { background:#ffffff;font-family:'Noto Sans JP','Noto Sans Symbols 2','Noto Color Emoji',system-ui,-apple-system,Arial,sans-serif;color:#1a1a1a;font-weight:700;display:inline-block;width:680px; }
.card { background:#ffffff;position:relative;overflow:hidden;border:1.5px solid #000000;border-radius:6px; }
</style></head>
<body><div class="card">
  <div style="height:3px;background:linear-gradient(90deg,#f06292,#ec407a)"></div>
  <div style="padding:14px 20px 10px;background:linear-gradient(135deg,#f06292 0%,#ec407a 100%);border-bottom:none">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div style="font-size:17px;font-weight:900;color:#ffffff">📋 Bot Commands</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.72);white-space:nowrap;margin-top:2px;font-weight:700">${esc(date)}</div>
    </div>
    <div style="font-size:11px;color:rgba(255,255,255,0.70);margin-top:3px;font-weight:700">${esc(String(total))} commands registered · Uma Circle Bot</div>
  </div>
  ${categorySections}
  <div style="padding:9px 20px;border-top:1.5px solid #000000;font-size:10px;color:rgba(0,0,0,0.38);display:flex;justify-content:space-between;margin-top:4px;font-weight:700;background:#ffffff">
    <span>Auto-generated from registered commands</span>
    <span>UmaKraft</span>
  </div>
</div></body></html>`;

  return renderHtml(html, 680);
}
