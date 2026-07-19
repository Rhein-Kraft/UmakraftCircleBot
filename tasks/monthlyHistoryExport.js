// @ts-check
/**
 * tasks/monthlyHistoryExport.js
 * ──────────────────────────────
 * End-of-month automated pipeline:
 *
 *   1. Detect last day of the month (or catch-up on the 1st).
 *   2. Fetch the completed month's daily_fans data from uma.moe.
 *   3. Write a CSV to attached_assets/YYYY-MM_<circleId>.csv (same format
 *      as all historical CSVs so autoImportCsvGains picks it up on restart).
 *   4. Call rebuildMonthlyHistory() so the in-memory cache reflects the new month.
 *   5. Call regeneratePastHistoryMd() to rewrite PastHistoryTrainer.md from scratch.
 *
 * Scheduled at 23:58 JST on the last day of each month — runs after the
 * final data sync (23:55) so it captures the most complete fan figures.
 * A catch-up run fires on the 1st of each month at 00:30 JST in case the
 * previous night's run was missed (bot offline, uma.moe unavailable, etc.).
 *
 * Deduplication: the exported month is stored in bot_state so the task is
 * idempotent — running it twice for the same month is a safe no-op.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchCircle } from '../core/umaClient.js';
import { rebuildMonthlyHistory } from '../core/monthlyHistory.js';
import { regeneratePastHistoryMd } from '../utils/generatePastHistoryMd.js';
import { getConfiguredCircles } from '../core/config.js';
import { store } from '../core/store.js';
import { log } from '../core/log.js';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(__dirname);
const ASSETS_DIR   = path.join(PROJECT_ROOT, 'attached_assets');

// State key prefix — one entry per exported month, e.g. "monthlyExport:2026-07"
const STATE_PREFIX = 'monthlyExport:';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Return a Date whose UTC fields represent the current wall-clock time in JST
 * (UTC+9). Use this whenever we need to reason about the JST calendar date,
 * since all cron expressions in this bot use Asia/Tokyo as their timezone.
 *
 * Example: at 00:30 JST on July 1st, new Date() is June 30 15:30 UTC.
 *   jstNow() returns a Date whose UTC fields read July 1, 00:30 — so
 *   getUTCMonth()+1 == 7 and getUTCDate() == 1, as expected.
 */
function jstNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

/**
 * True if today is the last day of the month in JST.
 * At 23:58 JST on July 31, jstNow() gives July 31 23:58 UTC-offset, and
 * tomorrow is August 1 — different month → true.
 */
function isLastDayOfMonth() {
  const d        = jstNow();
  const tomorrow = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  return tomorrow.getUTCMonth() !== d.getUTCMonth();
}

/**
 * Return 'YYYY-MM' for the relevant month, in JST.
 *
 * @param {'last'|'prev'} mode
 *   'last' — current JST month (call on last day of month at 23:58 JST)
 *   'prev' — previous JST month (call on 1st of new month at 00:30 JST)
 *
 * Why JST matters for 'prev':
 *   At 00:30 JST on July 1, UTC is June 30 15:30.  jstNow() gives
 *   July 1 00:30 in UTC-field terms.  setUTCDate(0) rewinds to June 30,
 *   so getUTCMonth()+1 == 6 == June — the month we want to export.
 */
