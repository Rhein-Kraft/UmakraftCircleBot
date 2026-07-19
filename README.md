# Uma Circle Bot

A Discord bot for managing the **UmaKraft** Uma Musume circle (uma.moe circle ID `974470619`).
It reads live data from `uma.moe`, tracks daily/weekly/monthly fan gains, posts
leaderboards and milestone messages, automatically excludes members who have left the circle,
maintains a trainer database with card resume images, and syncs Uma Musume event timelines.

The project runs on plain Node.js (ES modules) with no build step and is configured to
deploy to **Railway** with zero extra setup.

## One-command run

```bash
npm install
npm start
```

No build step, no monorepo, no TypeScript compilation.

---

## Features

### Slash commands

| Command | What it does |
|---|---|
| `/fan_gain` | Daily, weekly, and monthly fan gain plus daily ranking |
| `/leaderboard` | Top 10–30 daily/weekly/monthly leaderboard, resets monthly, marks new members |
| `/total_fan` | Lifetime total fan count and circle rank |
| `/total_circlefan_gain` | Total accumulated fan gain of the entire circle |
| `/circle_master` | Day-by-day Top 3 contributors for the current month |
| `/link` | Manually link a Discord account to a Uma.moe trainer name |
| `/unlink` | Remove a Discord ↔ Uma.moe link |
| `/store` | Save or retrieve your trainer ID in the bot database |
| `/search_trainer` | Look up a trainer by name or ID |
| `/keep` | Mark your trainer card as permanently kept in the database |
| `/joindate` | Show when you joined the circle |
| `/set_timezone` | Set your personal timezone for greeting messages |
| `/set_quota` | Set fan quota targets for this server (admin only) |
| `/set_fans` | Set the fan requirement for a specific circle and time period — daily/weekly/monthly (admin only) |
| `/timeline_setup` | Configure which channel receives Uma Musume event timeline updates |
| `/timeline_post` | Manually trigger a timeline post |
| `/admin_sync` | Force an immediate data sync from uma.moe (admin only) |
| `/admin_setjoindate` | Manually override a member's join date (admin only) |
| `/admin_syncCards` | Trigger a trainer card image sync (admin only) |
| `/test_milestone` | Preview a milestone message without posting it — supports all tiers including 80M and 100M special (admin only) |
| `/help` | List all bot commands |

### Automatic behavior

- **Pulls fresh uma.moe data every 30 minutes** — fan gains, rankings, and circle membership are kept in sync; members who leave the circle are removed automatically.
- **Welcome message + DM to the server owner** when a new Discord member joins.
- **`NEW MEMBER` tag** on the leaderboard during the same month a member joined.
- **First-day-zero rule** — a new member's first day of contribution counts as `0`. Tracking starts the next day.
- **Milestone messages** at 10M / 20M / 30M / 40M monthly fans with character-voiced messages (7 random variants each), plus **special tiers at 60M / 80M / 100M** restricted to the first 3 qualifying members per circle per month (random draw if more than 3 qualify; each circle has independent slots).
- **Daily warnings** for trainers below their daily target, with personalised DMs.
- **Monthly 30M goal warning** — posted when the tally period is running short and the circle is behind.
- **Daily fan-deficit log** in `#logs-update` — shows each member's gap vs. their daily target.
- **Daily greetings** at noon and midnight in each member's local timezone.
- **Daily / weekly / monthly leaderboard posts** (Top 3 highlights + full leaderboard).
- **Tally results** posted on day 7, 14, 21 and the last day of the month.
- **High-gain hype replies** when a linked trainer gains 2M / 3M / 5M / 7M+ fans in one day.
- **Attendance tracking** — daily 6:00 AM check records who has gained fans that day.
- **Offline member check** — daily 10:00 AM check sends DMs to members who haven't been active.
- **Onboarding reminders** — members who joined after May 12 2026 receive periodic DM reminders to submit their trainer card if they haven't yet.
- **Auto-linking** between Discord names and Uma.moe trainer names. First pass runs 24h after startup, then every 4h.
- **Uma Musume event timeline** — scrapes the official timeline every 5 minutes and posts updates to `#uma-timeline`.
- **Image archiver** — preserves images from the server's Media category into `#image-archive`.
- **Chat archiver** — moves the oldest `#chat` messages into `#chat-history` every 5 minutes.
- **Auto-creates** `#uma-timeline`, `#leaderboard`, `#uma-store`, `#uma-results`, `#logs-update` if they don't exist.
- **Daily message cleanup** — bot's own slash-command replies older than 24h are deleted.
- **Changelog on restart** — posts a summary of what changed to `#logs-update` when the bot updates.
- **Crash-resistant** — slash command failures are reported back to the user without taking the bot down.

