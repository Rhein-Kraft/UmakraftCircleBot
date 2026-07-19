// @ts-check
/**
 * umamoe/history/generatePastHistoryMd.js
 * ─────────────────────────────────────────
 * Rebuilds PastHistoryTrainer.md from scratch using live data sources.
 *
 * Data sources
 * ────────────
 *   core/monthlyHistory.js  — all past monthly gains (CSV-derived, already in memory)
 *   CSV files               — trainer names + join dates (earliest appearance)
 *   uma.moe snapshot        — active member list + current totalLifetimeFans
 *
 * Call this after writing a new monthly CSV and calling rebuildMonthlyHistory().
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMonthlyHistory, getAllHistoryTrainerIds } from '../../core/monthlyHistory.js';
import { getCircleSnapshot } from '../../core/uma.js';
import { getConfiguredCircles } from '../../core/config.js';
import { log } from '../../core/log.js';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(path.dirname(__dirname));
const ASSETS_DIR   = path.join(PROJECT_ROOT, 'attached_assets');
const OUT_FILE     = path.join(PROJECT_ROOT, 'PastHistoryTrainer.md');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a fan number with commas, or "—" for zero/null. */
function fmtFan(n) {
  if (!n || n <= 0) return '—';
  return Math.round(n).toLocaleString('en-US');
}

