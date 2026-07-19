/**
 * One-shot script: sets circle 2 fan quotas in guild_config.
 * Run once after CIRCLE_2_ID is activated.
 * Safe to re-run — patch is merged, existing keys are preserved.
 *
 * If this script was previously run with the old key format
 * (quota_c2_Daily etc.), re-run it to write the correct keys.
 * The old dead keys in the DB cause no harm but are never read.
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { quotaKey } from '../core/quotaKeys.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');

const GUILD_ID    = process.env.GUILD_ID    || '1489093959044173935';
const CIRCLE_2_ID = process.env.CIRCLE_2_ID || '325938032';

const db = new Database(path.join(DATA_DIR, 'store.db'));

const row      = db.prepare('SELECT config_json FROM guild_config WHERE guild_id = ?').get(GUILD_ID);
const existing = row ? JSON.parse(row.config_json) : {};

// Use the canonical quota key format (quota_<circleId>_<scope>) that
// resolveQuota() in core/quotaKeys.js actually reads.
// The previous format (quota_c2_Daily etc.) was never read by resolveQuota().
const patch = {
  [quotaKey(CIRCLE_2_ID, 'daily')]:   1_000_000,
  [quotaKey(CIRCLE_2_ID, 'weekly')]:  7_500_000,
  [quotaKey(CIRCLE_2_ID, 'monthly')]: 30_000_000,
};

const merged = { ...existing, ...patch };

db.prepare(`
  INSERT INTO guild_config (guild_id, config_json) VALUES (?, ?)
  ON CONFLICT(guild_id) DO UPDATE SET config_json = excluded.config_json
`).run(GUILD_ID, JSON.stringify(merged));

db.close();

console.log('Circle 2 quotas set:');
console.log(`  ${quotaKey(CIRCLE_2_ID, 'daily')}:   ${patch[quotaKey(CIRCLE_2_ID, 'daily')].toLocaleString()}`);
console.log(`  ${quotaKey(CIRCLE_2_ID, 'weekly')}:  ${patch[quotaKey(CIRCLE_2_ID, 'weekly')].toLocaleString()}`);
console.log(`  ${quotaKey(CIRCLE_2_ID, 'monthly')}: ${patch[quotaKey(CIRCLE_2_ID, 'monthly')].toLocaleString()}`);
