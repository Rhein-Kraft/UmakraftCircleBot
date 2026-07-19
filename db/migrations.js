// @ts-check
/**
 * migrations.js
 * ─────────────
 * Lightweight SQLite migration runner.
 *
 * Usage:
 *   import { runMigrations } from './migrations.js';
 *
 *   runMigrations(db, [
 *     {
 *       name: '001_add_email_column',
 *       up: db => db.exec('ALTER TABLE users ADD COLUMN email TEXT'),
 *     },
 *   ]);
 *
 * Each migration runs exactly once — applied migrations are recorded in a
 * `_migrations` table on the same database. Re-running initXxxDb() after
 * a new migration is added will apply only the pending ones.
 *
 * Migrations are applied in array order, each wrapped in a transaction.
 * A failing migration throws immediately and leaves subsequent ones unapplied.
 */
import { log } from '../core/log.js';

/**
 * @typedef {{ name: string, up: (db: import('better-sqlite3').Database) => void }} Migration
 */

/**
 * Apply any pending migrations to the given database.
 * @param {import('better-sqlite3').Database} db
 * @param {Migration[]} migrations
 */
export function runMigrations(db, migrations) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      applied_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    db
      .prepare('SELECT name FROM _migrations ORDER BY id')
      .all()
      .map(r => r.name)
  );

  for (const { name, up } of migrations) {
    if (applied.has(name)) continue;

    log.info(`migrations: applying "${name}"…`);
    db.transaction(() => {
      up(db);
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(name);
    })();
    log.info(`migrations: "${name}" applied`);
  }
}