/** Current month as 'YYYY-MM'. */
function curMonthStr() {
  const n = new Date();
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Scan all CSVs in attached_assets/ and build two maps:
 *   joinMap  — trainerId → earliest 'YYYY-MM'
 *   nameMap  — trainerId → most recent trainer name seen in a CSV
 *
 * @returns {{ joinMap: Map<string,string>, nameMap: Map<string,string> }}
 */
function buildMapsFromCsvs() {
  const joinMap = new Map();
  const nameMap = new Map();

  let files;
  try {
    files = readdirSync(ASSETS_DIR)
      .filter(f => /^\d{4}-\d{2}_.*\.csv$/.test(f))
      .sort();
  } catch {
    return { joinMap, nameMap };
  }

  for (const file of files) {
    const month = file.slice(0, 7); // YYYY-MM
    let raw;
    try { raw = readFileSync(path.join(ASSETS_DIR, file), 'utf8'); } catch { continue; }

    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      const id   = cols[0]?.trim();
      const name = cols[1]?.trim();
      if (!id || !/^\d+$/.test(id)) continue;

      // Earliest month seen = join date (files are sorted ASC)
      if (!joinMap.has(id)) joinMap.set(id, month);

      // Always overwrite name — latest CSV has the most current display name
      if (name) nameMap.set(id, name);
    }
  }

  return { joinMap, nameMap };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Regenerate PastHistoryTrainer.md and write it to disk.
 * Throws if the uma.moe snapshot cannot be fetched.
 *
 * @returns {Promise<void>}
 */
export async function regeneratePastHistoryMd() {
  const circles = getConfiguredCircles();
  const circle  = circles[0]; // primary circle

  // ── Live snapshot ─────────────────────────────────────────────────────────
  let snapshot;
  try {
    snapshot = await getCircleSnapshot(circle.id);
  } catch (err) {
    throw new Error(`regeneratePastHistoryMd: snapshot unavailable — ${err.message}`);
  }

  const curMonth = curMonthStr();

  // Active member data from uma.moe
  /** @type {Map<string, { name: string, totalFans: number }>} */
  const activeMap = new Map();
  for (const m of snapshot.members) {
    activeMap.set(String(m.trainerId), {
      name:      m.trainerName,
      totalFans: m.totalLifetimeFans ?? 0,
    });
  }

  // ── Name + join maps from CSV files ───────────────────────────────────────
  const { joinMap, nameMap } = buildMapsFromCsvs();

  // Supplement nameMap with live names for active members
  for (const [id, { name }] of activeMap) {
    nameMap.set(id, name);
  }

  // ── All trainer IDs that have CSV-based history ───────────────────────────
  const allIds    = getAllHistoryTrainerIds();
  const activeIds = allIds.filter(id => activeMap.has(id));
  const inactiveIds = allIds.filter(id => !activeMap.has(id));

  /** Last month a trainer has a recorded gain (from CSV history). */
  function lastActiveMonth(id) {
    const hist = getMonthlyHistory(id);
    return hist.length ? hist[hist.length - 1].month : null;
  }

  // Sort active alphabetically by name; inactive by last-active DESC then name
  activeIds.sort((a, b) => (nameMap.get(a) ?? a).localeCompare(nameMap.get(b) ?? b));
  inactiveIds.sort((a, b) => {
    const la = lastActiveMonth(a) ?? '';
    const lb = lastActiveMonth(b) ?? '';
    if (la !== lb) return lb.localeCompare(la);
    return (nameMap.get(a) ?? a).localeCompare(nameMap.get(b) ?? b);
  });

  // ── All past months present in any CSV history ────────────────────────────
  const monthSet = new Set();
  for (const id of allIds) {
    for (const { month } of getMonthlyHistory(id)) monthSet.add(month);
  }
  const pastMonths = [...monthSet].sort(); // chronological

  // ── Date label for headings ───────────────────────────────────────────────
  const now = new Date();
  const monthLabel = now.toLocaleString('en-US', {
    month: 'long', year: 'numeric', timeZone: 'Asia/Tokyo',
  });

  // ── Section 1: Active Members ─────────────────────────────────────────────
  const activeRows = activeIds.map(id => {
    const { name, totalFans } = activeMap.get(id);
    const joined = joinMap.get(id) ?? '—';
    return `| ${id} | ${name} | ${joined} | ${fmtFan(totalFans)} |`;
  });

  const activeSection = [
    `## Active Members — ${monthLabel}`,
    '',
    `> Fetched live from uma.moe · ${activeIds.length} member(s) currently in the circle`,
    '',
    '| Trainer ID | Name | Joined | Total Fans (Cumulative) |',
    '| --- | --- | --- | --- |',
    ...activeRows,
  ].join('\n');

  // ── Section 2: Inactive Members ───────────────────────────────────────────
  const inactiveRows = inactiveIds.map(id => {
    const name    = nameMap.get(id) ?? `Trainer ${id}`;
    const joined  = joinMap.get(id) ?? '—';
    const lastMon = lastActiveMonth(id) ?? '—';
    return `| ${id} | ${name} | ${joined} | ${lastMon} |`;
  });

  const inactiveSection = [
    '## Inactive Members',
    '',
    `> Trainers who appear in past CSV history but are **not** in the circle this month · ${inactiveIds.length} trainer(s)`,
    '',
    '| Trainer ID | Name | Joined | Last active month |',
    '| --- | --- | --- | --- |',
    ...inactiveRows,
  ].join('\n');

  // ── Section 3: Full History Spreadsheet ───────────────────────────────────
  const curMonthHeader = `${curMonth} (current)`;
  const allMonthHeaders = [...pastMonths, curMonthHeader];
  const sepCols = Array(3 + allMonthHeaders.length).fill('---').join(' | ');

  const histHeader = `| Trainer ID | Name | Joined | ${allMonthHeaders.join(' | ')} |`;
  const histSep    = `| ${sepCols} |`;

  const allSorted = [...activeIds, ...inactiveIds];

  const histRows = allSorted.map(id => {
    const name     = nameMap.get(id) ?? `Trainer ${id}`;
    const joined   = joinMap.get(id) ?? '—';
    const histMap  = new Map(getMonthlyHistory(id).map(r => [r.month, r.totalGain]));

    const pastCells = pastMonths.map(m => fmtFan(histMap.get(m) ?? 0));
    const curCell   = activeMap.has(id) ? fmtFan(activeMap.get(id).totalFans) : '—';

    return `| ${id} | ${name} | ${joined} | ${[...pastCells, curCell].join(' | ')} |`;
  });

  const histSection = [
    '## Full History Spreadsheet',
    '',
    '> ⚠️ **Value format note:**',
    `> - Columns **${pastMonths[0]} – ${pastMonths[pastMonths.length - 1]}** come from CSVs and show the **monthly fan gain** for that month (fans earned during the month, not a running total).`,
    `> - Column **${curMonthHeader}** comes from uma.moe and shows the trainer\'s **cumulative lifetime total fans** as of the snapshot date — this is **not** a monthly gain figure. Do not sum it with the other columns.`,
    '> - `—` means the trainer was not in the circle that month.',
    '',
    histHeader,
    histSep,
    ...histRows,
  ].join('\n');

  // ── Preamble ──────────────────────────────────────────────────────────────
  const preamble = [
    '# Trainer Past History — UmaKraft',
    '',
    '> **Data sources**',
    '> | Period | Source |',
    '> |---|---|',
    `> | Past months (${pastMonths[0]} – ${pastMonths[pastMonths.length - 1]}) | CSV files in \`attached_assets/\` |`,
    `> | Current month (${curMonth}) | Live from uma.moe |`,
    '>',
    '> — = no recorded activity that month',
  ].join('\n');

  // ── Write file ────────────────────────────────────────────────────────────
  const content = [preamble, '', '---', '', activeSection, '', '---', '', inactiveSection, '', '---', '', histSection, ''].join('\n');
  writeFileSync(OUT_FILE, content, 'utf8');

  log.info(`generatePastHistoryMd: written — ${activeIds.length} active, ${inactiveIds.length} inactive, ${pastMonths.length} past months`);
}
