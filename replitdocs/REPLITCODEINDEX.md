# REPLITCODEINDEX.md
# Repository Navigation Map

## Purpose
This file is the primary navigation guide for the repository.
It is NOT intended to document every function.
Instead it provides a high-level map to locate files, features,
commands, database tables, and code flows quickly.
Use this file before searching the repository.

---

# FILE LOCATOR

## Commands
Location: commands/
Contains: All 23 registered slash commands (user + admin)
Search Here For: Command logic, permission checks, option parsing

## Event Handlers
Location: handlers/
Contains: ready, interactionCreate, messageCreate,
          guildMemberAdd, presenceUpdate
Search Here For: Discord event responses, message routing,
                 trainer ID paste detection, welcome flow

## Database
Location: db/
Contains: Remaining core SQLite modules (storeDb, trainerDb,
          circleDb, timelineCache) + shim files re-exporting
          modules that moved into feature directories below
Search Here For: Core member/trainer tables, schema updates,
                 migrations runner (db/migrations.js)

## Scheduled Tasks
Location: tasks/
Contains: Remaining cross-cutting cron jobs (dataSync, tally,
          purge/cleanup, greetings, nameLinker, etc.) + shim
          files re-exporting tasks that moved into feature
          directories below
Search Here For: Background automation not tied to a specific
                 feature cluster; tasks/index.js orchestrates all

## Core Services
Location: core/
Contains: config, store (public DB facade), uma.moe API client,
          channel management, format helpers, log, busyLock,
          tokenLoader, tally, taskRegistry, health server
Search Here For: Shared config values, DB access patterns,
                 uma.moe data fetching, channel resolution

## Feature Directories (reorg — files grouped by feature, shims left at old paths)
| Directory       | Contains                                                              |
|-----------------|------------------------------------------------------------------------|
| milestone/      | milestones.js, tiers.js, cleanup.js, winners.js, db.js, eval.js, images.js, notifier.js |
| warnings/       | db.js, engine.js, daily.js, weekly.js, monthly.js, fanDeficitApi.js, imageReport.js |
| leaderboard/    | announcements.js, interCircle.js, snapshotDb.js                       |
| onboarding/     | db.js, reminder.js, handler.js                                        |
| archive/        | chat.js, images.js, db.js, sqliteBackup.js                            |
| achievements/   | db.js, daily.js                                                       |
| attendance/     | db.js, check.js                                                       |
| links/          | db.js, repository.js                                                  |
Search Here For: All logic for a given feature cluster in one place.
Old import paths (e.g. `tasks/milestones.js`, `db/warningDb.js`) still work
via one-line shim files (`export * from '../<dir>/<file>.js'`) — no callers
were broken by this move.

## Timeline
Location: timeline/
Contains: Playwright scraper, scheduler, orchestrator
Search Here For: uma.moe/timeline scraping, event card posting

## Trainer
Location: trainer/
Contains: Playwright screenshotter, result leaderboard manager
Search Here For: Trainer profile screenshots, #result-contribution

## Utilities
Location: utils/
Contains: imageReport (canvas/html-to-image), imageReport-browser
          (Chromium lifecycle), embeds, autoDelete, cardCache,
          characterData, dm, updateLog, changelog, activityLog,
          resumeCard, skillScraper
Search Here For: Image generation, embed builders, DM sending,
                 card data lookup, auto-delete queuing

## Scripts
Location: scripts/
Contains: Standalone manual-run CLI tools (not imported by bot)
Search Here For: One-time migrations, manual post triggers,
                 doc generation, git hook setup

## Scrapers
Location: scrapers/
Contains: Race and racetrack data scrapers
Search Here For: Race data fetching

## Tests
Location: tests/
Contains: Vitest integration tests + helpers using real temp SQLite
Search Here For: Test coverage for DB, milestones, tally, links

## Secrets
Location: secrets/
Contains: token_enc.key (Fernet decryption key, committed to repo)
Search Here For: Token loading chain — see core/tokenLoader.js

---

# COMMAND INDEX

All 23 commands are registered in core/deploy-commands.js.

