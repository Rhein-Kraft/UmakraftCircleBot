// @ts-check
/**
 * umamoe/history/joinDateNotes.js
 * ─────────────────────────────────
 * Parses docs-notes/Joindate.md — a curated, day-precision "first fan gain
 * date" reference derived from the raw CSV exports — and exposes a
 * trainerId → ISO date lookup.
 *
 * Why this exists:
 *   PastHistoryTrainer.md only stores join month ("YYYY-MM"), so callers
 *   that fall back to it have to guess a day (historically "-01", which is
 *   wrong for anyone who didn't join on the 1st). Joindate.md already has
 *   the correct day for every current member, so it should be preferred
 *   over any day-guessing fallback.
 *
 * Public API
 * ──────────
 *   getJoinDateFromNotes(trainerId) → 'YYYY-MM-DD' | null
 *   reloadJoinDateNotes()           → void  (re-reads the file)
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MD_FILE   = path.join(__dirname, '..', '..', 'docs-notes', 'Joindate.md');

/** @type {Map<string, string>} trainerId → 'YYYY-MM-DD' */
let _byId   = new Map();
let _loaded = false;

function parseTableRow(line) {
  return line.split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
}

function isSeparatorRow(cells) {
  return cells.every(c => /^-+$/.test(c));
}

function load() {
  if (_loaded) return;
  _loaded = true;

  if (!existsSync(MD_FILE)) return;

  const lines = readFileSync(MD_FILE, 'utf8').split('\n');
  let inCurrentTable = false;
  let headerParsed   = false;

  for (const line of lines) {
    if (line.startsWith('## Current Members')) { inCurrentTable = true; headerParsed = false; continue; }
    if (line.startsWith('## Alumni'))          { inCurrentTable = false; continue; }
    if (!inCurrentTable || !line.trim().startsWith('|')) continue;

    const cells = parseTableRow(line);
    if (!cells.length || isSeparatorRow(cells)) continue;
    if (cells[0] === 'Name') { headerParsed = true; continue; }
    if (!headerParsed) continue;

    const [, id, firstGainDate] = cells;
    if (!id || !/^\d+$/.test(id)) continue;
    if (!firstGainDate || !/^\d{4}-\d{2}-\d{2}$/.test(firstGainDate)) continue;

    _byId.set(id, firstGainDate);
  }
}

/**
 * @param {string} trainerId
 * @returns {string | null} 'YYYY-MM-DD'
 */
export function getJoinDateFromNotes(trainerId) {
  load();
  return _byId.get(String(trainerId).trim()) ?? null;
}

/** Force a re-read of Joindate.md (e.g. after it's regenerated). */
export function reloadJoinDateNotes() {
  _loaded = false;
  _byId   = new Map();
  load();
}
