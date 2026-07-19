/**
 * Character name lookup by game char_id.
 *
 * The char_id is extracted from uma.moe's dress_id format: Math.floor(dress_id / 100)
 * e.g.  leader_chara_dress_id = 101901  →  char_id = 1019  →  "Agnes Digital"
 *
 * Data is seeded at startup and refreshed by tasks/updateGameData.js every 24h.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../core/config.js';
import { log } from '../core/log.js';

const CHAR_FILE = path.join(config.dataDir, 'characters', 'characters.json');

let _cache = null;

export async function loadCharacterData() {
  try {
    const raw = await fs.readFile(CHAR_FILE, 'utf8');
    _cache = JSON.parse(raw);
    log.debug(`characterData: loaded ${Object.keys(_cache).length} characters`);
  } catch {
    log.warn('characterData: could not load characters.json — using empty map');
    _cache = {};
  }
}

/**
 * Look up a character by their 4-digit char_id.
 * Returns { en_name, jp_name, slug } or null.
 */
export function getCharById(charId) {
  if (!_cache) return null;
  return _cache[String(charId)] ?? null;
}

/**
 * Look up a character from a 6-digit dress_id (e.g. 101901).
 * Returns { en_name, jp_name, slug } or null.
 */
export function getCharByDressId(dressId) {
  if (!dressId) return null;
  const charId = Math.floor(Number(dressId) / 100);
  return getCharById(charId);
}

/**
 * Return the English name for a dress_id, falling back to a formatted ID string.
 */
export function charName(dressId) {
  const c = getCharByDressId(dressId);
  return c?.en_name ?? (dressId ? `ID ${dressId}` : '—');
}

/**
 * Look up a character by their 4-digit char_id and return their English name.
 * Falls back to "ID {charId}" if unknown, or "—" if charId is null/0.
 */
export function charNameById(charId) {
  if (!charId) return '—';
  const c = getCharById(charId);
  return c?.en_name ?? `ID ${charId}`;
}

/**
 * Return the gametora character portrait icon URL for a char_id.
 * Uses the character's slug (e.g. "agnes-digital") to build the URL.
 * Returns null if the char_id is unknown.
 */
export function charIconUrl(charId) {
  if (!charId) return null;
  const c = getCharById(charId);
  if (!c?.slug) return null;
  // Gametora serves character portrait thumbnails at this path.
  return `https://gametora.com/images/umamusume/characters/${c.slug}.webp`;
}

/**
 * Save an updated characters map to disk and refresh the cache.
 */
export async function saveCharacterData(map) {
  await fs.mkdir(path.dirname(CHAR_FILE), { recursive: true });
  await fs.writeFile(CHAR_FILE, JSON.stringify(map, null, 2), 'utf8');
  _cache = map;
}

export function getAllCharacters() {
  return _cache ?? {};
}
