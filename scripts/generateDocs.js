#!/usr/bin/env node
// @ts-check
/**
 * generateDocs.js
 * ───────────────
 * Auto-generates and updates the four project documentation files:
 *
 *   1. UMA_CIRCLE BOT—FULL_REPOSITORY_REPORT.md  — full repo inventory (Discord-pasteable)
 *   2. README.md                                  — project structure section
 *   3. Projectnotes.md                            — modernization roadmap task table
 *   4. CHANGELOG.md                               — all git commits, no entry left behind
 *
 * Usage:
 *   node scripts/generateDocs.js         — full update
 *   node scripts/generateDocs.js --dry   — print what would change, write nothing
 *
 * Run automatically via .git/hooks/pre-commit (installed by scripts/install-hooks.js).
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function read(rel) {
  const p = path.join(ROOT, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

function write(rel, content) {
  const p = path.join(ROOT, rel);
  if (DRY) {
    console.log(`[dry] would write ${rel} (${content.length} chars)`);
    return;
  }
  writeFileSync(p, content, 'utf8');
  console.log(`  ✔ ${rel}`);
}

function git(args) {
  try {
    return execSync(['git', '--no-optional-locks', ...args].join(' '), {
      cwd: ROOT,
      encoding: 'utf8',
      shell: false,
    }).trim();
  } catch {
    return '';
  }
}

function now() {
  return new Date()
    .toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(/\//g, '-');
}

/** Walk a directory tree, returning relative file paths (excludes ignored dirs). */
function walk(dir, base = dir, ignore = []) {
  const results = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = path.join(dir, entry);
    const rel = path.relative(base, full);
    if (ignore.some(ig => rel.startsWith(ig) || entry === ig)) continue;
    if (statSync(full).isDirectory()) {
      results.push(...walk(full, base, ignore));
    } else {
      results.push(rel);
    }
  }
  return results;
}

