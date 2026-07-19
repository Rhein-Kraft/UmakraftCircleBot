/**
 * Unit tests for db/migrations.js
 *
 * Uses an in-memory SQLite database — no temp files, no cleanup needed.
 * migrations.js is a pure function: pass any Database instance, get predictable results.
 */
import { describe, test, expect } from 'vitest';
import Database from 'better-sqlite3';

process.env.DISCORD_TOKEN = 'test-token';
process.env.CIRCLE_ID = '000000001';
process.env.LOG_LEVEL = 'error';

const { runMigrations } = await import('../db/migrations.js');

function freshDb() {
  return new Database(':memory:');
}

describe('runMigrations() — setup', () => {
  test('creates _migrations table on a brand-new database', () => {
    const db = freshDb();
    runMigrations(db, []);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'")
      .all();
    expect(tables).toHaveLength(1);
  });

  test('_migrations table has correct columns (id, name, applied_at)', () => {
    const db = freshDb();
    runMigrations(db, []);
    const cols = db.pragma('table_info(_migrations)').map(r => r.name);
    expect(cols).toContain('id');
    expect(cols).toContain('name');
    expect(cols).toContain('applied_at');
  });

  test('calling with empty migration list is safe', () => {
    const db = freshDb();
    expect(() => runMigrations(db, [])).not.toThrow();
    const count = db.prepare('SELECT COUNT(*) AS c FROM _migrations').get();
    expect(count.c).toBe(0);
  });
});

describe('runMigrations() — applying migrations', () => {
  test('runs a migration and creates its table', () => {
    const db = freshDb();
    runMigrations(db, [
      { name: 'create_t', up: d => d.exec('CREATE TABLE t (x INTEGER)') },
    ]);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='t'")
      .all();
    expect(tables).toHaveLength(1);
  });

  test('records migration name in _migrations', () => {
    const db = freshDb();
    runMigrations(db, [{ name: 'my_migration', up: d => d.exec('CREATE TABLE x (y TEXT)') }]);
    const row = db.prepare('SELECT name FROM _migrations WHERE name = ?').get('my_migration');
    expect(row).toBeTruthy();
    expect(row.name).toBe('my_migration');
  });

  test('records a non-null applied_at timestamp', () => {
    const db = freshDb();
    runMigrations(db, [{ name: 'ts_test', up: d => d.exec('CREATE TABLE ts_t (id INTEGER)') }]);
    const row = db.prepare('SELECT applied_at FROM _migrations WHERE name = ?').get('ts_test');
    expect(row.applied_at).toBeTruthy();
  });

  test('applies multiple migrations in array order', () => {
    const db = freshDb();
    const order = [];
    runMigrations(db, [
      { name: 'step_1', up: () => order.push(1) },
      { name: 'step_2', up: () => order.push(2) },
      { name: 'step_3', up: () => order.push(3) },
    ]);
    expect(order).toEqual([1, 2, 3]);
    const count = db.prepare('SELECT COUNT(*) AS c FROM _migrations').get();
    expect(count.c).toBe(3);
  });

  test('existing data survives a migration that adds a column', () => {
    const db = freshDb();
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
    db.prepare('INSERT INTO users (name) VALUES (?)').run('Alice');
    runMigrations(db, [
      { name: 'add_email', up: d => d.exec('ALTER TABLE users ADD COLUMN email TEXT') },
    ]);
    const row = db.prepare('SELECT name FROM users WHERE name = ?').get('Alice');
    expect(row).toBeTruthy();
    expect(row.name).toBe('Alice');
  });
});

describe('runMigrations() — idempotency', () => {
  test('running twice with the same migrations calls up() only once', () => {
    const db = freshDb();
    let callCount = 0;
    const migrations = [{ name: 'once_only', up: () => { callCount++; } }];
    runMigrations(db, migrations);
    runMigrations(db, migrations);
    expect(callCount).toBe(1);
  });

  test('_migrations table has exactly one row after two runs', () => {
    const db = freshDb();
    const migrations = [{ name: 'dedup_test', up: () => {} }];
    runMigrations(db, migrations);
    runMigrations(db, migrations);
    const count = db.prepare('SELECT COUNT(*) AS c FROM _migrations').get();
    expect(count.c).toBe(1);
  });

  test('only pending migrations run when some are already applied', () => {
    const db = freshDb();
    const calls = [];
    runMigrations(db, [{ name: 'm1', up: () => calls.push('m1') }]);
    runMigrations(db, [
      { name: 'm1', up: () => calls.push('m1-again') },
      { name: 'm2', up: () => calls.push('m2') },
    ]);
    expect(calls).toEqual(['m1', 'm2']);
  });
});

describe('runMigrations() — failure behaviour', () => {
  test('a throwing migration propagates the error', () => {
    const db = freshDb();
    expect(() => {
      runMigrations(db, [
        { name: 'bad_migration', up: () => { throw new Error('intentional failure'); } },
      ]);
    }).toThrow('intentional failure');
  });

  test('a failing migration is NOT recorded in _migrations', () => {
    const db = freshDb();
    try {
      runMigrations(db, [
        { name: 'will_fail', up: () => { throw new Error('fail'); } },
      ]);
    } catch { /* expected */ }
    const row = db.prepare('SELECT name FROM _migrations WHERE name = ?').get('will_fail');
    expect(row).toBeUndefined();
  });

  test('migrations after a failure are not applied', () => {
    const db = freshDb();
    let ranAfter = false;
    try {
      runMigrations(db, [
        { name: 'fail_first', up: () => { throw new Error('stop here'); } },
        { name: 'after_fail', up: () => { ranAfter = true; } },
      ]);
    } catch { /* expected */ }
    expect(ranAfter).toBe(false);
  });
});