---

## Project structure

```
.
├── commands/
│   ├── admin_setjoindate.js  # /admin_setjoindate — override a member's join date
│   ├── admin_sync.js  # /admin_sync — force immediate uma.moe data sync
│   ├── admin_syncCards.js  # /admin_syncCards — sync trainer card images from Gametora
│   ├── circle_master.js  # /circle_master — daily Top 3 contributors this month
│   ├── fan_gain.js  # /fan_gain — personal daily/weekly/monthly fan gain + rank
│   ├── help.js  # /help — list all bot commands
│   ├── joindate.js  # /joindate — when did this member join the circle
│   ├── keep.js  # /keep — mark a trainer card as permanently kept
│   ├── leaderboard.js  # /leaderboard — fan-gain rankings daily/weekly/monthly
│   ├── link.js  # /link — manually link Discord to uma.moe trainer name
│   ├── search_trainer.js  # /search_trainer — look up a trainer by name or ID
│   ├── set_fans.js  # /set_fans — set per-circle fan requirements (admin)
│   ├── set_quota.js  # /set_quota — set server-wide fan quota targets (admin)
│   ├── set_timezone.js  # /set_timezone — set personal timezone for greetings
│   ├── store.js  # /store — save a trainer profile to the database
│   ├── test_milestone.js  # /test_milestone — preview a milestone message (admin)
│   ├── timeline_post.js  # /timeline_post — manually trigger a timeline fetch (admin)
│   ├── timeline_setup.js  # /timeline_setup — configure #uma-timeline channel (admin)
│   ├── total_circlefan_gain.js  # /total_circlefan_gain — circle's total monthly fan gain
│   ├── total_fan.js  # /total_fan — lifetime total fan count and circle rank
│   ├── unlink.js  # /unlink — remove Discord ↔ trainer link
├── core/
│   ├── busyLock.js  # Global notification lock preventing concurrent bulk posting 
│   ├── channel-utils.js
│   ├── channels.js  # Auto-create and find Discord channels by name/type
│   ├── config.js  # Reads env vars into a frozen config object (// @ts-check + J
│   ├── deploy-commands.js  # REST slash-command registration with Discord API
│   ├── errors.js  # safeRun() and withRetry() — centralized async error handling
│   ├── format.js  # Number and date formatting utilities
│   ├── health.js  # HTTP health-check server with task stats, memory, and sync s
│   ├── log.js  # Leveled logger: debug/info/warn/error with ISO timestamp pre
│   ├── store.js  # JSON flat-file persistence; link ops delegate to SQLite via 
│   ├── tally.js  # Tally-period boundary helpers (day 7, 14, 21, month-end)
│   ├── taskRegistry.js  # In-memory registry tracking every scheduled cron task
│   ├── uma.js  # uma.moe v4 API client — fan-gain math, snapshot cache, rate-
├── db/
│   ├── migrations.js  # Reusable migration runner for any better-sqlite3 database
│   ├── storeDb.js
│   ├── timelineCache.js  # SQLite — timeline event dedup and message tracking
│   ├── trainerDb.js  # SQLite — trainer profiles, card images, and skill data
│   ├── *.js  # Shim files re-exporting modules moved into feature directories below
│                (attendanceDb.js, imageArchiveDb.js, linksDb.js, milestoneDb.js,
│                 onboardingDb.js, warningDb.js, achievementDb.js, leaderboardSnapshotDb.js)
├── attendance/
│   ├── db.js  # SQLite — daily attendance records and streak tracking per circle
│   ├── check.js  # Cron 6:00 AM — record daily attendance per circle
├── links/
│   ├── db.js  # SQLite — Discord ↔ uma.moe trainer ID links
│   ├── repository.js  # Repository API for Discord ↔ viewer links
├── milestone/
│   ├── db.js  # SQLite — milestone dedup state with per-circle multi-send flags
│   ├── milestones.js  # Cron 5,35 min — check and fire milestone messages per circle
│   ├── tiers.js  # Milestone tier definitions and thresholds
│   ├── cleanup.js  # Cron */30 min — remove expired milestone announcement messages
│   ├── winners.js  # Special-tier (60M/80M/100M) random-draw winner selection
│   ├── eval.js  # Threshold evaluation helpers
│   ├── images.js  # Loads and pools milestone image assets from disk
│   ├── notifier.js  # Builds and sends milestone announcements + DMs
├── onboarding/
│   ├── db.js  # SQLite — trainer card onboarding status and reminder history
│   ├── reminder.js  # Cron */10 min — trainer card submission reminders via DM
│   ├── handler.js  # New member onboarding flow logic
├── archive/
│   ├── db.js  # SQLite — image archive cursors and dedup hashes
│   ├── chat.js  # Cron */5 min — move old #chat messages to #chat-history
│   ├── images.js  # Cron */2 min — archive media channel images to #image-archive
│   ├── sqliteBackup.js  # Cron 3:30 AM — daily backup of all *.db files (7-day retention)
├── achievements/
│   ├── db.js  # SQLite — earned milestone badges per trainer
│   ├── daily.js  # Daily achievement processing
├── warnings/
│   ├── db.js  # SQLite — fan-warning escalation state and history
│   ├── engine.js  # Shared warning evaluation logic
│   ├── daily.js  # Cron 7:05 AM — fan-deficit DMs for members below daily target
│   ├── weekly.js  # Cron 8:15 AM — 7.5M weekly goal warning (skips Monday)
│   ├── monthly.js  # Cron 8:00 AM — 30M monthly goal progress warning
│   ├── fanDeficitApi.js  # Shared fan-deficit calculation API
│   ├── imageReport.js  # Fan-deficit report image rendering
├── leaderboard/
│   ├── snapshotDb.js  # SQLite — leaderboard snapshots and personal bests
│   ├── announcements.js  # Cron — daily/weekly/monthly Top 3 leaderboard posts
│   ├── interCircle.js  # Cron — cross-circle daily/weekly/monthly comparisons
├── eslint.config.js
├── index.js
├── handlers/
│   ├── guildMemberAdd.js  # Discord event — new member welcome message + DM
│   ├── interactionCreate.js  # Discord event — slash command and button routing
│   ├── messageCreate.js  # Discord event — hype reactions, trainer ID auto-detection
│   ├── presenceUpdate.js  # Discord event — timezone-aware morning greetings
│   ├── ready.js  # Discord event — post-login slash command registration
├── tasks/
│   ├── dailyMessages.js  # Cron hourly — timezone-aware greetings (noon/night/midnight)
│   ├── dataSync.js  # Cron */30 min — pull fresh circle data from uma.moe
│   ├── index.js  # Registers all cron schedules and startup tasks
│   ├── logsUpdateReport.js  # Cron 8:30 AM — fan-deficit report in #logs-update
│   ├── messageCleanup.js  # Cron 4:15 AM — delete bot command replies older than 24h
│   ├── nameLinker.js  # Cron */4 h — auto-link Discord names to uma.moe trainer name
│   ├── offlineCheck.js  # Cron 10:00 AM — DM members who haven't been active
│   ├── purgeAnnouncement.js  # Cron hourly — clean old posts from #announcement
│   ├── purgeUmaStore.js  # On boot — clear legacy messages from #uma-store
│   ├── tallyResults.js  # Cron — post tally results on days 7, 14, 21, and month-end
│   ├── updateGameData.js  # Cron 3:00 AM — refresh character/game data from Gametora
│   ├── weeklyAnnouncement.js  # Cron Monday 9:00 AM — weekly leaderboard + help post
│   ├── *.js  # Shim files re-exporting tasks moved into feature directories above
├── tests/
│   ├── links.test.js  # Integration tests for links/db.js (7 tests)
│   ├── milestone.test.js  # Unit tests for milestone tier logic and winner draw (12 test
│   ├── smoke.js
├── timeline/
│   ├── timeline.js  # Orchestrates timeline fetching, diffing, and Discord posting
│   ├── timelineScheduler.js  # 5-minute cron driver for the timeline scraper
│   ├── timelineScraper.js  # Scrapes the official Uma Musume timeline page via Playwright
├── trainer/
│   ├── screenshotter.js  # Headless Playwright screenshotter for trainer card images
│   ├── trainerLeaderboard.js  # Persistent trainer leaderboard embed management
├── utils/
│   ├── activityLog.js  # Logs slash command usage to #logs-update
│   ├── autoDelete.js  # Schedules automatic message self-deletion
│   ├── cardCache.js  # In-memory cache for support card image data
│   ├── changelog.js  # Reads CHANGELOG.md and posts matching entry to #logs-update 
│   ├── characterData.js  # Uma Musume character name and ID lookup table
│   ├── dm.js  # Safe DM delivery wrapper with error handling
│   ├── imageReport-browser.js
│   ├── imageReport.js  # Generates rich graphical fan-gain report card images
│   ├── resumeCard.js  # Builds trainer resume card embeds with stats and skills
│   ├── skillScraper.js  # Scrapes skill data for trainers from uma.moe trainer pages
│   ├── updateLog.js  # Formats and posts system status updates to #logs-update
```

