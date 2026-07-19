// @ts-check
/**
 * umamoe/history/pastHistoryReader.js
 * ─────────────────────────────────────
 * Parses PastHistoryTrainer.md and exposes trainer profiles with:
 *   - join date (from the CSV-derived "Joined" column)
 *   - per-month fan gains (from the Full History table)
 *   - active / inactive status
 *
 * Public API
 * ──────────
 *   getPastProfile(idOrName)  → TrainerPastProfile | null
 *   getAllPastProfiles()       → TrainerPastProfile[]
 *   reloadPastHistory()       → void  (re-reads the file)
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIERS } from '../../tasks/milestone-tiers.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const MD_FILE    = path.join(__dirname, '..', '..', 'docs-notes', 'PastHistoryTrainer.md');

/**
 * Derive the highest milestone tier a trainer earned in a single month.
 * TIERS is sorted highest → lowest threshold, so the first match is the best.
 * Returns { tier_key } to match the shape commands/profile.js expects, or null.
 *
 * @param {number} totalGain
 * @returns {{ tier_key: string } | null}
 */
function milestoneForGain(totalGain) {
  if (!totalGain || totalGain <= 0) return null;
  const tier = TIERS.find(t => totalGain >= t.threshold);
  return tier ? { tier_key: tier.key } : null;
}

// ── Internal state ─────────────────────────────────────────────────────────────

/**
 * @typedef {{ month: string, totalGain: number, milestone: { tier_key: string } | null }} MonthGain
 *
 * @typedef {{
 *   trainerId:       string,
 *   name:            string,
 *   joined:          string | null,   // 'YYYY-MM', null if unknown
 *   isActive:        boolean,
 *   lastActiveMonth: string | null,   // 'YYYY-MM' for inactive; null for active
 *   monthlyHistory:  MonthGain[],     // sorted oldest→newest, only past months (monthly gains)
 *   totalFans:       number | null,   // cumulative lifetime fans from the current-month column
 * }} TrainerPastProfile
 */

/** @type {Map<string, TrainerPastProfile>} keyed by trainerId */
let _byId   = new Map();
/** @type {Map<string, TrainerPastProfile>} keyed by name.toLowerCase() */
let _byName = new Map();
let _loaded = false;

// ── Parser helpers ─────────────────────────────────────────────────────────────

/** Split a markdown table row into trimmed cell strings (strips outer pipes). */
function parseTableRow(line) {
  return line.split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
}

function isSeparatorRow(cells) {
  return cells.every(c => /^-+$/.test(c));
}

