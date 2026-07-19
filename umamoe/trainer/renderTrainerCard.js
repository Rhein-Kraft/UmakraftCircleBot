// @ts-check
/**
 * umamoe/trainer/renderTrainerCard.js
 * ─────────────────────────────────────
 * Renders a trainer card as a PNG from the raw_profile JSON stored in
 * the trainers DB — no network requests, no uma.moe scraping.
 *
 * Called by trainerLeaderboard.js instead of screenshotter.js.
 */

import { renderHtml } from '../../utils/imageReport-browser.js';
import { esc, FONT_IMPORT } from '../../fantracking/reports/ImageReportStandard.js';
import { charNameById } from '../../utils/characterData.js';

const PURPLE  = '#7c3aed';
const PURPLE2 = '#a78bfa';

const RARITY_STARS = {
  0:'◇',1:'★',2:'★★',3:'★★★',4:'★★★★',5:'★★★★★',
  6:'★×6',7:'★×7',8:'★×8',9:'★×9',10:'★×10',
  11:'S',12:'S+',13:'SS',14:'SS+',15:'SSS',16:'SSS+',17:'U',18:'UF',19:'UF+',
};

function rarityLabel(r) {
  return RARITY_STARS[r] ?? String(r ?? '—');
}

function fmtNum(n) {
  if (n == null || n === 0) return '—';
  return Number(n).toLocaleString();
}

function sparkBar(stars, count, color) {
  if (!stars && !count) return `<span style="color:rgba(0,0,0,0.25)">—</span>`;
  return `<span style="color:${color};font-weight:800">★×${stars}</span>`
       + `<span style="color:rgba(0,0,0,0.45);font-size:11px;margin-left:5px">${count} skill${count !== 1 ? 's' : ''}</span>`;
}

function skillList(names = []) {
  if (!names.length) return '<span style="color:rgba(0,0,0,0.28)">—</span>';
  const items = names.slice(0, 20).map(n => `<span class="skill-pill">${esc(n)}</span>`).join('');
  const more  = names.length > 20 ? `<span class="skill-pill muted">+${names.length - 20} more</span>` : '';
  return `<div class="skill-wrap">${items}${more}</div>`;
}

/**
 * Render a trainer card PNG from stored DB data.
 *
 * @param {object} row        — row from getAllTrainers() / getTrainerById()
 * @param {number} [rankPos]  — leaderboard position (1-based), optional
 * @returns {Promise<Buffer>}
 */
