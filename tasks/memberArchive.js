// @ts-check
/**
 * tasks/memberArchive.js
 * ──────────────────────
 * Generates and maintains per-member Markdown profile files in:
 *
 *   Member-Archive/
 *     active/    ← current circle members
 *     inactive/  ← former members
 *
 * Each file contains:
 *   • Header      — name, trainer ID, circle, status, last updated
 *   • Rolling Gains — live 3-day / 7-day / 30-day
 *   • Monthly History — merged DB + PastHistoryTrainer table
 *   • Daily Gain Log  — every date from join day to today, split by year
 *
 * Active/inactive status is derived from getActiveMembers() vs. the current
 * file locations.  Files are moved between directories automatically; they are
 * never deleted.
 */

import { mkdirSync, writeFileSync, existsSync, renameSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getConfiguredCircles } from '../core/config.js';
import { log } from '../core/log.js';
import {
  getActiveMembers,
  getMemberMonthlyHistoryDetailed,
  getDb,
} from '../db/storeDb.js';
import { getJoinDateFromNotes } from '../umamoe/history/joinDateNotes.js';
import { getCircleSnapshot } from '../umamoe/umaCache.js';
import { getPastProfile } from '../utils/pastHistoryReader.js';

// ── Directories ───────────────────────────────────────────────────────────────

const ARCHIVE_ROOT = path.resolve('Member-Archive');
const ACTIVE_DIR   = path.join(ARCHIVE_ROOT, 'active');
const INACTIVE_DIR = path.join(ARCHIVE_ROOT, 'inactive');

function ensureDirs() {
  mkdirSync(ACTIVE_DIR,   { recursive: true });
  mkdirSync(INACTIVE_DIR, { recursive: true });
}

// ── Formatting helpers ────────────────────────────────────────────────────────

/** Comma-separated integer, or '—' for null/undefined/0-but-null-intent. */
function fmt(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-US');
}

/** Format a month key 'YYYY-MM' → 'Mon YYYY'. */
function fmtMonth(ym) {
  const [y, m] = ym.split('-');
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${names[Number(m) - 1]} ${y}`;
}

// ── Data helpers ──────────────────────────────────────────────────────────────

/**
 * Return all daily_gains rows for one member, keyed by date string.
 * @param {string} circleId
 * @param {string} trainerId
 * @returns {Map<string, number>} date → gain
 */
function getDailyGainMap(circleId, trainerId) {
  const rows = getDb()
    .prepare(`
      SELECT date, gain
      FROM daily_gains
      WHERE circle_id = ? AND viewer_id = ?
      ORDER BY date ASC
    `)
    .all(String(circleId), String(trainerId));

  const map = new Map();
  for (const r of rows) map.set(r.date, r.gain);
  return map;
}

/**
 * Enumerate every calendar date from startIso to todayIso (inclusive).
 * @param {string} startIso  YYYY-MM-DD
 * @param {string} todayIso  YYYY-MM-DD
 * @returns {string[]}
 */
function dateRange(startIso, todayIso) {
  const dates = [];
  const cursor = new Date(startIso + 'T00:00:00Z');
  const end    = new Date(todayIso  + 'T00:00:00Z');
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Scan a directory for a file whose first 4 lines mention the given trainer ID.
 * Returns the filename (not full path), or null.
 * @param {string} dir
 * @param {string} trainerId
 * @returns {string|null}
 */
function findFileByTrainerId(dir, trainerId) {
  if (!existsSync(dir)) return null;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    try {
      const head = readFileSync(path.join(dir, f), 'utf8').split('\n').slice(0, 4).join('\n');
      if (head.includes(`\`${trainerId}\``)) return f;
    } catch { /* skip unreadable */ }
  }
  return null;
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

/**
 * Build the full Markdown content for one member.
 *
 * @param {{
 *   trainerName: string,
 *   trainerId:   string,
 *   circleName:  string,
 *   isActive:    boolean,
 *   joinDate:    string|null,
 *   updatedDate: string,
 *   rolling3d:   number,
 *   rolling7d:   number,
 *   rolling30d:  number,
 *   monthlyRows: Array<{ month: string, totalGain: number, activeDays: number|null, bestDay: number|null, isCurrent?: boolean }>,
 *   dailyMap:    Map<string, number>,
 *   circleId:    string,
 *   monthlyReq:  number,
 * }} opts
 * @returns {string}
 */
