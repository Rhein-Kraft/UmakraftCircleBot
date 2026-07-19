/**
 * utils/cardCache.js
 * ──────────────────
 * Loads the scraped support card data from data/cards/*.json into memory.
 * Provides fast lookup by id, type, and search.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { log } from '../core/log.js';

const DATA_DIR = path.resolve('./data/cards');

const TYPES = ['speed', 'stamina', 'power', 'guts', 'wisdom', 'friend'];

const TYPE_LABELS = {
  speed: '💨 Speed',
  stamina: '❤️ Stamina',
  power: '💪 Power',
  guts: '🔥 Guts',
  wisdom: '📗 Wisdom',
  friend: '🤝 Friend',
};

const TYPE_COLORS = {
  speed: 0x5599ff,
  stamina: 0xff6677,
  power: 0xff9944,
  guts: 0xff5522,
  wisdom: 0x44bb66,
  friend: 0xff88cc,
};

let byType = {};
let byId = {};
let allCards = [];
let loaded = false;

export async function loadCardCache() {
  byType = {};
  byId = {};
  allCards = [];

  await Promise.all(
    TYPES.map(async type => {
      const file = path.join(DATA_DIR, `${type}.json`);
      try {
        const raw = await fsp.readFile(file, 'utf8');
        const cards = JSON.parse(raw);
        byType[type] = cards;
        for (const c of cards) {
          byId[c.id] = c;
          allCards.push(c);
        }
      } catch (err) {
        if (err.code === 'ENOENT') {
          log.warn(`cardCache: ${file} not found — run scripts/scrapeCards.js`);
        } else {
          log.warn(`cardCache: failed to load ${type}.json:`, err.message);
        }
        byType[type] = [];
      }
    })
  );

  loaded = true;
  log.info(
    `cardCache: loaded ${allCards.length} cards (${TYPES.map(t => `${t}:${(byType[t] || []).length}`).join(', ')})`
  );
}

function assertLoaded() {
  if (!loaded) throw new Error('cardCache: not initialized — await loadCardCache() must be called at startup');
}

/** Get all cards of a given type, or all if type is 'all' */
export function getCardsByType(type = 'all') {
  assertLoaded();
  if (type === 'all') return allCards;
  return byType[type] ?? [];
}

/** Get a single card by numeric ID */
export function getCardById(id) {
  assertLoaded();
  return byId[Number(id)] ?? null;
}

/** Get multiple cards by their IDs (slots array may contain nulls) */
export function getCardsByIds(ids = []) {
  assertLoaded();
  return ids.map(id => (id ? (byId[Number(id)] ?? null) : null));
}

/** Normalise raw gametora type strings to our bucket keys */
export function normaliseType(raw = '') {
  const t = raw.toLowerCase().trim();
  if (t === 'wit' || t === 'wits' || t === 'intelligence') return 'wisdom';
  if (t === 'group') return 'friend';
  return t;
}

/** Search cards by name (case-insensitive, optional type filter) */
export function searchCards(query, type = 'all', limit = 25) {
  assertLoaded();
  const q = query.toLowerCase();
  const pool = type === 'all' ? allCards : (byType[type] ?? []);
  return pool.filter(c => c.name.toLowerCase().includes(q)).slice(0, limit);
}

/** Calculate total bonuses from a list of cards (may include nulls) */
export function calcTotalBonuses(cards = []) {
  const total = {};
  for (const card of cards) {
    if (!card) continue;
    for (const [key, val] of Object.entries(card.bonuses || {})) {
      total[key] = (total[key] || 0) + (val || 0);
    }
  }
  return total;
}

/** Level → fraction of max-level bonuses (linear approximation). */
export const LEVEL_SCALE = { 30: 0.5, 35: 0.62, 40: 0.75, 45: 0.88, 50: 1.0 };

/** Return a card's bonuses scaled to the given level (default Lv 50). */
export function scaledBonuses(card, level = 50) {
  const scale = LEVEL_SCALE[level] ?? 1.0;
  const result = {};
  for (const [key, val] of Object.entries(card?.bonuses || {})) {
    result[key] = Math.max(0, Math.round((val || 0) * scale));
  }
  return result;
}

/** Total bonuses across slots, each card scaled to its individual level. */
export function calcTotalBonusesAtLevels(cards = [], levels = []) {
  const total = {};
  cards.forEach((card, i) => {
    if (!card) return;
    const lvl = levels[i] ?? 50;
    for (const [key, val] of Object.entries(scaledBonuses(card, lvl))) {
      total[key] = (total[key] || 0) + val;
    }
  });
  return total;
}

/** True if card data files exist */
export function hasCardData() {
  return fs.existsSync(path.join(DATA_DIR, 'speed.json'));
}

/** Metadata about last scrape */
export function getCardMeta() {
  const file = path.join(DATA_DIR, 'meta.json');
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Reload the card cache from disk without restarting the bot.
 * Call this after running syncCards() so changes are picked up immediately.
 */
export async function reloadCardCache() {
  loaded = false;
  await loadCardCache();
}

export { TYPES, TYPE_LABELS, TYPE_COLORS };
