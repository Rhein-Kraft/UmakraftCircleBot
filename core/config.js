// @ts-check
/**
 * config.js
 * ─────────
 * Reads environment variables and exports a single frozen config object.
 *
 * Fail-fast: any required variable that is missing throws at import time,
 * so the bot never starts in a partially-configured state.
 */
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(__dirname);

/**
 * Require one of several env vars — returns the first one that is set.
 * Throws if none are set.
 * @param {...string} names
 * @returns {string}
 */
function requiredAny(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  throw new Error(`Missing required environment variable: one of ${names.join(', ')} must be set`);
}

/**
 * @typedef {{
 *   token: string,
 *   clientId: string | null,
 *   guildId: string | null,
 *   circleId: string,
 *   circleName: string,
 *   circle2Id: string | null,
 *   circle2Name: string,
 *   announcementChannel: string,
 *   dataDir: string,
 *   timezone: string,
 *   logLevel: string,
 *   monthlyRequirement: number,
 *   monthlyMinimumRequirement: number,
 *   dailyRequirement: number,
 *   highGainSafeThreshold: number,
 *   highGainSafeDaysWindow: number,
 *   timelineUrl: string,
 *   timelineChannel: string,
 *   timelineInterval: number,
 * }} BotConfig
 */

/** @type {Readonly<BotConfig>} */
export const config = Object.freeze({
  token: requiredAny('DISCORD_TOKEN', 'DISCORD_BOT_TOKEN'),
  clientId: process.env.DISCORD_CLIENT_ID || null,
  guildId: process.env.GUILD_ID || null,
  circleId: process.env.CIRCLE_ID || '974470619',
  circleName: process.env.CIRCLE_NAME || 'UmaKraft',
  circle2Id: process.env.CIRCLE_2_ID || null,
  circle2Name: process.env.CIRCLE_2_NAME || 'UmaKraft 2',
  announcementChannel: process.env.ANNOUNCEMENT_CHANNEL || 'announcement',
  dataDir: path.resolve(projectRoot, process.env.DATA_DIR || './data'),
  timezone: process.env.TIMEZONE || 'Asia/Tokyo',
  logLevel: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  monthlyRequirement: 30_000_000,
  monthlyMinimumRequirement: 15_000_000,
  weeklyRequirement: 7_500_000,
  dailyRequirement: 1_000_000,
  highGainSafeThreshold: 20_000_000,
  highGainSafeDaysWindow: 15,
  timelineUrl: process.env.TIMELINE_URL ?? 'https://uma.moe/timeline',
  timelineChannel: process.env.TIMELINE_CHANNEL || 'uma-timeline',
  timelineInterval: Math.max(1, parseInt(process.env.TIMELINE_UPDATE_INTERVAL) || 1440),
});

/**
 * Live provider for getConfiguredCircles().
 * Starts as null (env var fallback). circleDb.initCircleDb() replaces this
 * with the DB-backed getCircles() function after the registry is ready.
 * @type {(() => { id: string, name: string }[]) | null}
 */
let _circlesProvider = null;

/**
 * Register the circle registry as the live provider for getConfiguredCircles().
 * Called once by circleDb.initCircleDb() — do not call from anywhere else.
 * @param {() => { id: string, name: string }[]} fn
 */
export function setCirclesProvider(fn) {
  _circlesProvider = fn;
}

/**
 * Returns all active circles as an array of { id, name }.
 *
 * After initCircleDb() runs this reads from the SQLite circle registry
 * (db/circleDb.js) and supports up to 10 circles.
 *
 * Before initCircleDb() runs (early startup) it falls back to the
 * CIRCLE_ID / CIRCLE_2_ID env vars so config-dependent code that runs
 * before the DB is ready still works correctly.
 *
 * @returns {{ id: string, name: string }[]}
 */
export function getConfiguredCircles() {
  if (_circlesProvider) return _circlesProvider();
  // Env var fallback — used only before circleDb is initialized
  const circles = [{ id: config.circleId, name: config.circleName }];
  if (config.circle2Id) circles.push({ id: config.circle2Id, name: config.circle2Name });
  return circles;
}
