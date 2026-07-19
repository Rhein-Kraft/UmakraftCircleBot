/**
 * umamoe/umaClient.js
 * ──────────────────
 * Low-level uma.moe API client.
 * Handles HTTP requests, retries, rate-limit backoff, and trainer/circle fetches.
 * No caching, no stat computation — pure network I/O.
 *
 * Primary path: /api/v4/user/profile/{account_id} — single request, full data.
 * Fallback:     /api/v3/search                    — used when v4 profile returns 404.
 */

import { log } from '../core/log.js';
import { enqueue } from './umaQueue.js';

const API_BASE    = 'https://uma.moe/api/v4';
const API_BASE_V3 = 'https://uma.moe/api/v3';

// Per uma.moe's published API docs (https://uma.moe/api/docs): endpoints are
// protected against scraping and expect either an `X-API-Key` header or a
// valid `X-Browser-Proof` header. We use the API key.
export const UMA_API_KEY = process.env.UMA_MOE_API_KEY;

// Just the key header, for reuse by other umamoe/ modules (Playwright pages,
// axios/fetch scrapers) that build their own header sets.
export const UMA_KEY_HEADERS = UMA_API_KEY ? { 'X-API-Key': UMA_API_KEY } : {};

export const UMA_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Referer: 'https://uma.moe/',
  Origin:  'https://uma.moe',
  ...UMA_KEY_HEADERS,
};

export async function fetchWithRetry(url, opts, attempt = 0) {
  const res = await fetch(url, opts);
  if (res.status === 429 || res.status >= 500) {
    const delays = [5_000, 15_000, 45_000];
    if (attempt < delays.length) {
      let wait = delays[attempt];
      if (res.status === 429) {
        const retryAfter = res.headers.get('retry-after');
        if (retryAfter) {
          const parsed = parseInt(retryAfter, 10);
          if (!isNaN(parsed)) wait = Math.max(wait, parsed * 1_000);
        }
      }
      log.warn(`uma.moe ${res.status} — retrying in ${wait / 1000}s (attempt ${attempt + 1})`);
      await new Promise(r => setTimeout(r, wait));
      return fetchWithRetry(url, opts, attempt + 1);
    }
    throw new Error(`uma.moe API ${res.status}: ${res.statusText} (after retries)`);
  }
  if (!res.ok) throw new Error(`uma.moe API ${res.status}: ${res.statusText}`);
  return res.json();
}

// ─── v4 Profile endpoint ──────────────────────────────────────────────────────

/**
 * Fetch a trainer's full profile from the v4 profile API.
 * Returns the raw ProfileResponse JSON, or null on 404 / network failure.
 *
 * Shape: { trainer, circle, circle_history, fan_history,
 *          inheritance, support_card, team_stadium, veterans }
 *
 * @param {string} accountId
 * @returns {Promise<object|null>}
 */
export async function fetchProfile(accountId) {
  const id = String(accountId).replace(/\s+/g, '');
  const url = `${API_BASE}/user/profile/${id}`;
  try {
    return await enqueue(() => fetchWithRetry(url, { headers: UMA_HEADERS }));
  } catch (err) {
    if (err.message.includes('404')) return null;
    log.warn(`fetchProfile(${id}): ${err.message}`);
    return null;
  }
}

/**
 * Build the canonical trainer-profile shape from a v4 ProfileResponse.
 * @param {string} id
 * @param {object} p  — raw ProfileResponse
 */
function _normalizeProfileResponse(id, p) {
  const trainer = p.trainer ?? {};
  const inh     = p.inheritance ?? {};

  // trophy_num_info is an undocumented raw field; fall back gracefully.
  const trophy = trainer.trophy_num_info ?? {};

  return {
    trainer_id:   String(trainer.account_id ?? id),
    trainer_name: trainer.name ?? null,

    affinity:      inh.affinity_score ?? null,
    white_count:   inh.white_count    ?? null,
    win_count:     inh.win_count      ?? null,
    parent_rank:   inh.parent_rank    ?? null,
    parent_rarity: inh.parent_rarity  ?? null,

    main_parent_id:  inh.main_parent_id  ? Math.floor(inh.main_parent_id  / 100) : null,
    parent_left_id:  inh.parent_left_id  ? Math.floor(inh.parent_left_id  / 100) : null,
    parent_right_id: inh.parent_right_id ? Math.floor(inh.parent_right_id / 100) : null,

    blue_sparks:  inh.blue_sparks  ?? [],
    pink_sparks:  inh.pink_sparks  ?? [],
    green_sparks: inh.green_sparks ?? [],
    white_sparks: inh.white_sparks ?? [],

    blue_stars:  inh.blue_stars_sum  ?? 0,
    pink_stars:  inh.pink_stars_sum  ?? 0,
    green_stars: inh.green_stars_sum ?? 0,
    white_stars: inh.white_stars_sum ?? 0,

    rank_score:            trainer.rank_score            ?? null,
    team_class:            trainer.team_class            ?? null,
    team_evaluation_point: trainer.team_evaluation_point ?? null,
    comment:               trainer.comment               ?? null,
    leader_char_id: trainer.leader_chara_dress_id
      ? Math.floor(trainer.leader_chara_dress_id / 100)
      : null,
    trophy: {
      g1: trophy.g1 ?? 0,
      g2: trophy.g2 ?? 0,
      g3: trophy.g3 ?? 0,
      ex: trophy.ex ?? 0,
    },
  };
}

