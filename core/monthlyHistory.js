/**
 * core/monthlyHistory.js
 * ──────────────────────
 * Standalone monthly-gain history built directly from the CSV files in
 * attached_assets/.  No SQLite, no circle-assignment logic.
 *
 * CSV format  : Trainer ID, Name, Day 1, Day 2, … (within-month cumulative totals)
 * File names  : YYYY-MM_*.csv  (one or more files per month — duplicates are merged
 *               by taking the MAX monthly total for each trainer)
 *
 * Output file : data/monthly_history.json
 *   {
 *     "<viewerId>": { "2025-09": 18363438, "2025-10": 32898882, … },
 *     …
 *   }
 *
 * Public API
 * ──────────
 *   initMonthlyHistory()            → load from JSON (or build if missing)
 *   rebuildMonthlyHistory()         → re-parse all CSVs, overwrite JSON
 *   getMonthlyHistory(viewerId)     → [{month, totalGain}, …] sorted ASC
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from './log.js';
import { config } from './config.js';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(__dirname);
const ASSETS_DIR   = path.join(PROJECT_ROOT, 'attached_assets');
const OUT_FILE     = path.join(config.dataDir, 'monthly_history.json');

// In-memory store: Map<viewerId, Map<month, totalGain>>
let _history = new Map();

// ── CSV parsing ───────────────────────────────────────────────────────────────

/**
 * Parse one CSV file and return a Map<viewerId, totalGain> for that month.
 * Values in the CSV are within-month cumulative totals, so we sum the deltas.
 */
function parseCsvFile(filePath) {
  const raw   = readFileSync(filePath, 'utf8');
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return new Map();

  // Identify day columns from the header row
  const header     = lines[0].split(',');
  const dayColumns = [];
  for (let i = 2; i < header.length; i++) {
    const m = header[i].trim().match(/^Day\s+(\d+)$/i);
    if (m) dayColumns.push(i);
  }
  if (!dayColumns.length) return new Map();

  const result = new Map(); // viewerId → totalGain

  for (let li = 1; li < lines.length; li++) {
    const cols      = lines[li].split(',');
    const viewerId  = cols[0]?.trim();
    if (!viewerId || !/^\d+$/.test(viewerId)) continue;

    let prevVal   = 0;
    let totalGain = 0;

    for (const colIdx of dayColumns) {
      const raw = cols[colIdx]?.trim();
      if (!raw || raw === '') continue;
      const cumVal = parseFloat(raw);
      if (isNaN(cumVal) || cumVal < 0) continue;
      totalGain += Math.max(0, Math.round(cumVal - prevVal));
      prevVal    = cumVal;
    }

    if (totalGain > 0) result.set(viewerId, totalGain);
  }

  return result;
}

/**
 * Extract the YYYY-MM month string from a CSV filename.
 * Returns null if the name doesn't match the expected pattern.
 */
function monthFromFilename(filename) {
  const m = path.basename(filename).match(/^(\d{4}-\d{2})_/);
  return m ? m[1] : null;
}

// ── Build ─────────────────────────────────────────────────────────────────────

/** Sorted list of CSV basenames currently on disk. */
function currentCsvFiles() {
  if (!existsSync(ASSETS_DIR)) return [];
  return readdirSync(ASSETS_DIR)
    .filter(f => f.endsWith('.csv') && /^\d{4}-\d{2}_/.test(f))
    .sort();
}

/**
 * Read every CSV in attached_assets/, compute monthly totals, write JSON.
 * Duplicate files for the same month → MAX total wins per trainer.
 */
export function rebuildMonthlyHistory() {
  if (!existsSync(ASSETS_DIR)) {
    log.warn('monthlyHistory: attached_assets/ not found — no CSV data to load');
    _history = new Map();
    return;
  }

  const files = readdirSync(ASSETS_DIR)
    .filter(f => f.endsWith('.csv'))
    .sort();

  // Intermediate: { viewerId → { month → totalGain } }
  const combined = new Map();

  for (const file of files) {
    const month = monthFromFilename(file);
    if (!month) continue;

    const filePath = path.join(ASSETS_DIR, file);
    let parsed;
    try {
      parsed = parseCsvFile(filePath);
    } catch (err) {
      log.warn(`monthlyHistory: skipping ${file} — ${err.message}`);
      continue;
    }

    for (const [viewerId, totalGain] of parsed) {
      if (!combined.has(viewerId)) combined.set(viewerId, new Map());
      const monthMap = combined.get(viewerId);
      // Keep the max if two CSVs cover the same month for the same trainer
      const existing = monthMap.get(month) ?? 0;
      monthMap.set(month, Math.max(existing, totalGain));
    }
  }

  _history = combined;

  // Persist to JSON (include fingerprint so initMonthlyHistory can detect new CSVs)
  const plain = { _csvFiles: files.filter(f => monthFromFilename(f)), _data: {} };
  for (const [viewerId, monthMap] of combined) {
    plain._data[viewerId] = Object.fromEntries(monthMap);
  }

  mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(plain, null, 2), 'utf8');

  const trainerCount = combined.size;
  const monthSet     = new Set();
  for (const m of combined.values()) for (const k of m.keys()) monthSet.add(k);
  log.info(`monthlyHistory: built — ${trainerCount} trainer(s), ${monthSet.size} month(s) → ${OUT_FILE}`);
}

// ── Load ──────────────────────────────────────────────────────────────────────

/**
 * Load the JSON file into memory.  If it doesn't exist, build it first.
 * Call once at startup.
 */
export function initMonthlyHistory() {
  if (existsSync(OUT_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(OUT_FILE, 'utf8'));

      // Check whether the set of CSV files on disk matches what built the cache.
      const cachedFiles  = parsed._csvFiles ?? null;
      const onDiskFiles  = currentCsvFiles();
      const fingerprint  = JSON.stringify(onDiskFiles);
      const cacheValid   = cachedFiles && JSON.stringify(cachedFiles) === fingerprint;

      if (cacheValid) {
        const data = parsed._data ?? parsed; // backwards-compat: old format had no wrapper
        _history   = new Map();
        for (const [viewerId, months] of Object.entries(data)) {
          _history.set(viewerId, new Map(Object.entries(months)));
        }
        const monthSet = new Set();
        for (const m of _history.values()) for (const k of m.keys()) monthSet.add(k);
        log.info(`monthlyHistory: loaded ${_history.size} trainer(s), ${monthSet.size} month(s) from cache`);
        return;
      }

      log.info('monthlyHistory: CSV file set changed — rebuilding cache');
    } catch (err) {
      log.warn(`monthlyHistory: cache unreadable (${err.message}) — rebuilding`);
    }
  }
  rebuildMonthlyHistory();
}

// ── Query ─────────────────────────────────────────────────────────────────────

/**
 * Return the monthly gain history for a trainer, sorted oldest → newest.
 *
 * @param {string|number} viewerId
 * @returns {{ month: string, totalGain: number }[]}
 */
export function getMonthlyHistory(viewerId) {
  const monthMap = _history.get(String(viewerId));
  if (!monthMap) return [];

  return [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, totalGain]) => ({ month, totalGain }));
}

/**
 * Return all trainer IDs that have at least one month of history.
 * @returns {string[]}
 */
export function getAllHistoryTrainerIds() {
  return [..._history.keys()];
}
