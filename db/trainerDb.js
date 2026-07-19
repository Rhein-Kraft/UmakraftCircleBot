import Database from 'better-sqlite3';
import path from 'path';
import { config } from '../core/config.js';
import { log } from '../core/log.js';

let db;

export function initTrainerDb() {
  const dbPath = path.join(config.dataDir, 'trainers.db');
  db = new Database(dbPath);

  // Enable WAL for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS trainers (
      trainer_id          TEXT PRIMARY KEY,
      character           TEXT,
      rank_score          INTEGER DEFAULT 0,
      affinity_score      INTEGER DEFAULT 0,
      mile                INTEGER DEFAULT 0,
      medium              INTEGER DEFAULT 0,
      long_dist           INTEGER DEFAULT 0,
      sprint              INTEGER DEFAULT 0,
      blue_spark_count    INTEGER DEFAULT 0,
      white_spark_count   INTEGER DEFAULT 0,
      win_count           INTEGER DEFAULT 0,
      unique_skill        TEXT    DEFAULT '',
      white_skills        TEXT    DEFAULT '[]',
      raw_profile         TEXT    DEFAULT NULL,
      results_message_id  TEXT    DEFAULT NULL,
      submitted_by        TEXT,
      created_at          TEXT    DEFAULT (datetime('now')),
      expires_at          TEXT,
      is_saved            INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_trainer_rank      ON trainers(rank_score DESC);
    CREATE INDEX IF NOT EXISTS idx_trainer_affinity  ON trainers(affinity_score DESC);
    CREATE INDEX IF NOT EXISTS idx_trainer_white     ON trainers(white_spark_count DESC);
    CREATE INDEX IF NOT EXISTS idx_expires           ON trainers(expires_at);

    CREATE TABLE IF NOT EXISTS trainer_skills (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      trainer_id  TEXT    NOT NULL,
      skill_name  TEXT    NOT NULL,
      skill_type  TEXT    NOT NULL DEFAULT 'unknown',
      UNIQUE(trainer_id, skill_name),
      FOREIGN KEY(trainer_id) REFERENCES trainers(trainer_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_skills_trainer ON trainer_skills(trainer_id);
    CREATE INDEX IF NOT EXISTS idx_skills_name    ON trainer_skills(skill_name);
    CREATE INDEX IF NOT EXISTS idx_skills_type    ON trainer_skills(skill_type);
  `);

  // Safe migration for existing DBs — add columns that may be missing
  const existingCols = db
    .prepare('PRAGMA table_info(trainers)')
    .all()
    .map(r => r.name);
  const addIfMissing = (col, def) => {
    if (!existingCols.includes(col)) {
      db.exec(`ALTER TABLE trainers ADD COLUMN ${col} ${def}`);
      log.info(`trainerDb: migrated — added column ${col}`);
    }
  };

  addIfMissing('unique_skill', "TEXT    DEFAULT ''");
  addIfMissing('white_skills', "TEXT    DEFAULT '[]'");
  addIfMissing('win_count', 'INTEGER DEFAULT 0');
  addIfMissing('raw_profile', 'TEXT    DEFAULT NULL');
  addIfMissing('results_message_id', 'TEXT    DEFAULT NULL');

  log.info('trainerDb: initialized');
  return db;
}

export function getDb() {
  if (!db) throw new Error('Trainer DB not initialized. Call initTrainerDb() first.');
  return db;
}

export function upsertTrainer(data) {
  const stmt = getDb().prepare(`
    INSERT INTO trainers
      (trainer_id, character, rank_score, affinity_score, mile, medium, long_dist,
       sprint, blue_spark_count, white_spark_count, win_count, unique_skill, white_skills,
       raw_profile, submitted_by, expires_at, is_saved)
    VALUES
      (@trainer_id, @character, @rank_score, @affinity_score, @mile, @medium, @long_dist,
       @sprint, @blue_spark_count, @white_spark_count, @win_count, @unique_skill, @white_skills,
       @raw_profile, @submitted_by, @expires_at, @is_saved)
    ON CONFLICT(trainer_id) DO UPDATE SET
      character          = excluded.character,
      rank_score         = excluded.rank_score,
      affinity_score     = excluded.affinity_score,
      mile               = excluded.mile,
      medium             = excluded.medium,
      long_dist          = excluded.long_dist,
      sprint             = excluded.sprint,
      blue_spark_count   = excluded.blue_spark_count,
      white_spark_count  = excluded.white_spark_count,
      win_count          = excluded.win_count,
      unique_skill       = excluded.unique_skill,
      white_skills       = excluded.white_skills,
      raw_profile        = excluded.raw_profile,
      submitted_by       = excluded.submitted_by,
      expires_at         = excluded.expires_at,
      is_saved           = excluded.is_saved,
      created_at         = datetime('now')
  `);
  return stmt.run(data);
}

/**
 * Upsert skill rows linked to a trainer.
 * Pass an array of { skill_name, skill_type } objects.
 */
export function upsertTrainerSkills(trainerId, skills = []) {
  const stmt = getDb().prepare(`
    INSERT INTO trainer_skills (trainer_id, skill_name, skill_type)
    VALUES (@trainer_id, @skill_name, @skill_type)
    ON CONFLICT(trainer_id, skill_name) DO UPDATE SET skill_type = excluded.skill_type
  `);
  const insertMany = getDb().transaction(rows => {
    for (const row of rows) stmt.run(row);
  });
  insertMany(
    skills.map(s => ({ trainer_id: trainerId, skill_name: s.skill_name, skill_type: s.skill_type }))
  );
}

export function getTrainerById(trainerId) {
  return getDb().prepare('SELECT * FROM trainers WHERE trainer_id = ?').get(trainerId);
}

export function markTrainerSaved(trainerId) {
  return getDb()
    .prepare('UPDATE trainers SET is_saved = 1, expires_at = NULL WHERE trainer_id = ?')
    .run(trainerId);
}

export function updateResultsMessageId(trainerId, messageId) {
  return getDb()
    .prepare('UPDATE trainers SET results_message_id = ? WHERE trainer_id = ?')
    .run(messageId, trainerId);
}

/**
 * All non-expired trainers sorted for the leaderboard:
 *   rank_score DESC → affinity_score DESC → white_spark_count DESC
 */
export function getAllTrainers() {
  return getDb()
    .prepare(
      `
      SELECT * FROM trainers
      WHERE (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY rank_score DESC, affinity_score DESC, white_spark_count DESC
    `
    )
    .all();
}

export function searchTrainers(filters = {}) {
  const conditions = ["(expires_at IS NULL OR expires_at > datetime('now'))"];
  const params = {};

  if (filters.trainer) {
    // Match trainer name OR trainer ID (exact on ID, partial on name)
    conditions.push('(lower(character) LIKE @trainer_name OR trainer_id = @trainer_id)');
    params.trainer_name = `%${filters.trainer.toLowerCase()}%`;
    params.trainer_id = filters.trainer.trim();
  }
  if (filters.rank != null) {
    conditions.push('rank_score >= @rank');
    params.rank = filters.rank;
  }
  if (filters.whiteskills != null) {
    conditions.push('white_spark_count >= @whiteskills');
    params.whiteskills = filters.whiteskills;
  }

  const where = conditions.join(' AND ');
  return getDb()
    .prepare(
      `
      SELECT * FROM trainers
      WHERE ${where}
      ORDER BY rank_score DESC, affinity_score DESC, white_spark_count DESC
    `
    )
    .all(params);
}

export function pruneExpiredTrainers() {
  const result = getDb()
    .prepare(
      `DELETE FROM trainers WHERE is_saved = 0 AND expires_at IS NOT NULL AND expires_at <= datetime('now')`
    )
    .run();
  if (result.changes > 0) log.info(`trainerDb: pruned ${result.changes} expired entries`);
  return result.changes;
}