export async function renderTrainerCard(row, rankPos = null) {
  const profile = row.raw_profile ? JSON.parse(row.raw_profile) : {};

  const name       = profile.trainer_name ?? row.character ?? 'Unknown';
  const id         = row.trainer_id ?? '—';
  const comment    = profile.comment?.trim() ?? '';

  const rankScore  = row.rank_score  ?? profile.parent_rank  ?? 0;
  const affinity   = row.affinity_score ?? profile.affinity  ?? 0;
  const g1wins     = row.win_count   ?? profile.win_count    ?? 0;

  const trophy     = profile.trophy ?? {};
  const g1  = trophy.g1  ?? 0;
  const g2  = trophy.g2  ?? 0;
  const g3  = trophy.g3  ?? 0;
  const ex  = trophy.ex  ?? 0;
  const hasRace = g1 || g2 || g3 || ex;

  const mainParent  = charNameById(profile.main_parent_id)  ?? '—';
  const leftParent  = charNameById(profile.parent_left_id)  ?? '—';
  const rightParent = charNameById(profile.parent_right_id) ?? '—';
  const rarity      = profile.parent_rarity != null ? rarityLabel(profile.parent_rarity) : null;
  const hasParents  = profile.main_parent_id || profile.parent_left_id || profile.parent_right_id;

  const blueStars  = profile.blue_stars  ?? 0;
  const pinkStars  = profile.pink_stars  ?? 0;
  const greenStars = profile.green_stars ?? 0;
  const whiteStars = profile.white_stars ?? 0;
  const blueCnt    = profile.blue_sparks?.length  ?? 0;
  const pinkCnt    = profile.pink_sparks?.length  ?? 0;
  const greenCnt   = profile.green_sparks?.length ?? 0;
  const whiteCnt   = profile.white_count ?? 0;
  const hasSparks  = blueStars || pinkStars || greenStars || whiteStars;

  const skillNames = profile.skill_names ?? {};
  const whiteNames = skillNames.white ?? [];
  const blueNames  = skillNames.blue  ?? [];
  const pinkNames  = skillNames.pink  ?? [];
  const greenNames = skillNames.green ?? [];

  const isPermanent   = row.is_saved || !row.expires_at;
  const expiryLabel   = isPermanent
    ? '<span style="color:#16a34a;font-weight:700">✓ Permanent</span>'
    : (() => {
        const ms = new Date(row.expires_at.replace(' ', 'T') + 'Z').getTime();
        const h  = Math.max(0, Math.round((ms - Date.now()) / 3_600_000));
        return `<span style="color:#b45309;font-weight:700">Expires in ~${h}h</span>`;
      })();

  const rankBadge = rankPos != null
    ? `<span class="rank-badge">#${rankPos}</span>`
    : '';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
${FONT_IMPORT}
*{margin:0;padding:0;box-sizing:border-box;}
body{
  background:#ffffff;
  font-family:'Noto Sans JP','Noto Sans Symbols 2','Noto Color Emoji',system-ui,Arial,sans-serif;
  color:#1a1a1a;font-weight:700;
  display:inline-block;width:580px;
}
.card{background:#ffffff;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.12);}

.accent-bar{height:3px;background:linear-gradient(90deg,${PURPLE2},${PURPLE});}

.header{
  padding:14px 20px 12px;
  background:linear-gradient(135deg,${PURPLE2} 0%,${PURPLE} 100%);
}
.hrow{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;}
.htitle{font-size:18px;font-weight:900;color:#fff;letter-spacing:-0.2px;}
.hid{font-size:11px;color:rgba(255,255,255,0.65);font-family:monospace;margin-top:3px;}
.rank-badge{
  font-size:13px;font-weight:800;color:#fff;
  background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.35);
  border-radius:20px;padding:3px 12px;white-space:nowrap;flex-shrink:0;
}
.comment{font-size:11px;color:rgba(255,255,255,0.72);margin-top:6px;font-style:italic;}

.divider{height:1px;background:rgba(0,0,0,0.08);}

.sec{padding:10px 20px 4px;font-size:10px;text-transform:uppercase;letter-spacing:0.8px;color:rgba(0,0,0,0.40);}

.stat-row{display:grid;grid-template-columns:repeat(3,1fr);gap:0;padding:6px 20px 14px;}
.stat-cell{padding:6px 0;}
.stat-cell+.stat-cell{border-left:1px solid rgba(0,0,0,0.07);padding-left:14px;}
.stat-key{font-size:10px;color:rgba(0,0,0,0.40);text-transform:uppercase;letter-spacing:0.7px;}
.stat-val{font-size:20px;font-weight:800;color:${PURPLE};margin-top:2px;}

.race-row{display:flex;gap:8px;padding:4px 20px 14px;flex-wrap:wrap;}
.race-box{
  background:rgba(0,0,0,0.04);border:1px solid rgba(0,0,0,0.08);
  border-radius:8px;padding:8px 14px;text-align:center;flex:1;min-width:60px;
}
.race-label{font-size:9px;text-transform:uppercase;letter-spacing:0.7px;color:rgba(0,0,0,0.40);}
.race-val{font-size:18px;font-weight:800;color:#1a1a1a;margin-top:2px;}

.parent-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:4px 20px 14px;}
.parent-box{background:rgba(124,58,237,0.06);border:1px solid rgba(124,58,237,0.18);border-radius:8px;padding:9px 12px;}
.parent-label{font-size:9px;text-transform:uppercase;letter-spacing:0.7px;color:rgba(0,0,0,0.40);}
.parent-name{font-size:13px;font-weight:700;color:${PURPLE};margin-top:3px;}
.rarity-badge{
  display:inline-block;margin:4px 20px 12px;padding:5px 14px;
  background:rgba(0,0,0,0.04);border:1px solid rgba(0,0,0,0.10);border-radius:6px;
  font-size:13px;font-weight:700;color:#1a1a1a;
}

.spark-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:4px 20px 14px;}
.spark-box{
  background:rgba(0,0,0,0.03);border:1px solid rgba(0,0,0,0.08);
  border-radius:8px;padding:9px 12px;
}
.spark-label{font-size:9px;text-transform:uppercase;letter-spacing:0.7px;color:rgba(0,0,0,0.38);}
.spark-val{font-size:13px;margin-top:4px;}

.skill-wrap{display:flex;flex-wrap:wrap;gap:5px;padding:4px 20px 14px;}
.skill-pill{
  font-size:11px;font-weight:700;padding:3px 9px;border-radius:10px;
  background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.22);color:${PURPLE};
}
.skill-pill.muted{background:rgba(0,0,0,0.05);border-color:rgba(0,0,0,0.12);color:rgba(0,0,0,0.40);}