function countLines(rel) {
  try {
    const content = readFileSync(path.join(ROOT, rel), 'utf8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

// ─── Source data ──────────────────────────────────────────────────────────────

const IGNORE = [
  'node_modules',
  'data',
  'attached_assets',
  'milestone_images',
  '.git',
  '.local',
  'scripts',
];

const FILE_DESCRIPTIONS = {
  'index.js': 'Bot entry point — initializes all DBs, registers event handlers, logs in',
  'core/busyLock.js': 'Global notification lock preventing concurrent bulk posting jobs',
  'core/channels.js': 'Auto-create and find Discord channels by name/type',
  'core/config.js': 'Reads env vars into a frozen config object (// @ts-check + JSDoc)',
  'core/deploy-commands.js': 'REST slash-command registration with Discord API',
  'core/errors.js': 'safeRun() and withRetry() — centralized async error handling',
  'core/format.js': 'Number and date formatting utilities',
  'core/health.js': 'HTTP health-check server with task stats, memory, and sync status',
  'core/log.js': 'Leveled logger: debug/info/warn/error with ISO timestamp prefix',
  'core/milestoneImages.js': 'Loads and pools milestone image assets from disk',
  'core/store.js': 'JSON flat-file persistence; link ops delegate to SQLite via linksDb',
  'core/tally.js': 'Tally-period boundary helpers (day 7, 14, 21, month-end)',
  'core/taskRegistry.js': 'In-memory registry tracking every scheduled cron task',
  'core/uma.js': 'uma.moe v4 API client — fan-gain math, snapshot cache, rate-limit handling',
  'db/attendanceDb.js': 'SQLite — daily attendance records and streak tracking per circle',
  'db/linksDb.js': 'SQLite — Discord ↔ uma.moe trainer ID links (migrated from links.json)',
  'db/migrations.js': 'Reusable migration runner for any better-sqlite3 database',
  'db/milestoneDb.js': 'SQLite — milestone dedup state with per-circle multi-send flags',
  'db/onboardingDb.js': 'SQLite — trainer card onboarding status and reminder history',
  'db/timelineCache.js': 'SQLite — timeline event dedup and message tracking',
  'db/trainerDb.js': 'SQLite — trainer profiles, card images, and skill data',
  'links/repository.js': 'Repository API for Discord ↔ viewer links (wraps linksDb)',
  'handlers/guildMemberAdd.js': 'Discord event — new member welcome message + DM',
  'handlers/interactionCreate.js': 'Discord event — slash command and button routing',
  'handlers/messageCreate.js': 'Discord event — hype reactions, trainer ID auto-detection',
  'handlers/presenceUpdate.js': 'Discord event — timezone-aware morning greetings',
  'handlers/ready.js': 'Discord event — post-login slash command registration',
  'commands/admin_setjoindate.js': '/admin_setjoindate — override a member\'s join date',
  'commands/admin_sync.js': '/admin_sync — force immediate uma.moe data sync',
  'commands/admin_syncCards.js': '/admin_syncCards — sync trainer card images from Gametora',
  'commands/circle_master.js': '/circle_master — daily Top 3 contributors this month',
  'commands/fan_gain.js': '/fan_gain — personal daily/weekly/monthly fan gain + rank',
  'commands/help.js': '/help — list all bot commands',
  'commands/joindate.js': '/joindate — when did this member join the circle',
  'commands/keep.js': '/keep — mark a trainer card as permanently kept',
  'commands/leaderboard.js': '/leaderboard — fan-gain rankings daily/weekly/monthly',
  'commands/link.js': '/link — manually link Discord to uma.moe trainer name',
  'commands/search_trainer.js': '/search_trainer — look up a trainer by name or ID',
  'commands/set_fans.js': '/set_fans — set per-circle fan requirements (admin)',
  'commands/set_quota.js': '/set_quota — set server-wide fan quota targets (admin)',
  'commands/set_timezone.js': '/set_timezone — set personal timezone for greetings',
  'commands/store.js': '/store — save a trainer profile to the database',
  'commands/test_milestone.js': '/test_milestone — preview a milestone message (admin)',
  'commands/timeline_post.js': '/timeline_post — manually trigger a timeline fetch (admin)',
  'commands/timeline_setup.js': '/timeline_setup — configure #uma-timeline channel (admin)',
  'commands/total_circlefan_gain.js': '/total_circlefan_gain — circle\'s total monthly fan gain',
  'commands/total_fan.js': '/total_fan — lifetime total fan count and circle rank',
  'commands/unlink.js': '/unlink — remove Discord ↔ trainer link',
  'tasks/attendanceCheck.js': 'Cron 6:00 AM — record daily attendance per circle',
  'tasks/chatArchiver.js': 'Cron */5 min — move old #chat messages to #chat-history',
  'tasks/dailyMessages.js': 'Cron hourly — timezone-aware greetings (noon/night/midnight)',
  'tasks/dailyWarnings.js': 'Cron 7:05 AM — fan-deficit DMs for members below daily target',
  'tasks/dataSync.js': 'Cron */30 min — pull fresh circle data from uma.moe',
  'tasks/imageArchive.js': 'Cron */2 min — archive media channel images to #image-archive',
  'tasks/index.js': 'Registers all 25 cron schedules and startup tasks',
  'tasks/leaderboardAnnouncements.js': 'Cron — daily/weekly/monthly Top 3 leaderboard posts',
  'tasks/logsUpdateReport.js': 'Cron 8:30 AM — fan-deficit report in #logs-update',
  'tasks/messageCleanup.js': 'Cron 4:15 AM — delete bot command replies older than 24h',
  'tasks/milestoneCleanup.js': 'Cron */30 min — remove expired milestone announcement messages',
  'tasks/milestones.js': 'Cron 5,35 min — check and fire milestone messages per circle',
  'tasks/monthlyWarning.js': 'Cron 8:00 AM — 30M monthly goal progress warning',
  'tasks/nameLinker.js': 'Cron */4 h — auto-link Discord names to uma.moe trainer names',
  'tasks/offlineCheck.js': 'Cron 10:00 AM — DM members who haven\'t been active',
  'tasks/onboardingReminder.js': 'Cron */10 min — trainer card submission reminders via DM',
  'tasks/purgeAnnouncement.js': 'Cron hourly — clean old posts from #announcement',
  'tasks/purgeUmaStore.js': 'On boot — clear legacy messages from #uma-store',
  'tasks/sqliteBackup.js': 'Cron 3:30 AM — daily backup of all *.db files (7-day retention)',
  'tasks/tallyResults.js': 'Cron — post tally results on days 7, 14, 21, and month-end',
  'tasks/updateGameData.js': 'Cron 3:00 AM — refresh character/game data from Gametora',
  'tasks/weeklyAnnouncement.js': 'Cron Monday 9:00 AM — weekly leaderboard + help post',
  'timeline/timeline.js': 'Orchestrates timeline fetching, diffing, and Discord posting',
  'timeline/timelineScheduler.js': '5-minute cron driver for the timeline scraper',
  'timeline/timelineScraper.js': 'Scrapes the official Uma Musume timeline page via Playwright',
  'trainer/screenshotter.js': 'Headless Playwright screenshotter for trainer card images',
  'trainer/trainerLeaderboard.js': 'Persistent trainer leaderboard embed management',
  'utils/activityLog.js': 'Logs slash command usage to #logs-update',
  'utils/autoDelete.js': 'Schedules automatic message self-deletion',
  'utils/cardCache.js': 'In-memory cache for support card image data',
  'utils/changelog.js': 'Reads CHANGELOG.md and posts matching entry to #logs-update on boot',
  'utils/characterData.js': 'Uma Musume character name and ID lookup table',
  'utils/dm.js': 'Safe DM delivery wrapper with error handling',
  'utils/imageReport.js': 'Generates rich graphical fan-gain report card images',
  'utils/resumeCard.js': 'Builds trainer resume card embeds with stats and skills',
  'utils/skillScraper.js': 'Scrapes skill data for trainers from uma.moe trainer pages',
  'utils/updateLog.js': 'Formats and posts system status updates to #logs-update',
  'scrapers/skillScraper.js': 'Alias entry for utils/skillScraper.js',
  'tests/links.test.js': 'Integration tests for db/linksDb.js (7 tests)',
  'tests/milestone.test.js': 'Unit tests for milestone tier logic and winner draw (12 tests)',
};

const TASKS = [
  { name: 'dataSync', cron: '*/30 * * * *', desc: 'Pull fresh uma.moe data for all circles' },
  { name: 'milestones', cron: '5,35 * * * *', desc: 'Check and fire milestone messages' },
  { name: 'milestoneCleanup', cron: '10,40 * * * *', desc: 'Remove expired milestone announcements' },
  { name: 'onboardingReminder', cron: '*/10 * * * *', desc: 'Trainer card submission reminders via DM' },
  { name: 'greetings', cron: '0 * * * *', desc: 'Timezone-aware greetings (hourly)' },
  { name: 'attendanceCheck', cron: '0 6 * * *', desc: 'Record daily attendance per circle' },
  { name: 'dailyWarnings', cron: '5 7 * * *', desc: 'Fan-deficit DMs for members below target' },
  { name: 'dailyTop3', cron: '10 7 * * *', desc: 'Daily Top 3 leaderboard post' },
  { name: 'monthlyWarning', cron: '0 8 * * *', desc: '30M goal progress warning' },
  { name: 'logsUpdateReport', cron: '30 8 * * *', desc: 'Fan-deficit report in #logs-update' },
  { name: 'offlineCheck', cron: '0 10 * * *', desc: 'DM inactive members' },
  { name: 'weeklyLeaderboard', cron: '0 9 * * 1', desc: 'Full weekly leaderboard (Monday)' },
  { name: 'weeklyTop3', cron: '5 9 * * 1', desc: 'Weekly Top 3 post (Monday)' },
  { name: 'monthlyTop3', cron: '0 23 * * *', desc: 'Monthly Top 3 (fires on last day of month)' },
  { name: 'weeklyHelp', cron: '0 6 * * 1', desc: 'Weekly help post (Monday)' },
  { name: 'tallyResults', cron: '30 23 * * *', desc: 'Tally results on boundary days' },
  { name: 'nameLinker', cron: '0 */4 * * *', desc: 'Auto-link Discord ↔ uma.moe names' },
  { name: 'purgeAnnouncement', cron: '0 * * * *', desc: 'Clean old posts from #announcement' },
  { name: 'messageCleanup', cron: '15 4 * * *', desc: 'Delete bot replies older than 24h' },
  { name: 'sqliteBackup', cron: '30 3 * * *', desc: 'Daily backup of all *.db files' },
  { name: 'updateGameData', cron: '0 3 * * *', desc: 'Refresh character/game data from Gametora' },
  { name: 'chatArchiver', cron: '*/5 * * * *', desc: 'Move old #chat messages to #chat-history' },
  { name: 'imageArchive', cron: '*/2 * * * *', desc: 'Archive media channel images' },
];

const COMMANDS = [
  { name: '/fan_gain', desc: 'Personal daily/weekly/monthly fan gain + daily ranking' },
  { name: '/leaderboard', desc: 'Circle fan-gain rankings — daily, weekly, or monthly' },
  { name: '/total_fan', desc: 'Lifetime total fan count and circle rank' },
  { name: '/total_circlefan_gain', desc: "Circle's total accumulated fan gain this month" },
  { name: '/circle_master', desc: 'Day-by-day Top 3 contributors for the current month' },
  { name: '/link', desc: 'Link your Discord account to your Uma.moe trainer name' },
  { name: '/unlink', desc: 'Remove the Discord ↔ trainer link' },
  { name: '/store', desc: 'Save a trainer profile to the database (#uma-store only)' },
  { name: '/search_trainer', desc: 'Look up a trainer by name or ID' },
  { name: '/keep', desc: 'Mark a trainer card as permanently kept' },
  { name: '/joindate', desc: 'Show when a member joined the circle' },
  { name: '/set_timezone', desc: 'Set your local timezone for greetings and resets' },
  { name: '/set_quota', desc: 'Set server-wide fan quota targets (admin)' },
  { name: '/set_fans', desc: 'Set per-circle daily/weekly/monthly fan requirements (admin)' },
  { name: '/timeline_setup', desc: 'Configure #uma-timeline channel (admin)' },
  { name: '/timeline_post', desc: 'Manually trigger a timeline fetch and post (admin)' },
  { name: '/admin_sync', desc: 'Force immediate uma.moe data sync (admin)' },
  { name: '/admin_setjoindate', desc: "Manually override a member's join date (admin)" },
  { name: '/admin_syncCards', desc: 'Trigger trainer card image sync (admin)' },
  { name: '/test_milestone', desc: 'Preview a milestone message without posting it (admin)' },
  { name: '/help', desc: 'List all bot commands' },
];

const DB_TABLES = [
  { db: 'links.db', table: 'links', pk: 'discord_id', cols: 'viewer_id, linked_at' },
  { db: 'trainers.db', table: 'trainers', pk: 'trainer_id', cols: 'viewer_name, card_url, updated_at' },
  { db: 'trainers.db', table: 'trainer_skills', pk: 'id', cols: 'trainer_id, skill_name, skill_type' },
  { db: 'milestones.db', table: 'milestone_fired', pk: 'viewer_id+tier_key+month+circle_id', cols: 'position, fired_at, channel_sent, dm_member_sent, dm_leader_sent' },
  { db: 'onboarding.db', table: 'onboarding', pk: 'user_id+guild_id', cols: 'joined_at, first_dm_sent, card_provided, circle_id' },
  { db: 'attendance.db', table: 'attendance', pk: 'user_id+guild_id+circle_id+date', cols: 'first_seen' },
  { db: 'attendance.db', table: 'user_streaks', pk: 'user_id+guild_id+circle_id', cols: 'streak, last_date' },
  { db: 'timeline.db', table: 'posted_events', pk: 'event_id', cols: 'title, url, posted_at' },
  { db: 'timeline.db', table: 'timeline_state', pk: 'key', cols: 'value' },
  { db: 'timeline.db', table: 'timeline_messages', pk: 'event_id+guild_id', cols: 'channel_id, message_id' },
  { db: '*.db', table: '_migrations', pk: 'id', cols: 'name, applied_at' },
];

const ENV_VARS = [
  { key: 'DISCORD_TOKEN / DISCORD_BOT_TOKEN', required: true, default: '', desc: 'Discord bot token' },
  { key: 'DISCORD_CLIENT_ID', required: false, default: 'auto-detected', desc: 'Bot application ID (optional — self-detected after login)' },
  { key: 'GUILD_ID', required: false, default: '', desc: 'If set, slash commands register to this guild only (instant)' },
  { key: 'CIRCLE_ID', required: false, default: '974470619', desc: 'Primary uma.moe circle to track' },
  { key: 'CIRCLE_NAME', required: false, default: 'UmaKraft', desc: 'Display name for the primary circle' },
  { key: 'CIRCLE_2_ID', required: false, default: '', desc: 'Secondary circle ID (activates multi-circle mode)' },
  { key: 'CIRCLE_2_NAME', required: false, default: 'UmaKraft 2', desc: 'Display name for the secondary circle' },
  { key: 'ANNOUNCEMENT_CHANNEL', required: false, default: 'announcement', desc: 'Channel for milestones, greetings, leaderboards' },
  { key: 'DATA_DIR', required: false, default: './data', desc: 'Directory for all JSON and SQLite state files' },
  { key: 'TIMEZONE', required: false, default: 'Asia/Tokyo', desc: 'Cron schedule timezone' },
  { key: 'LOG_LEVEL', required: false, default: 'info', desc: 'Minimum log level: debug / info / warn / error' },
  { key: 'TIMELINE_URL', required: false, default: 'https://uma.moe/timeline', desc: 'Timeline source URL (empty to disable)' },
  { key: 'TIMELINE_CHANNEL', required: false, default: 'uma-timeline', desc: 'Channel for timeline update posts' },
  { key: 'TIMELINE_UPDATE_INTERVAL', required: false, default: '5', desc: 'Timeline polling interval in minutes (1–59)' },
];

// ─── 1. FULL REPOSITORY REPORT ────────────────────────────────────────────────

function generateReport() {
  const files = walk(ROOT, ROOT, IGNORE).filter(f => !f.startsWith('.'));
  const sourceFiles = files.filter(f => f.endsWith('.js'));
  const totalLines = sourceFiles.reduce((sum, f) => sum + countLines(f), 0);
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']) || 'main';
  const lastCommitHash = git(['log', '-1', '--format=%h']) || 'unknown';
  const lastCommitDate = git(['log', '-1', '--format=%cd', '--date=format:%Y-%m-%d']) || '';
  const lastCommitSubject = git(['log', '-1', '--format=%s']) || '';
  const lastCommit = `${lastCommitHash} — ${lastCommitSubject} (${lastCommitDate})`;
  const timestamp = now();

  const fileRows = sourceFiles
    .map(f => {
      const desc = FILE_DESCRIPTIONS[f] || '—';
      const lines = countLines(f);
      return `| \`${f}\` | ${desc} | ${lines} |`;
    })
    .join('\n');

  const taskRows = TASKS.map(
    t => `| \`${t.name}\` | \`${t.cron}\` | ${t.desc} |`
  ).join('\n');

  const cmdRows = COMMANDS.map(c => `| \`${c.name}\` | ${c.desc} |`).join('\n');

  const dbRows = DB_TABLES.map(
    t => `| \`${t.db}\` | \`${t.table}\` | \`${t.pk}\` | ${t.cols} |`
  ).join('\n');

  const envRows = ENV_VARS.map(
    e =>
      `| \`${e.key}\` | ${e.required ? '✅ Required' : 'Optional'} | \`${e.default || '—'}\` | ${e.desc} |`
  ).join('\n');

  // Discord-pasteable code block section
  const discordBlock = [
    '```',
    '╔══════════════════════════════════════════════════════╗',
    '║         UMA CIRCLE BOT — REPOSITORY SUMMARY         ║',
    `║  Generated : ${timestamp.padEnd(36)}║`,
    `║  Branch    : ${branch.padEnd(36)}║`,
    `║  Commit    : ${lastCommit.slice(0, 36).padEnd(36)}║`,
    '╠══════════════════════════════════════════════════════╣',
    `║  Source files : ${String(sourceFiles.length).padEnd(33)}║`,
    `║  Total lines  : ~${String(totalLines).padEnd(32)}║`,
    `║  Commands     : ${String(COMMANDS.length).padEnd(33)}║`,
    `║  Cron tasks   : ${String(TASKS.length).padEnd(33)}║`,
    `║  SQLite DBs   : ${String(new Set(DB_TABLES.map(t => t.db)).size).padEnd(33)}║`,
    '╠══════════════════════════════════════════════════════╣',
    '║  SLASH COMMANDS                                      ║',
    ...COMMANDS.map(c => `║  ${c.name.padEnd(22)} ${c.desc.slice(0, 26).padEnd(26)}║`),
    '╠══════════════════════════════════════════════════════╣',
    '║  SCHEDULED TASKS (Asia/Tokyo)                        ║',
    ...TASKS.map(t => `║  ${t.name.padEnd(20)} ${t.cron.padEnd(15)} ${t.desc.slice(0, 13).padEnd(13)}║`),
    '╚══════════════════════════════════════════════════════╝',
    '```',
  ].join('\n');

  return `# Uma Circle Bot — Full Repository Report

> **Auto-generated by \`scripts/generateDocs.js\` — do not edit manually.**
> Last updated: **${timestamp} JST** | Branch: \`${branch}\`
> Last commit: \`${lastCommit}\`

---

## Discord Paste Block

Copy this entire block and paste it directly into any Discord channel:

${discordBlock}

---

## Stats

| Metric | Value |
|---|---|
| Source files | ${sourceFiles.length} |
| Total lines | ~${totalLines.toLocaleString()} |
| Slash commands | ${COMMANDS.length} |
| Cron tasks | ${TASKS.length} |
| SQLite databases | ${new Set(DB_TABLES.map(t => t.db)).size} |
| Test files | ${files.filter(f => f.startsWith('tests/')).length} |

---

## File Inventory

| File | Description | Lines |
|---|---|---|
${fileRows}

---

## Slash Commands

| Command | Description |
|---|---|
${cmdRows}

---

## Scheduled Tasks (Asia/Tokyo)

| Task | Cron Expression | Description |
|---|---|---|
${taskRows}

---

## Database Schemas

| Database | Table | Primary Key | Other Columns |
|---|---|---|---|
${dbRows}

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
${envRows}

---

## NPM Scripts

| Script | Command |
|---|---|
| \`npm start\` | \`node index.js\` |
| \`npm run dev\` | \`node --watch index.js\` |
| \`npm test\` | \`node --test tests/*.test.js\` |
| \`npm run lint\` | \`eslint .\` |
| \`npm run lint:fix\` | \`eslint . --fix\` |
| \`npm run format\` | \`prettier --write .\` |
| \`npm run format:check\` | \`prettier --check .\` |
| \`npm run deploy-commands\` | \`node deploy-commands.js\` |
| \`npm run update-docs\` | \`node scripts/generateDocs.js\` |

---

## Production Dependencies

| Package | Version | Purpose |
|---|---|---|
| \`discord.js\` | ^14 | Discord API client |
| \`better-sqlite3\` | ^12 | Synchronous SQLite driver |
| \`node-cron\` | ^3 | Cron scheduler |
| \`axios\` | ^1 | HTTP client for uma.moe API |
| \`cheerio\` | ^1 | HTML parsing for scrapers |
| \`playwright-core\` | ^1 | Headless browser for screenshots |
| \`dotenv\` | ^16 | .env loader |
`;
}

// ─── 2. CHANGELOG — fill in missing commits ───────────────────────────────────

function updateChangelog(existing) {
  // Use a safe delimiter (ASCII unit separator \x1f) to avoid conflicts with commit subjects
  const raw = git(['log', '--format=%H\x1f%h\x1f%cd\x1f%s', '--date=format:%Y-%m-%d']);
  const commits = raw.split('\n').filter(Boolean);

  // Build set of hashes already in the changelog
  const covered = new Set();
  for (const m of existing.matchAll(/^## ([0-9a-f]{7,40})/gm)) {
    covered.add(m[1]);
  }
  // Also mark HEAD entries so we don't duplicate
  if (existing.includes('## HEAD')) covered.add('HEAD');

  const newEntries = [];
  for (const line of commits) {
    const parts = line.split('\x1f');
    const fullHash = parts[0] || '';
    const shortHash = parts[1] || '';
    const date = (parts[2] || '').slice(0, 10);
    const subject = parts.slice(3).join(' ');
    if (covered.has(shortHash) || covered.has(fullHash)) continue;

    // Check if any HEAD entry covers this hash
    if ([...covered].some(h => fullHash.startsWith(h))) continue;

    newEntries.push(
      `## ${shortHash} — ${date}\n\n${subject}\n\n*No detailed notes — add them above this line.*\n\n---\n`
    );
  }

  if (newEntries.length === 0) return existing;

  // Insert new entries after the header block (before first ## entry)
  const insertAt = existing.indexOf('\n## ');
  if (insertAt === -1) return existing + '\n' + newEntries.join('\n');

  return (
    existing.slice(0, insertAt + 1) +
    newEntries.join('\n') +
    '\n' +
    existing.slice(insertAt + 1)
  );
}

// ─── 3. README — update project structure section ────────────────────────────

function updateReadme(existing) {
  // The project structure block is between the ``` fences under "## Project structure"
  // We regenerate only that block — all other content is untouched.
  const files = walk(ROOT, ROOT, IGNORE).filter(
    f => f.endsWith('.js') && !f.startsWith('scripts/')
  );

  const dirs = {};
  for (const f of files) {
    const parts = f.split('/');
    const dir = parts.length === 1 ? '(root)' : parts[0];
    if (!dirs[dir]) dirs[dir] = [];
    dirs[dir].push(f);
  }

  const lines = ['.'];
  for (const [dir, dirFiles] of Object.entries(dirs)) {
    if (dir === '(root)') {
      for (const f of dirFiles) lines.push(`├── ${f.split('/').pop()}`);
    } else {
      lines.push(`├── ${dir}/`);
      for (const f of dirFiles) {
        const name = f.split('/').pop();
        const desc = FILE_DESCRIPTIONS[f];
        lines.push(`│   ├── ${name}${desc ? `  # ${desc.slice(0, 60)}` : ''}`);
      }
    }
  }

  const newBlock = '```\n' + lines.join('\n') + '\n```';
  const start = existing.indexOf('## Project structure');
  if (start === -1) return existing;

  const fenceStart = existing.indexOf('```', start);
  if (fenceStart === -1) return existing;

  const fenceEnd = existing.indexOf('```', fenceStart + 3);
  if (fenceEnd === -1) return existing;

  return existing.slice(0, fenceStart) + newBlock + existing.slice(fenceEnd + 3);
}

// ─── 4. Projectnotes — update task table status column ────────────────────────

const TASK_STATUSES = {
  '1': '✅ Done',
  '2': '✅ Done — `core/config.js`, `core/log.js`, `core/store.js`, all new files',
  '3': '✅ Done — `repositories/link/member/stateRepository.js`',
  '4': '✅ Done — `links.json` → `db/linksDb.js` (SQLite); 16 links auto-imported',
  '5': '✅ Done — `links.db` `idx_links_viewer`; `migrations.js` runner wired to all DB inits',
  '6': '✅ Done — `db/migrations.js` reusable runner with `_migrations` tracking table',
  '7': '✅ Done — `core/errors.js`: `safeRun()` + `withRetry()` with exponential back-off',
  '8': '✅ Done — `core/taskRegistry.js` tracks last run, success, consecutive failures for all 25 tasks',
  '9': '✅ Done — `/health` exposes task registry stats, heap/RSS memory, active circle count',
  '10': '✅ Done — `tasks/sqliteBackup.js` at 3:30 AM daily; copies all `*.db`, retains 7 days',
  '11': '✅ Done — `@discordjs/voice`, `ffmpeg-static`, `libsodium-wrappers`, `opusscript` removed',
  '12': '✅ Done — `tests/links.test.js` (7 tests) + `tests/milestone.test.js` (12 tests); 19/19 pass',
};

function updateProjectnotes(existing) {
  let updated = existing;
  for (const [num, status] of Object.entries(TASK_STATUSES)) {
    // Match rows like: | 1 | Add ESLint... | ⬜ Pending | or any existing status
    updated = updated.replace(
      new RegExp(`(\\| ${num} \\| [^|]+ \\| )[^|]+(\\|)`, 'g'),
      `$1${status}$2`
    );
  }
  return updated;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log(DRY ? '\n[dry run] generateDocs.js\n' : '\ngenerateDocs.js — updating docs…\n');

write('UMA_CIRCLE BOT—FULL_REPOSITORY_REPORT.md', generateReport());

const changelog = read('replitchangeslog.md');
write('replitchangeslog.md', updateChangelog(changelog));

const readme = read('README.md');
write('README.md', updateReadme(readme));

const notes = read('replitprojectnotes.md');
write('replitprojectnotes.md', updateProjectnotes(notes));

console.log(DRY ? '\n[dry] done — nothing written\n' : '\nDone.\n');