---

## Setup

### 1. Create a Discord application

1. Go to https://discord.com/developers/applications and create an application.
2. Open the **Bot** page, reset the token, and copy it (`DISCORD_BOT_TOKEN`).
3. Copy the **Application ID** from the General Information page (`DISCORD_CLIENT_ID`, optional).
4. Under **Bot → Privileged Gateway Intents**, enable:
   - **Server Members Intent**
   - **Message Content Intent**
   - **Presence Intent**
5. Under **OAuth2 → URL Generator**, select scopes `bot` and `applications.commands`,
   then permissions: `Send Messages`, `Manage Messages`, `Manage Channels`, `Embed Links`,
   `Attach Files`, `Read Message History`, `View Channels`. Open the generated URL and
   add the bot to your server.

### 2. Run locally

```bash
cp .env.example .env    # fill in DISCORD_BOT_TOKEN (and optionally GUILD_ID)
npm install
npm start
```

Slash commands register automatically on boot. With `GUILD_ID` set they appear instantly;
without it they register globally (up to 1 hour to propagate).

### 3. Deploy to Railway

1. Push this repository to GitHub.
2. On Railway: **New Project → Deploy from GitHub repo** → pick this repo.
3. In **Variables**, set:
   - `DISCORD_BOT_TOKEN` *(required)*
   - `DISCORD_CLIENT_ID`, `CIRCLE_ID`, `GUILD_ID`, `TIMEZONE` *(optional)*