/** "287,531,181" → 287531181 · "—" → 0 */
function parseFan(raw) {
  if (!raw || raw === '—' || raw === '-') return 0;
  const n = parseInt(raw.replace(/,/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

/** Strip trailing "(current)" annotation from a month header cell. */
function normalizeMonth(h) {
  return h.replace(/\s*\(.*?\)\s*$/, '').trim();
}

/** Return true if the raw header cell is the current-month column. */
function isCurrentMonthCol(h) {
  return /\(current\)/i.test(h);
}

// ── Main parser ────────────────────────────────────────────────────────────────

function load() {
  if (_loaded) return;
  _loaded = true;

  if (!existsSync(MD_FILE)) return;

  const lines = readFileSync(MD_FILE, 'utf8').split('\n');

  /** @type {Map<string, { name: string, joined: string|null }>} */
  const activeMap   = new Map();
  /** @type {Map<string, { name: string, joined: string|null, lastActiveMonth: string|null }>} */
  const inactiveMap = new Map();
  /** @type {Map<string, Map<string, number>>} trainerId → month → gain */
  const historyMap  = new Map();

  let section         = /** @type {'active'|'inactive'|'history'|null} */ (null);
  let headerParsed    = false;
  let months          = /** @type {string[]} */ ([]);
  let rawMonthHeaders = /** @type {string[]} */ ([]); // original (un-normalized) header cells

  for (const line of lines) {
    // ── Section headings ───────────────────────────────────────────────────────
    if      (line.startsWith('## Active'))   { section = 'active';   headerParsed = false; continue; }
    else if (line.startsWith('## Inactive')) { section = 'inactive'; headerParsed = false; continue; }
    else if (line.startsWith('## Full'))     { section = 'history';  headerParsed = false; months = []; continue; }

    if (!section || !line.trim().startsWith('|')) continue;

    const cells = parseTableRow(line);
    if (!cells.length || isSeparatorRow(cells)) continue;

    // ── Active Members table ───────────────────────────────────────────────────
    if (section === 'active') {
      if (cells[0] === 'Trainer ID') { headerParsed = true; continue; }
      if (!headerParsed) continue;
      const [id, name, joined] = cells;
      if (!id || !/^\d+$/.test(id)) continue;
      activeMap.set(id, {
        name:   name.trim(),
        joined: joined && joined !== '—' ? joined : null,
      });

    // ── Inactive Members table ─────────────────────────────────────────────────
    } else if (section === 'inactive') {
      if (cells[0] === 'Trainer ID') { headerParsed = true; continue; }
      if (!headerParsed) continue;
      const [id, name, joined, lastActive] = cells;
      if (!id || !/^\d+$/.test(id)) continue;
      inactiveMap.set(id, {
        name:            name.trim(),
        joined:          joined && joined !== '—' ? joined : null,
        lastActiveMonth: lastActive && lastActive !== '—' ? lastActive : null,
      });

    // ── Full History table ─────────────────────────────────────────────────────
    } else if (section === 'history') {
      if (cells[0] === 'Trainer ID') {
        headerParsed    = true;
        // Columns: Trainer ID | Name | Joined | YYYY-MM | … | YYYY-MM (current)
        rawMonthHeaders = cells.slice(3);                     // keep original for "(current)" detection
        months          = rawMonthHeaders.map(normalizeMonth);
        continue;
      }
      if (!headerParsed) continue;

      const [id, , , ...fanCells] = cells;
      if (!id || !/^\d+$/.test(id)) continue;

      const monthMap = new Map();
      /** @type {number|null} */
      let currentColFans = null;

      for (let i = 0; i < months.length && i < fanCells.length; i++) {
        const gain = parseFan(fanCells[i]);
        if (gain <= 0) continue;

        // Current-month column: value is cumulative totalLifetimeFans, not a monthly gain.
        // Store it separately; do NOT include it in monthly gain history.
        if (isCurrentMonthCol(rawMonthHeaders[i] ?? '')) {
          currentColFans = gain;
        } else {
          monthMap.set(months[i], gain);
        }
      }

      historyMap.set(id, { monthMap, totalFans: currentColFans });
    }
  }

  // ── Build profile objects ──────────────────────────────────────────────────

  function buildEntry(id) {
    const entry = historyMap.get(id) ?? { monthMap: new Map(), totalFans: null };
    const monthlyHistory = [...entry.monthMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, totalGain]) => ({ month, totalGain, milestone: milestoneForGain(totalGain) }));
    return { monthlyHistory, totalFans: entry.totalFans };
  }

  for (const [id, info] of activeMap) {
    const { monthlyHistory, totalFans } = buildEntry(id);
    const profile = {
      trainerId:       id,
      name:            info.name,
      joined:          info.joined,
      isActive:        true,
      lastActiveMonth: null,
      monthlyHistory,
      totalFans,
    };
    _byId.set(id, profile);
    _byName.set(info.name.toLowerCase(), profile);
  }

  for (const [id, info] of inactiveMap) {
    const { monthlyHistory, totalFans } = buildEntry(id);
    const profile = {
      trainerId:       id,
      name:            info.name,
      joined:          info.joined,
      isActive:        false,
      lastActiveMonth: info.lastActiveMonth,
      monthlyHistory,
      totalFans,
    };
    _byId.set(id, profile);
    _byName.set(info.name.toLowerCase(), profile);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Look up a trainer by numeric ID string or trainer name (case-insensitive,
 * partial name match as fallback).
 *
 * @param {string} idOrName
 * @returns {TrainerPastProfile | null}
 */
export function getPastProfile(idOrName) {
  load();
  const s = String(idOrName).trim();

  // Exact ID match
  if (/^\d+$/.test(s) && _byId.has(s)) return _byId.get(s) ?? null;

  // Exact name match
  const lower = s.toLowerCase();
  if (_byName.has(lower)) return _byName.get(lower) ?? null;

  // Partial name match
  for (const [key, profile] of _byName) {
    if (key.includes(lower)) return profile;
  }

  return null;
}

/**
 * Return all trainer profiles (active + inactive), sorted by name.
 * @returns {TrainerPastProfile[]}
 */
export function getAllPastProfiles() {
  load();
  return [..._byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Force a re-read of PastHistoryTrainer.md (useful if the file is updated
 * at runtime by an admin command).
 */
export function reloadPastHistory() {
  _loaded = false;
  _byId   = new Map();
  _byName = new Map();
  load();
}