// ─── v3 Search fallback ───────────────────────────────────────────────────────

async function _searchTrainerId(id, searchType) {
  const params = new URLSearchParams({
    page: '0', limit: '1', trainer_id: id,
    sort_by: 'affinity_score', sort_order: 'desc', max_follower_num: '999',
  });
  if (searchType) params.set('search_type', searchType);

  try {
    return await enqueue(async () => {
      const res = await fetch(`${API_BASE_V3}/search?${params.toString()}`, { headers: UMA_HEADERS });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`search API ${res.status}`);

      const data  = await res.json();
      const items = data?.items;
      if (!Array.isArray(items) || items.length === 0) return null;

      const item = items[0];
      if (String(item.account_id) !== String(id)) return null;
      return item;
    });
  } catch (err) {
    log.warn(`_searchTrainerId(${id}, ${searchType}): ${err.message}`);
    return null;
  }
}

async function _fetchTrainerProfileViaSearch(id) {
  let item = await _searchTrainerId(id, 'inheritance');
  if (!item) {
    log.debug(`fetchTrainerProfile(${id}): inheritance pass empty, trying plain search`);
    item = await _searchTrainerId(id, null);
  }
  if (!item) return null;

  const inh = item.inheritance ?? {};

  return {
    trainer_id:   item.account_id ?? id,
    trainer_name: item.trainer_name ?? null,

    affinity:      inh.affinity_score ?? null,
    white_count:   inh.white_count    ?? null,
    win_count:     inh.win_count      ?? null,
    parent_rank:   inh.parent_rank    ?? null,
    parent_rarity: inh.parent_rarity  ?? null,

    main_parent_id:  inh.main_parent_id  ? Math.floor(inh.main_parent_id  / 100) : null,
    parent_left_id:  inh.parent_left_id  ? Math.floor(inh.parent_left_id  / 100) : null,
    parent_right_id: inh.parent_right_id ? Math.floor(inh.parent_right_id / 100) : null,

    blue_sparks:  inh.blue_sparks  ?? [],
    pink_sparks:  inh.pink_sparks  ?? [],
    green_sparks: inh.green_sparks ?? [],
    white_sparks: inh.white_sparks ?? [],

    blue_stars:  inh.blue_stars_sum  ?? 0,
    pink_stars:  inh.pink_stars_sum  ?? 0,
    green_stars: inh.green_stars_sum ?? 0,
    white_stars: inh.white_stars_sum ?? 0,

    rank_score:            item.rank_score            ?? null,
    team_class:            item.team_class            ?? null,
    team_evaluation_point: item.team_evaluation_point ?? null,
    comment:               item.comment               ?? null,
    leader_char_id: item.leader_chara_dress_id
      ? Math.floor(item.leader_chara_dress_id / 100)
      : null,
    trophy: {
      g1: item.trophy?.g1 ?? 0,
      g2: item.trophy?.g2 ?? 0,
      g3: item.trophy?.g3 ?? 0,
      ex: item.trophy?.ex ?? 0,
    },
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch a trainer profile, normalised to the canonical shape used throughout
 * the bot. Tries the v4 profile endpoint first (single request, richer data);
 * falls back to v3/search if the profile returns 404 or is unavailable.
 *
 * @param {string} trainerId
 * @returns {Promise<object|null>}
 */
export async function fetchTrainerProfile(trainerId) {
  const id = String(trainerId).replace(/\s+/g, '');

  // Primary: v4 profile endpoint
  try {
    const p = await fetchProfile(id);
    if (p) {
      log.debug(`fetchTrainerProfile(${id}): resolved via v4 profile`);
      return _normalizeProfileResponse(id, p);
    }
  } catch (err) {
    log.debug(`fetchTrainerProfile(${id}): v4 profile error, falling back to search: ${err.message}`);
  }

  // Fallback: v3/search (covers trainers not yet indexed by the profile endpoint)
  log.debug(`fetchTrainerProfile(${id}): falling back to v3/search`);
  return _fetchTrainerProfileViaSearch(id);
}

export function fetchCircle(circleId, year, month) {
  const params = new URLSearchParams({ circle_id: String(circleId) });
  if (year  != null) params.set('year',  String(year));
  if (month != null) params.set('month', String(month));
  const url = `${API_BASE}/circles?${params.toString()}`;
  return enqueue(() => fetchWithRetry(url, { headers: UMA_HEADERS }));
}