function renderMemberMarkdown(opts) {
  const {
    trainerName, trainerId, circleName, isActive, joinDate,
    updatedDate, rolling3d, rolling7d, rolling30d,
    monthlyRows, dailyMap, monthlyReq,
  } = opts;

  const status = isActive ? '🟢 Active' : '🔴 Inactive';
  const lines  = [];

  // ── Header ────────────────────────────────────────────────────────────────
  lines.push(`# ${trainerName}`);
  lines.push(`**Trainer ID:** \`${trainerId}\` | **Circle:** ${circleName} | **Status:** ${status} | **Updated:** ${updatedDate}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── Reusable trainer reference line (shown above each table) ─────────────
  const trainerRef = `> **Trainer:** ${trainerName} &nbsp;·&nbsp; **ID:** \`${trainerId}\``;

  // ── Rolling Gains ─────────────────────────────────────────────────────────
  lines.push('## Rolling Gains');
  lines.push('');
  lines.push(trainerRef);
  lines.push('');
  lines.push('| Period | Fans Gained |');
  lines.push('|--------|------------:|');
  lines.push(`| 3-Day  | ${fmt(rolling3d)}  |`);
  lines.push(`| 7-Day  | ${fmt(rolling7d)}  |`);
  lines.push(`| 30-Day | ${fmt(rolling30d)} |`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── Monthly History ───────────────────────────────────────────────────────
  lines.push('## Monthly History');
  lines.push('');
  lines.push(trainerRef);
  lines.push('');
  lines.push('| Month | Fan Gain | Active Days | Best Day | Quota |');
  lines.push('|-------|----------:|------------:|---------:|:-----:|');

  let monthlyTotal = 0;
  for (const row of monthlyRows) {
    const gain       = row.totalGain  ?? 0;
    const activeDays = row.activeDays != null ? String(row.activeDays) : '—';
    const bestDay    = row.bestDay    != null && row.bestDay > 0 ? fmt(row.bestDay) : '—';
    const quota      = row.isCurrent  ? '🔄' : (gain >= monthlyReq ? '✅' : '❌');
    monthlyTotal += gain;
    lines.push(`| ${fmtMonth(row.month)} | ${fmt(gain)} | ${activeDays} | ${bestDay} | ${quota} |`);
  }

  lines.push(`| **Total** | **${fmt(monthlyTotal)}** | | | |`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── Daily Gain Log ────────────────────────────────────────────────────────
  lines.push('## Daily Gain Log');
  lines.push('');
  lines.push(trainerRef);
  lines.push('');

  if (!joinDate) {
    lines.push('*Join date unknown — daily log unavailable.*');
  } else {
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
    const allDates = dateRange(joinDate, todayStr);

    // Group by year
    const byYear = new Map();
    for (const d of allDates) {
      const y = d.slice(0, 4);
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y).push(d);
    }

    let runningTotal = 0;
    let grandTotal   = 0;

    for (const [year, dates] of byYear) {
      lines.push(`### ${year}`);
      lines.push('');
      lines.push('| Date | Daily Gain | Running Total |');
      lines.push('|------|----------:|-------------:|');

      for (const d of dates) {
        const gain = dailyMap.has(d) ? dailyMap.get(d) : null;
        if (gain != null && gain > 0) {
          runningTotal += gain;
          grandTotal   += gain;
          lines.push(`| ${d} | ${fmt(gain)} | ${fmt(runningTotal)} |`);
        } else if (gain === 0) {
          // Recorded as 0 (active sync day, no gain)
          lines.push(`| ${d} | 0 | ${fmt(runningTotal)} |`);
        } else {
          // No data for this date
          lines.push(`| ${d} | — | — |`);
        }
      }
      lines.push('');
    }

    lines.push(`| **Total** | **${fmt(grandTotal)}** | |`);
  }

  lines.push('');
  return lines.join('\n');
}

// ── Monthly history merger (same logic as profile.js) ────────────────────────

/**
 * Merge DB monthly rows with PastHistoryTrainer data, sorted ascending.
 * @param {string} circleId
 * @param {string} trainerId
 * @param {string} currentMonthStr   'YYYY-MM'
 * @returns {Array<{ month: string, totalGain: number, activeDays: number|null, bestDay: number|null, isCurrent: boolean }>}
 */
function mergeMonthlyHistory(circleId, trainerId, currentMonthStr) {
  const dbRows   = getMemberMonthlyHistoryDetailed(circleId, trainerId);
  const pastProf = getPastProfile(trainerId);
  const mdRows   = pastProf?.monthlyHistory ?? [];

  const merged = new Map();

  for (const row of mdRows) {
    merged.set(row.month, {
      month:      row.month,
      totalGain:  row.totalGain  ?? 0,
      activeDays: null,
      bestDay:    null,
    });
  }
  for (const row of dbRows) {
    const existing = merged.get(row.month);
    if (!existing || row.totalGain > 0) {
      merged.set(row.month, {
        month:      row.month,
        totalGain:  row.totalGain  > 0 ? row.totalGain  : (existing?.totalGain  ?? 0),
        activeDays: row.activeDays ?? null,
        bestDay:    row.bestDay    ?? null,
      });
    }
  }

  return [...merged.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(r => ({ ...r, isCurrent: r.month === currentMonthStr }));
}

// ── Joindate.md parsers ───────────────────────────────────────────────────────

/**
 * Parse both sections of docs-notes/Joindate.md.
 * Returns { current, alumni } where each entry is { name, trainerId, joinDate? }.
 */
function parseJoinDateMd() {
  const mdPath = path.resolve('docs-notes', 'Joindate.md');
  if (!existsSync(mdPath)) return { current: [], alumni: [] };

  const lines   = readFileSync(mdPath, 'utf8').split('\n');
  const current = [];
  const alumni  = [];

  let section    = null; // 'current' | 'alumni' | null
  let headerDone = false;

  for (const line of lines) {
    if (line.startsWith('## Current Members')) { section = 'current'; headerDone = false; continue; }
    if (line.startsWith('## Alumni'))          { section = 'alumni';  headerDone = false; continue; }
    if (!section || !line.trim().startsWith('|')) continue;

    const cells = line.split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
    if (!cells.length) continue;
    if (cells.every(c => /^-+$/.test(c))) continue;
    if (cells[0] === 'Name') { headerDone = true; continue; }
    if (!headerDone) continue;

    const [name, id] = cells;
    if (!id || !/^\d+$/.test(id)) continue;

    if (section === 'current') {
      const joinDate = cells[2] && /^\d{4}-\d{2}-\d{2}$/.test(cells[2]) ? cells[2] : null;
      current.push({ name: name ?? id, trainerId: id, joinDate });
    } else {
      alumni.push({ name: name ?? id, trainerId: id, lastSeen: cells[2] ?? '' });
    }
  }

  return { current, alumni };
}

/** @deprecated Use parseJoinDateMd().alumni */
function parseAlumni() {
  return parseJoinDateMd().alumni;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generate / refresh all member archive files across all configured circles.
 * Safe to run multiple times per day — always overwrites with latest data.
 */
export async function runMemberArchiveSync() {
  ensureDirs();

  const circles  = getConfiguredCircles();
  const today    = new Date();
  const todayStr = today.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  const currentMonthStr = todayStr.slice(0, 7); // 'YYYY-MM'

  // Default monthly requirement (30M); fine as a fallback — commands resolve per-guild
  const MONTHLY_REQ = 30_000_000;

  // ── Gather active members — prefer DB (synced bot), fall back to Joindate.md ─
  /** @type {Map<string, { member: any, circle: { id: string, name: string } }>} */
  const activeMap = new Map(); // trainerId → { member, circle }

  const defaultCircle = circles[0];

  for (const circle of circles) {
    for (const m of getActiveMembers(circle.id)) {
      activeMap.set(String(m.viewer_id), { member: m, circle });
    }
  }

  // If DB is empty (bot not yet synced), seed from Joindate.md current members
  if (activeMap.size === 0) {
    log.info('memberArchive: DB members empty — reading active members from Joindate.md');
    const { current } = parseJoinDateMd();
    for (const { name, trainerId, joinDate } of current) {
      activeMap.set(trainerId, {
        member: {
          viewer_id:    trainerId,
          trainer_name: name,
          joined_at:    joinDate ? `${joinDate}T00:00:00.000Z` : null,
          first_seen_at: null,
        },
        circle: defaultCircle,
      });
    }
    log.info(`memberArchive: loaded ${activeMap.size} member(s) from Joindate.md`);
  }

  // ── Fetch circle snapshots for rolling gains (best-effort, 8 s timeout) ───
  /** @type {Map<string, any>} circleId → snapshot */
  const snapshots = new Map();
  await Promise.all(
    circles.map(async c => {
      try {
        const timeout = new Promise((_, rej) =>
          setTimeout(() => rej(new Error('snapshot timeout')), 8_000)
        );
        const snap = await Promise.race([getCircleSnapshot(c.id), timeout]);
        snapshots.set(c.id, snap);
      } catch (err) {
        log.warn(`memberArchive: snapshot unavailable for circle ${c.id} (${err.message}) — rolling gains will be 0`);
      }
    })
  );

  // ── Process active members ────────────────────────────────────────────────
  for (const [trainerId, { member, circle }] of activeMap) {
    const trainerName = member.trainer_name ?? `trainer_${trainerId}`;
    const filename    = `${trainerName}.md`;
    const activePath  = path.join(ACTIVE_DIR,   filename);
    const inactPath   = path.join(INACTIVE_DIR,  filename);

    // If the file exists in inactive/ by name, move it back
    if (existsSync(inactPath) && !existsSync(activePath)) {
      renameSync(inactPath, activePath);
      log.info(`memberArchive: ${trainerName} returned — moved to active/`);
    }

    // Also scan inactive/ in case the file was saved under a previous name
    if (!existsSync(activePath)) {
      const oldFile = findFileByTrainerId(INACTIVE_DIR, trainerId);
      if (oldFile) {
        renameSync(path.join(INACTIVE_DIR, oldFile), activePath);
        log.info(`memberArchive: ${trainerName} (was ${oldFile}) returned — moved to active/`);
      }
    }

    // Rolling gains from snapshot
    const snap = snapshots.get(circle.id);
    const sm   = snap
      ? (snap.allMembers ?? snap.members ?? []).find(m => String(m.trainerId) === trainerId)
      : null;

    const sumDeltas = (n) => {
      if (!sm?.deltas?.length) return 0;
      return sm.deltas.slice(-n).reduce((s, v) => s + (v ?? 0), 0);
    };

    const rolling3d  = sm ? sumDeltas(3)  : 0;
    const rolling7d  = sm?.weeklyGain  ?? 0;
    const rolling30d = sm ? sumDeltas(30) : 0;

    // Join date
    const joinDate = getJoinDateFromNotes(trainerId)
      ?? member.joined_at
      ?? member.first_seen_at
      ?? null;

    // Monthly history
    const monthlyRows = mergeMonthlyHistory(circle.id, trainerId, currentMonthStr);

    // Daily gains map
    const dailyMap = getDailyGainMap(circle.id, trainerId);

    const content = renderMemberMarkdown({
      trainerName,
      trainerId,
      circleName:  circle.name,
      isActive:    true,
      joinDate,
      updatedDate: todayStr,
      rolling3d,
      rolling7d,
      rolling30d,
      monthlyRows,
      dailyMap,
      circleId:    circle.id,
      monthlyReq:  MONTHLY_REQ,
    });

    writeFileSync(activePath, content, 'utf8');
    log.debug(`memberArchive: wrote active/${filename}`);
  }

  // ── Process inactive members (alumni) ─────────────────────────────────────

  // Move any active/ files whose trainer is no longer in activeMap → inactive/
  for (const f of readdirSync(ACTIVE_DIR)) {
    if (!f.endsWith('.md')) continue;
    try {
      const head = readFileSync(path.join(ACTIVE_DIR, f), 'utf8').split('\n').slice(0, 4).join('\n');
      // Extract trainer ID from header line: `Trainer ID: `123456789``
      const match = head.match(/`(\d{6,})`/);
      if (!match) continue;
      const tid = match[1];
      if (!activeMap.has(tid)) {
        renameSync(path.join(ACTIVE_DIR, f), path.join(INACTIVE_DIR, f));
        log.info(`memberArchive: ${f.replace('.md','')} no longer active — moved to inactive/`);
      }
    } catch { /* skip unreadable */ }
  }

  // Generate/update files for known alumni from Joindate.md
  const alumni = parseAlumni();
  for (const { name, trainerId } of alumni) {
    if (activeMap.has(trainerId)) continue; // handled above as active

    const filename   = `${name}.md`;
    const inactPath  = path.join(INACTIVE_DIR, filename);
    const activePath = path.join(ACTIVE_DIR,   filename);

    // If somehow in active/ still, move it
    if (existsSync(activePath)) {
      renameSync(activePath, inactPath);
      log.info(`memberArchive: ${name} is alumni — moved to inactive/`);
    }

    // Find which circle this alumni was in (any circle that has their data)
    let circleId   = circles[0].id;
    let circleName = circles[0].name;
    for (const c of circles) {
      try {
        const rows = getDb()
          .prepare('SELECT 1 FROM daily_gains WHERE circle_id = ? AND viewer_id = ? LIMIT 1')
          .get(c.id, trainerId);
        if (rows) { circleId = c.id; circleName = c.name; break; }
      } catch { /* skip */ }
    }

    const joinDate    = getJoinDateFromNotes(trainerId) ?? null;
    const monthlyRows = mergeMonthlyHistory(circleId, trainerId, currentMonthStr);
    const dailyMap    = getDailyGainMap(circleId, trainerId);

    const content = renderMemberMarkdown({
      trainerName: name,
      trainerId,
      circleName,
      isActive:    false,
      joinDate,
      updatedDate: todayStr,
      rolling3d:   0,
      rolling7d:   0,
      rolling30d:  0,
      monthlyRows,
      dailyMap,
      circleId,
      monthlyReq:  MONTHLY_REQ,
    });

    writeFileSync(inactPath, content, 'utf8');
    log.debug(`memberArchive: wrote inactive/${filename}`);
  }

  const activeCount   = activeMap.size;
  const inactiveCount = alumni.filter(a => !activeMap.has(a.trainerId)).length;
  log.info(`memberArchive: done — ${activeCount} active, ${inactiveCount} inactive`);
}
