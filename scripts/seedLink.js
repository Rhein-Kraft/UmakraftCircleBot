/**
 * scripts/seedLink.js
 * ────────────────────
 * Manually seed a Discord ↔ trainer link directly into the DB + backup file.
 * Usage: node scripts/seedLink.js <discord_id> <trainer_id>
 *
 * Example: node scripts/seedLink.js 123456789012345678 612856830731
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { writeFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(__dirname);

const DATA_DIR   = process.env.DATA_DIR ?? './data';
const DB_PATH    = path.join(DATA_DIR, 'links.db');
const BACKUP_PATH = path.join(PROJECT_ROOT, 'links_backup.json');

const [discordId, trainerId] = process.argv.slice(2);

if (!discordId || !trainerId) {
  console.error('Usage: node scripts/seedLink.js <discord_id> <trainer_id>');
  process.exit(1);
}

if (!/^\d{10,20}$/.test(discordId)) {
  console.error(`Discord ID looks wrong: "${discordId}" — should be 10–20 digits`);
  process.exit(1);
}
if (!/^\d+$/.test(trainerId)) {
  console.error(`Trainer ID looks wrong: "${trainerId}" — should be digits only`);
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    discord_id  TEXT PRIMARY KEY,
    viewer_id   TEXT NOT NULL,
    linked_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.prepare(`
  INSERT INTO links (discord_id, viewer_id) VALUES (?, ?)
  ON CONFLICT(discord_id) DO UPDATE SET viewer_id = excluded.viewer_id,
                                        linked_at = datetime('now')
`).run(discordId, trainerId);

db.pragma('wal_checkpoint(TRUNCATE)');

const rows = db.prepare('SELECT discord_id, viewer_id FROM links').all();
const obj  = Object.fromEntries(rows.map(r => [r.discord_id, r.viewer_id]));
writeFileSync(BACKUP_PATH, JSON.stringify(obj, null, 2) + '\n', 'utf8');

db.close();

console.log(`✅ Linked Discord ${discordId} → trainer ${trainerId}`);
console.log(`✅ links_backup.json updated (${rows.length} total link(s))`);
console.log(`✅ WAL checkpointed — data is in the main .db file`);