function targetMonth(mode) {
  const d = jstNow();
  if (mode === 'prev') d.setUTCDate(0); // rewind to last day of previous JST month
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Check whether we already exported a given month.
 * @param {string} monthStr  'YYYY-MM'
 */
async function alreadyExported(monthStr) {
  try {
    const val = await store.getState(`${STATE_PREFIX}${monthStr}`);
    return !!val;
  } catch {
    return false;
  }
}

/** Mark a month as exported so the task skips it on future runs. */
async function markExported(monthStr) {
  await store.setState(`${STATE_PREFIX}${monthStr}`, new Date().toISOString());
}

// ── CSV writer ────────────────────────────────────────────────────────────────

/**
 * Fetch uma.moe data for a specific month and write it as a CSV file.
 *
 * CSV format (matches existing attached_assets/ files):
 *   Trainer ID,Name,Day 1,Day 2,…,Day N
 *   <values are cumulative fan totals within the month>
 *
 * @param {string} circleId
 * @param {number} year
 * @param {number} month  1-based
 * @returns {Promise<string>}  path to the written file
 */
async function writeMonthlyCsv(circleId, year, month) {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const filename = `${monthStr}_${circleId}.csv`;
  const filePath = path.join(ASSETS_DIR, filename);

  if (existsSync(filePath)) {
    log.info(`monthlyHistoryExport: ${filename} already exists — skipping write`);
    return filePath;
  }

  log.info(`monthlyHistoryExport: fetching ${monthStr} data for circle ${circleId}…`);
  const payload = await fetchCircle(circleId, year, month);
  const members = payload?.members ?? [];

  if (!members.length) {
    throw new Error(`monthlyHistoryExport: uma.moe returned 0 members for ${monthStr}`);
  }

  // Determine how many day columns to write (up to 31).
  // Use the length of the longest daily_fans array in the payload.
  const maxDays = members.reduce((acc, m) => Math.max(acc, (m.daily_fans ?? []).length), 0);
  if (maxDays === 0) throw new Error('monthlyHistoryExport: daily_fans arrays are empty');

  const dayHeaders = Array.from({ length: maxDays }, (_, i) => `Day ${i + 1}`);
  const header     = ['Trainer ID', 'Name', ...dayHeaders].join(',');

  const dataRows = members.map(m => {
    const fans = m.daily_fans ?? [];
    const cells = Array.from({ length: maxDays }, (_, i) => {
      const v = fans[i];
      // Leave future/zero days blank (matches existing CSV style)
      return (v != null && v > 0) ? String(v) : '';
    });
    return [String(m.viewer_id), m.trainer_name, ...cells].join(',');
  });

  mkdirSync(ASSETS_DIR, { recursive: true });
  writeFileSync(filePath, [header, ...dataRows].join('\n') + '\n', 'utf8');

  log.info(`monthlyHistoryExport: wrote ${filename} (${members.length} trainers, ${maxDays} day columns)`);
  return filePath;
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

/**
 * Run the full end-of-month export pipeline for a given month string.
 *
 * @param {string} monthStr  'YYYY-MM'
 */
async function runExport(monthStr) {
  if (await alreadyExported(monthStr)) {
    log.info(`monthlyHistoryExport: ${monthStr} already exported — skipping`);
    return;
  }

  const [yearStr, monthPart] = monthStr.split('-');
  const year  = parseInt(yearStr, 10);
  const month = parseInt(monthPart, 10);

  const circles = getConfiguredCircles();

  // Step 1 — write CSV for each configured circle
  for (const circle of circles) {
    try {
      await writeMonthlyCsv(circle.id, year, month);
    } catch (err) {
      log.error(`monthlyHistoryExport: CSV write failed for circle ${circle.id}:`, err.message);
      throw err; // abort — don't mark as exported if CSV failed
    }
  }

  // Step 2 — rebuild the in-memory monthly history cache from all CSVs
  try {
    rebuildMonthlyHistory();
    log.info('monthlyHistoryExport: monthlyHistory rebuilt');
  } catch (err) {
    log.error('monthlyHistoryExport: rebuildMonthlyHistory failed:', err.message);
    throw err;
  }

  // Step 3 — regenerate PastHistoryTrainer.md.
  // Treated as required: if this fails we do NOT mark the month as exported,
  // so the catch-up run on the 1st will retry the full pipeline.
  // (CSV write and rebuildMonthlyHistory are idempotent — safe to re-run.)
  await regeneratePastHistoryMd();
  log.info('monthlyHistoryExport: PastHistoryTrainer.md regenerated');

  // Step 4 — mark as done only after everything succeeded
  await markExported(monthStr);
  log.info(`monthlyHistoryExport: ${monthStr} complete`);
}

// ── Public entry points ───────────────────────────────────────────────────────

/**
 * Called at 23:58 JST every night.
 * Only fires on the last day of the month.
 */
export async function runMonthEndExport() {
  if (!isLastDayOfMonth()) return;

  const monthStr = targetMonth('last');
  log.info(`monthlyHistoryExport: last day of month — exporting ${monthStr}`);
  await runExport(monthStr);
}

/**
 * Called at 00:30 JST on the 1st of each month as a catch-up.
 * Exports the previous month if it was missed last night.
 */
export async function runMonthStartCatchUp() {
  const monthStr = targetMonth('prev');
  const already  = await alreadyExported(monthStr);
  if (already) {
    log.debug(`monthlyHistoryExport: catch-up skipped — ${monthStr} already exported`);
    return;
  }

  log.info(`monthlyHistoryExport: catch-up — exporting missed month ${monthStr}`);
  await runExport(monthStr);
}
