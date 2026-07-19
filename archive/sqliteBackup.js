// @ts-check
/**
 * sqliteBackup.js
 * ───────────────
 * Daily backup of all SQLite database files in DATA_DIR.
 *
 * Behaviour:
 *   - Copies every *.db file to DATA_DIR/backup/YYYY-MM-DD/
 *   - Runs at 3:30 AM JST (scheduled via tasks/index.js)
 *   - Retains the last 7 daily backups; older directories are pruned automatically
 *   - WAL sidecar files (*.db-shm, *.db-wal) are not copied — SQLite
 *     guarantees the main file is crash-safe after a clean backup copy
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../core/config.js';
import { log } from '../core/log.js';

const KEEP_BACKUPS = 7;

export async function runSqliteBackup() {
  const dataDir = config.dataDir;
  const today = new Date().toISOString().slice(0, 10);
  const backupDir = path.join(dataDir, 'backup', today);

  await fs.mkdir(backupDir, { recursive: true });

  let entries;
  try {
    entries = await fs.readdir(dataDir);
  } catch {
    log.warn('sqliteBackup: could not read DATA_DIR');
    return;
  }

  const dbFiles = entries.filter(f => f.endsWith('.db'));
  let backed = 0;
  for (const file of dbFiles) {
    const src = path.join(dataDir, file);
    const dst = path.join(backupDir, file);
    try {
      await fs.copyFile(src, dst);
      backed++;
    } catch (err) {
      log.warn(`sqliteBackup: failed to copy ${file}: ${err.message}`);
    }
  }

  if (backed > 0) {
    log.info(`sqliteBackup: ${backed} DB file(s) → ${backupDir}`);
  }

  // Prune old backups — keep only the most recent KEEP_BACKUPS directories
  try {
    const backupRoot = path.join(dataDir, 'backup');
    const days = (await fs.readdir(backupRoot)).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    const toDelete = days.slice(0, Math.max(0, days.length - KEEP_BACKUPS));
    for (const day of toDelete) {
      await fs.rm(path.join(backupRoot, day), { recursive: true, force: true });
      log.debug(`sqliteBackup: pruned ${day}`);
    }
  } catch (err) {
    log.warn('sqliteBackup: prune failed:', err.message);
  }
}