.footer{
  padding:9px 20px;border-top:1px solid rgba(0,0,0,0.08);
  font-size:10px;color:rgba(0,0,0,0.38);
  display:flex;justify-content:space-between;align-items:center;
  font-weight:700;
}
</style>
</head><body><div class="card">
  <div class="accent-bar"></div>

  <div class="header">
    <div class="hrow">
      <div>
        <div class="htitle">🏇 ${esc(name)}</div>
        <div class="hid">${esc(id)}</div>
      </div>
      ${rankBadge}
    </div>
    ${comment ? `<div class="comment">"${esc(comment)}"</div>` : ''}
  </div>

  <div class="divider"></div>
  <div class="sec">📊 Stats</div>
  <div class="stat-row">
    <div class="stat-cell">
      <div class="stat-key">Rank Score</div>
      <div class="stat-val">${fmtNum(rankScore)}</div>
    </div>
    <div class="stat-cell">
      <div class="stat-key">Affinity</div>
      <div class="stat-val">${fmtNum(affinity)}</div>
    </div>
    <div class="stat-cell">
      <div class="stat-key">G1 Wins</div>
      <div class="stat-val">${g1wins || '—'}</div>
    </div>
  </div>

  ${hasRace ? `
  <div class="divider"></div>
  <div class="sec">🏆 Race Record</div>
  <div class="race-row">
    <div class="race-box"><div class="race-label">G1</div><div class="race-val">${g1}</div></div>
    <div class="race-box"><div class="race-label">G2</div><div class="race-val">${g2}</div></div>
    <div class="race-box"><div class="race-label">G3</div><div class="race-val">${g3}</div></div>
    <div class="race-box"><div class="race-label">Special</div><div class="race-val">${ex}</div></div>
  </div>` : ''}

  ${hasParents ? `
  <div class="divider"></div>
  <div class="sec">🐴 Inheritance</div>
  <div class="parent-row">
    <div class="parent-box"><div class="parent-label">Main</div><div class="parent-name">${esc(mainParent)}</div></div>
    <div class="parent-box"><div class="parent-label">Left</div><div class="parent-name">${esc(leftParent)}</div></div>
    <div class="parent-box"><div class="parent-label">Right</div><div class="parent-name">${esc(rightParent)}</div></div>
  </div>
  ${rarity ? `<div class="rarity-badge">Rarity: ${esc(rarity)}</div>` : ''}` : ''}

  ${hasSparks ? `
  <div class="divider"></div>
  <div class="sec">✨ Sparks</div>
  <div class="spark-grid">
    <div class="spark-box">
      <div class="spark-label">🔵 Speed</div>
      <div class="spark-val">${sparkBar(blueStars, blueCnt, '#1d4ed8')}</div>
    </div>
    <div class="spark-box">
      <div class="spark-label">🩷 Power</div>
      <div class="spark-val">${sparkBar(pinkStars, pinkCnt, '#be185d')}</div>
    </div>
    <div class="spark-box">
      <div class="spark-label">🟢 Skill</div>
      <div class="spark-val">${sparkBar(greenStars, greenCnt, '#15803d')}</div>
    </div>
    <div class="spark-box">
      <div class="spark-label">⚪ Inherit</div>
      <div class="spark-val">${sparkBar(whiteStars, whiteCnt, '#92400e')}</div>
    </div>
  </div>` : ''}

  ${whiteNames.length ? `
  <div class="divider"></div>
  <div class="sec">⚪ Inherited Skills</div>
  ${skillList(whiteNames)}` : ''}

  ${blueNames.length ? `
  <div class="divider"></div>
  <div class="sec">🔵 Speed Skills</div>
  ${skillList(blueNames)}` : ''}

  ${pinkNames.length ? `
  <div class="divider"></div>
  <div class="sec">🩷 Power Skills</div>
  ${skillList(pinkNames)}` : ''}

  ${greenNames.length ? `
  <div class="divider"></div>
  <div class="sec">🟢 Skill Skills</div>
  ${skillList(greenNames)}` : ''}

  <div class="divider"></div>
  <div class="footer">
    <span>uma.moe · UmaKraft Trainer DB</span>
    <span>${expiryLabel}</span>
  </div>
</div></body></html>`;

  return renderHtml(html, 580);
}