4. Attach a **Volume** mounted at `/data` and set `DATA_DIR=/data` so state survives redeploys.

Railway picks up `railway.json` + `nixpacks.toml`, runs `npm ci`, and starts with `node index.js`.

---

## Configuration reference

| Variable | Default | Purpose |
|---|---|---|
| `DISCORD_BOT_TOKEN` | *(required)* | Discord bot token |
| `DISCORD_CLIENT_ID` | *(empty)* | Bot self-detects after login if omitted |
| `CIRCLE_ID` | `974470619` | uma.moe circle to track |
| `GUILD_ID` | *(empty)* | If set, slash commands register to this guild only (instant) |
| `ANNOUNCEMENT_CHANNEL` | `announcement` | Channel for greetings, milestones, leaderboards |
| `DATA_DIR` | `./data` | Where JSON + SQLite state files are written |
| `TIMEZONE` | `Asia/Tokyo` | Cron schedule timezone |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |

---

## How fan-gain math works

`uma.moe`'s `/api/v4/circles?circle_id=<id>` returns each member's `daily_fans` array —
a snapshot of their **lifetime** total fans at the end of each day in the current month. The bot:

1. Computes per-day deltas: `gain[d] = daily_fans[d] - daily_fans[d-1]`.
2. For day 1, fetches the previous month's final value (cached for 1 hour) so the first day's gain is accurate.
3. Zeroes out the join-day delta for new members (the "first day = 0" rule).
4. Sums deltas to produce daily / weekly (last 7 days) / monthly totals.
5. Detects "left the circle" by checking whether each member's `daily_fans` value is still updating.