| Command                 | File                             | Permission    | Purpose                                        |
|-------------------------|----------------------------------|---------------|------------------------------------------------|
| /admin_setjoindate      | commands/admin_setjoindate.js    | ManageGuild   | Manually override a member's circle join date  |
| /admin-sync-cards       | commands/admin_syncCards.js      | Administrator | Sync support card data from gametora.com       |
| /admin_sync             | commands/admin_sync.js           | ManageGuild   | Manually trigger uma.moe data sync             |
| /circle_master          | commands/circle_master.js        | Administrator | Leader admin tools (day override, milestones)  |
| /fan_gain               | commands/fan_gain.js             | None          | Personal fan gain card (daily/weekly/monthly)  |
| /help                   | commands/help.js                 | None          | Interactive command guide                      |
| /intercircleleaderboard | commands/intercircleleaderboard.js | None        | Cross-circle fan gain rankings                 |
| /joindate               | commands/joindate.js             | None          | Show when a member joined the circle           |
| /keep                   | commands/keep.js                 | None          | Pin a trainer ID permanently                   |
| /leaderboard            | commands/leaderboard.js          | None          | Circle-wide top rankings image                 |
| /link                   | commands/link.js                 | None          | Connect Discord account to uma.moe trainer     |
| /search                 | commands/search_trainer.js       | None          | Query trainer database with filters            |
| /set_fans               | commands/set_fans.js             | ManageGuild   | Set fan requirement per circle and scope       |
| /set_quota              | commands/set_quota.js            | ManageGuild   | Set daily/weekly/monthly quota                 |
| /set_timezone           | commands/set_timezone.js         | None          | Set personal timezone                          |
| /status                 | commands/status.js               | None          | Bot health and sync status                     |
| /store                  | commands/store.js                | None          | Manually save trainer ID (in #uma-store only)  |
| /test_milestone         | commands/test_milestone.js       | ManageGuild   | Test-fire a milestone announcement             |
| /timeline_post          | commands/timeline_post.js        | None          | Manually trigger timeline update post          |
| /timeline_setup         | commands/timeline_setup.js       | None          | Configure the timeline channel                 |
| /total_circlefan_gain   | commands/total_circlefan_gain.js | None          | Total fan gain across the whole circle         |
| /total_fan              | commands/total_fan.js            | None          | Total fan count lookup                         |
| /unlink                 | commands/unlink.js               | None          | Disconnect Discord from trainer ID             |

---

# DATABASE INDEX

19 tables across 9 SQLite database files.

| Table                 | File                  | Purpose                                          |
|-----------------------|-----------------------|--------------------------------------------------|
| members               | db/storeDb.js         | Circle member records and fan counts             |
| daily_gains           | db/storeDb.js         | Per-member daily fan gain history                |
| guild_config          | db/storeDb.js         | Per-guild quota and config values                |
| bot_state             | db/storeDb.js         | Key-value persistent state (last sync, etc.)     |
| timezones             | db/storeDb.js         | Per-user timezone preferences                    |
| command_messages      | db/storeDb.js         | Tracks bot replies for timed auto-deletion       |
| links                 | links/db.js           | Discord user ID ↔ uma.moe viewer ID mapping     |
| trainers              | db/trainerDb.js       | Trainer profiles from #uma-store submissions     |
| trainer_skills        | db/trainerDb.js       | Skills associated with each trainer profile      |
| milestone_fired       | milestone/db.js       | Fired milestones with exactly-once send state    |
| special_tier_eligible | milestone/db.js       | Eligible members for 60M/80M/100M special tiers  |
| onboarding            | onboarding/db.js      | New member onboarding and trainer card tracking  |
| attendance            | attendance/db.js      | Daily Discord login records per member           |
| user_streaks          | attendance/db.js      | Consecutive login streak tracking                |
| posted_events         | db/timelineCache.js   | Deduplication for timeline event posts           |
| timeline_state        | db/timelineCache.js   | Timeline scraper run state                       |
| timeline_messages     | db/timelineCache.js   | Discord message IDs for posted timeline cards    |
| image_archive_cursors | archive/db.js         | Per-channel pagination cursors for media archiver|
| image_archive_hashes  | archive/db.js         | SHA-256 hashes of archived media (deduplication) |
| warning_state         | warnings/db.js        | Current fan-warning escalation level per trainer |
| warning_history       | warnings/db.js        | Append-only audit log of warning events          |
| leaderboard_snapshots | leaderboard/snapshotDb.js | Daily leaderboard snapshot per trainer/circle |
| personal_bests        | leaderboard/snapshotDb.js | Best rank/gain per trainer/circle/scope       |
| achievements          | achievements/db.js    | Earned milestone badges per trainer              |

Old `db/*.js` paths for the moved tables (milestoneDb.js, onboardingDb.js,
attendanceDb.js, warningDb.js, leaderboardSnapshotDb.js, linksDb.js,
imageArchiveDb.js, achievementDb.js) still work as shims.

---

# SCHEDULED TASK INDEX

27 tasks registered via `tasks/index.js`. All run in **Asia/Tokyo** timezone unless noted.
Timeline is handled separately by `timeline/timelineScheduler.js`.

## High-Frequency (sub-hourly)

| Task Name | File | Schedule | Purpose |
|---|---|---|---|
| imageArchive | archive/images.js | every 2 min | Preserve one image from Media category channels |
| chatArchiver | archive/chat.js | every 5 min | Move oldest #chat message to #chat-history |
| onboardingReminder | onboarding/reminder.js | every 10 min | DM members who haven't submitted a trainer card |
| dataSync | tasks/dataSync.js | every 30 min (:00, :30) | Fetch uma.moe fan data, update storeDb for all circles |
| milestones | milestone/milestones.js | every 30 min (:05, :35) | Check fan gain milestones, fire announcements + DMs |
| milestoneCleanup | milestone/cleanup.js | every 30 min (:10, :40) | Delete milestone announcement messages older than 24h |

## Hourly

| Task Name | File | Schedule (JST) | Purpose |
|---|---|---|---|
| greetings | tasks/dailyMessages.js | top of every hour | DM noon/night/midnight greetings in each member's local timezone |
| purgeAnnouncement | tasks/purgeAnnouncement.js | top of every hour | Remove human messages + bot messages older than 24h from #announcement |
| nameLinker | tasks/nameLinker.js | every 4 hours | Auto-link Discord members to uma.moe trainer IDs by name match |

## Daily

| Task Name | File | Schedule (JST) | Purpose |
|---|---|---|---|
| updateGameData | tasks/updateGameData.js | 3:00 AM daily | Refresh character/card data from Gametora |
| sqliteBackup | archive/sqliteBackup.js | 3:30 AM daily | Rotate SQLite backups, keep last 7 days |
| messageCleanup | tasks/messageCleanup.js | 4:15 AM daily | Delete bot command replies older than 24h |
| attendanceCheck | attendance/check.js | 6:00 AM daily | Record which members logged into Discord; update streaks |
| dailyWarnings | warnings/daily.js | 7:05 AM daily | Post fan gain warnings to members behind daily quota |
| dailyTop3 | leaderboard/announcements.js | 7:10 AM daily | Post daily top-3 fan gain leaderboard per circle |
| interCircleDaily | leaderboard/interCircle.js | 7:20 AM daily | Post cross-circle daily comparison |
| monthlyWarning | warnings/monthly.js | 8:00 AM daily | Warn members behind 30M monthly goal (fires from day 10+) |
| weeklyWarning | warnings/weekly.js | 8:15 AM daily | Warn members behind 7.5M weekly goal (skips Monday) |
| logsUpdateReport | tasks/logsUpdateReport.js | 8:30 AM daily | Post fan-deficit summary to #logs-update |
| offlineCheck | tasks/offlineCheck.js | 10:00 AM daily | Check for members offline for extended periods |
| interCircleMonthly | leaderboard/interCircle.js | 10:55 PM daily* | Post cross-circle monthly summary (*last day of month only) |
| monthlyTop3 | leaderboard/announcements.js | 11:00 PM daily* | Post monthly top-3 per circle (*last day of month only) |
| tallyResults | tasks/tallyResults.js | 11:30 PM daily* | Post tally results (*boundary days only, checked in-function) |

## Weekly (Monday)

| Task Name | File | Schedule (JST) | Purpose |
|---|---|---|---|
| weeklyHelp | tasks/weeklyAnnouncement.js | Mon 6:00 AM | Post weekly help/guide message |
| weeklyLeaderboard | tasks/weeklyAnnouncement.js | Mon 9:00 AM | Post full weekly leaderboard per circle |
| weeklyTop3 | leaderboard/announcements.js | Mon 9:05 AM | Post weekly top-3 fan gain per circle |
| interCircleWeekly | leaderboard/interCircle.js | Mon 9:15 AM | Post cross-circle weekly comparison |

## Timeline (separate scheduler)

| Task Name | File | Schedule | Purpose |
|---|---|---|---|
| timelineScheduler | timeline/timelineScheduler.js | configurable (default: daily) | Scrape uma.moe/timeline via Playwright, deduplicate + post event cards to #uma-timeline |

---

# FEATURE FLOW MAP

## Token Loading (startup)
start.js
→ core/tokenLoader.js
→ secrets/token_enc.key (Fernet key)
→ GitHub Gist (encrypted service account)
→ Google Drive (encrypted token)
→ process.env.DISCORD_TOKEN
→ index.js (dynamic import)

## Data Sync (every 30 min)
tasks/dataSync.js
→ core/uma.js (fetch circle members + fan counts from uma.moe)
→ db/storeDb.js (upsert members + daily_gains)
→ milestone/milestones.js (trigger milestone checks)

## Milestone Delivery
milestone/milestones.js
→ milestone/db.js (check milestone_fired — exactly-once guard)
→ milestone/images.js (pick image asset from pool)
→ utils/imageReport.js (render announcement card → PNG)
→ announcement channel (post + optional DM to member)

## Fan Gain Command (/fan_gain)
commands/fan_gain.js
→ core/uma.js (getCircleSnapshot — cached)
→ links/db.js (resolve Discord ID → trainer ID)
→ utils/imageReport.js (renderFanGain → PNG)
→ interaction reply (auto-deleted after timeout)

## Trainer Store Flow
handlers/messageCreate.js (detects trainer ID paste in #uma-store)
→ db/trainerDb.js (upsert trainer + skills)
→ utils/skillScraper.js (Playwright → extract skill names)
→ trainer/screenshotter.js (Playwright → profile PNG)
→ trainer/trainerLeaderboard.js (update #result-contribution)

## Timeline Scrape-to-Post
timeline/timelineScheduler.js (cron trigger)
→ timeline/timeline.js (orchestrator)
→ timeline/timelineScraper.js (Playwright → event list)
→ db/timelineCache.js (deduplicate posted events)
→ utils/imageReport.js (render event cards → PNG)
→ #uma-timeline channel (purge old + repost fresh)

## Leaderboard Announcements
leaderboard/announcements.js
→ core/uma.js (getCircleSnapshot — cached)
→ utils/imageReport.js (renderLeaderboard → PNG)
→ core/channels.js (getLeaderboardChannel)
→ utils/dm.js (DM top 3 members)

## Image Rendering Pipeline
utils/imageReport.js (builds HTML template)
→ utils/imageReport-browser.js (Chromium lifecycle — concurrent-launch guard)
→ Playwright page.screenshot() → PNG buffer
→ caller receives buffer → posted to Discord

---

# QUICK SEARCH KEYWORDS

Token loading / bot startup
→ core/tokenLoader.js, start.js, secrets/token_enc.key

Fan gain data / uma.moe API
→ core/uma.js, tasks/dataSync.js

Milestones / milestone images
→ milestone/milestones.js, milestone/tiers.js,
  milestone/images.js, milestone/db.js, milestone_images/

Fan warnings / deficit reports
→ warnings/engine.js, warnings/daily.js, warnings/weekly.js,
  warnings/monthly.js, warnings/db.js, warnings/fanDeficitApi.js

Leaderboard posts
→ leaderboard/announcements.js, leaderboard/interCircle.js,
  leaderboard/snapshotDb.js, commands/leaderboard.js, utils/imageReport.js

Onboarding / new member flow
→ onboarding/db.js, onboarding/reminder.js, onboarding/handler.js

Trainer profiles / #uma-store
→ handlers/messageCreate.js, db/trainerDb.js,
  trainer/screenshotter.js, trainer/trainerLeaderboard.js,
  utils/skillScraper.js

Image / card generation (all PNG rendering)
→ utils/imageReport.js + utils/imageReport-browser.js

Discord ID ↔ Trainer ID mapping
→ links/db.js, links/repository.js, commands/link.js, commands/unlink.js

Channel resolution (find/create channels)
→ core/channels.js, core/channel-utils.js

Slash command registration
→ core/deploy-commands.js

Attendance / streaks
→ attendance/check.js, attendance/db.js

Achievements / badges
→ achievements/db.js, achievements/daily.js

Timeline
→ timeline/, db/timelineCache.js

Scheduled tasks / cron
→ tasks/index.js (all tasks registered here — many implementations
  now live in feature directories, with shim files left at the
  original tasks/*.js and db/*.js paths)

Guild config / quotas
→ db/storeDb.js (guild_config table), core/store.js,
  commands/set_fans.js, commands/set_quota.js

Chat archiving
→ archive/chat.js, archive/images.js, archive/db.js

Database backups
→ archive/sqliteBackup.js

Health check endpoint
→ core/health.js (GET /health, GET /ready on port 8080)

Changelog / update posts
→ utils/changelog.js, utils/updateLog.js, tasks/index.js

Activity logging
→ utils/activityLog.js, handlers/interactionCreate.js

---

# AI INSTRUCTIONS

Before searching the repository:
1. Read REPLITCODEINDEX.md first.
2. Use the File Locator to find the correct directory.
3. Use the Command Index for slash command work.
4. Use the Database Index for any schema-related work.
5. Use the Feature Flow Map to understand multi-file chains.
6. Update this file when a new command, table, task, or
   major workflow is added. Do NOT document every function —
   document where functionality lives.
7. replit.md is the authoritative project spec.
   This file is the navigation map. Both must stay in sync.

Last Updated: 2026-07-08 (feature-directory reorg — milestone/, warnings/, leaderboard/,
onboarding/, archive/, achievements/, attendance/, links/ each hold their own logic;
one-line shim files preserve every old tasks/*.js and db/*.js import path)
