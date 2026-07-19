// @ts-check
/**
 * core/quotaKeys.js
 * ─────────────────
 * Shared quota key resolution for guildConfig.
 *
 * Key format (all 10 circles, uniform):
 *   quota_<circleId>_<scope>   e.g.  quota_974470619_daily
 *
 * All circles — including 1 and 2 — use this format exclusively.
 * The old legacy keys (quotaDaily / quota_c2_Daily) are no longer read.
 * Any data stored under those keys will simply fall through to the default.
 */

/**
 * The guildConfig storage key for a given circle + scope.
 * @param {string} circleId
 * @param {'daily'|'weekly'|'monthly'} scope
 * @returns {string}
 */
export function quotaKey(circleId, scope) {
  return `quota_${circleId}_${scope.toLowerCase()}`;
}

/**
 * Resolve the effective quota from a guildConfig object.
 *
 * Resolution order:
 *   1. New key  quota_<circleId>_<scope>
 *   2. defaultVal
 *
 * @param {Record<string, any>} cfg           guildConfig object
 * @param {string}              circleId
 * @param {'daily'|'weekly'|'monthly'} scope
 * @param {number}              defaultVal
 * @returns {number}
 */
export function resolveQuota(cfg, circleId, scope, defaultVal) {
  const newKey = quotaKey(circleId, scope);
  if (cfg[newKey] != null) return cfg[newKey];
  return defaultVal;
}