---

## Modernization Roadmap

The bot is being incrementally modernized — no full rewrites, no behavior changes, backward compatibility preserved throughout. Each task is isolated and applied one at a time.

**Guiding principles:**
- Do not rewrite the entire project at once
- Do not change runtime behavior unless explicitly requested
- Do not remove existing protections (dedup systems, retry logic, busy locks)
- Preserve backward compatibility at every step

**Priority tasks:**

- [x] 1. Add ESLint + Prettier configuration
- [x] 2. Add JSDoc typing with `// @ts-check` — `core/config.js`, `core/log.js`, `core/store.js`, all new files
- [x] 3. Create repository abstraction layer — `repositories/linkRepository.js`, `memberRepository.js`, `stateRepository.js`
- [x] 4. Migrate `links.json` → SQLite — `db/linksDb.js` with auto-import on first boot; `store.js` delegates transparently
- [x] 5. SQLite schema indexing — `links.db` `idx_links_viewer`; `migrations.js` runner wired to all DB inits
- [x] 6. Database migration system — `db/migrations.js` reusable runner, `_migrations` table per DB
- [x] 7. Centralize async error handling — `core/errors.js`: `safeRun()`, `withRetry()` with exponential backoff
- [x] 8. Task/job registry — `core/taskRegistry.js` tracks last run, success/failure, consecutive failures for all 25 tasks
- [x] 9. Health endpoint improvements — `/health` now exposes task registry stats, heap/RSS memory, active circle count
- [x] 10. Automated SQLite backup — `tasks/sqliteBackup.js` runs at 3:30 AM, copies all `*.db` files, keeps last 7 days
- [x] 11. Remove unused dependencies — `@discordjs/voice`, `ffmpeg-static`, `libsodium-wrappers`, `opusscript` uninstalled (0 import references found)
- [x] 12. Integration tests — `tests/links.test.js` (7 tests), `tests/milestone.test.js` (12 tests); `npm test` — 19/19 pass
- [x] 13. UmaMoe pipeline — spec docs and implementation plan (`umamoe/` directory, `docs/UMAMOE_IMPLEMENTATION_PLAN.md`); no code changes
- [ ] 14. UmaMoe Miner — `umamoe/Miner/miner.js`; migrates HTTP fetch + rate-limit logic from `core/umaClient.js` + `core/umaQueue.js`
- [ ] 15. UmaMoe Courier — `umamoe/Courier/courier.js`; thin transport layer between Miner and Inspector
- [ ] 16. UmaMoe Inspector — `umamoe/Inspector/inspector.js`; validates structure, types, completeness, ranges per `VALIDATION_RULES.md`
- [ ] 17. UmaMoe Vault — `umamoe/Vault/vault.js` + SQLite adapter; replaces `core/umaCache.js` with persistent, validated storage
- [ ] 18. Wire pipeline — update `core/uma.js` to call Miner → Courier → Inspector → Vault; downstream consumers unchanged

---

## License

MIT
