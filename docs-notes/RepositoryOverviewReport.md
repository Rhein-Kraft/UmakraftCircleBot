═══════════════════════════════════════════════════════════════════
              UMA CIRCLE BOT — REPOSITORY OVERVIEW REPORT
═══════════════════════════════════════════════════════════════════

SUMMARY
───────
UMA Circle Bot is a production-grade Discord management and analytics
bot purpose-built for the UmaKraft Uma Musume Pretty Derby circle on
uma.moe. It automates the full lifecycle of circle management: data
ingestion, fan-gain tracking, milestone rewards, member onboarding,
leaderboard publishing, timeline news, and moderation — all driven by
a scheduler that runs 25+ cron jobs across two circles simultaneously.

Built on Node.js 20 + discord.js v14, it uses SQLite (better-sqlite3)
for all persistence, Playwright/Puppeteer for headless image rendering,
and node-cron for task scheduling. All outputs are PNG image cards
rather than text embeds — giving the bot a consistent, high-quality
visual identity.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Runtime       Node.js 20+, ES Modules
  Discord       discord.js v14
  Scheduling    node-cron (Asia/Tokyo timezone)
  Persistence   better-sqlite3 (8 separate SQLite databases)
  Rendering     Playwright-core + Puppeteer (headless Chromium)
  HTTP          Axios + Cheerio (fallback scraper)
  Deployment    Railway (Dockerfile + volume) / Replit (workflow)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SLASH COMMANDS (22)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ANALYTICS
  /fan_gain               Personal daily/weekly/monthly fan gain card
  /leaderboard            Circle fan-gain rankings (scoped, paginated)
  /intercircleleaderboard Unified cross-circle rankings (all circles)
  /total_fan              Lifetime fan total and rank for a trainer
  /total_circlefan_gain   Aggregated circle-wide daily gain summary
  /circle_master          Monthly Top 3 history for a circle

  MEMBER MANAGEMENT
  /link                   Link Discord ID to uma.moe Viewer ID
  /unlink                 Remove Discord ↔ Viewer ID mapping
  /joindate               Look up a member's recorded join date
  /admin_setjoindate      Admin override for a member's join date

  SEARCH & CARDS
  /search_trainer         Search uma.moe profiles (stats, skills,
                          inheritance, trophies) — rendered as PNG
  /store                  Uma Musume dress/card detail lookup
  /keep                   Pin a search result to prevent auto-deletion

  TIMELINE & NEWS
  /timeline_setup         Configure the #uma-timeline news channel
  /timeline_post          Manually trigger a timeline refresh

  CONFIGURATION
  /set_timezone           Set a member's local timezone for greetings
  /set_quota              Set fan quota overrides for the main circle
  /set_fans               Set daily/weekly/monthly quotas per circle

  ADMIN TOOLS
  /admin_sync             Force immediate data sync for a circle
  /admin_syncCards        Manually refresh the card/character cache
  /test_milestone         Simulate a milestone fire (testing only)
  /help                   Command documentation and usage guide

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCHEDULED TASKS (25 ACTIVE CRON JOBS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  EVERY 2 MINUTES
  imageArchive            Preserves images from Media category channels
                          into #image-archive

  EVERY 5 MINUTES
  chatArchiver            Moves oldest #chat messages to #chat-history
                          for long-term archiving

  EVERY 10 MINUTES
  onboardingReminder      DMs new members (joined after 2026-05-12)
                          who haven't submitted trainer cards yet

  EVERY 30 MINUTES
  dataSync                Fetches fresh fan counts from uma.moe API
                          for all configured circles (parallel)

  :05 and :35 PAST THE HOUR
  milestones              Detects fan milestones (10M/20M/30M/40M
                          standard; 60M/80M/100M special with image
                          cards and 3-slot monthly pool per circle)
  milestoneCleanup        Deletes milestone messages older than 24h

  HOURLY (top of hour)
  greetings               Sends localized noon/night/midnight DMs to
                          members based on their timezone setting
  purgeAnnouncement       Removes human messages and old bot posts
                          from #announcement (keeps channel clean)

  DAILY 06:00
  attendanceCheck         Records Discord presence and calculates
                          login streaks per circle (JST-based)

  DAILY 06:00 MONDAY
  weeklyHelp              Posts weekly help/quota reminder message

  DAILY 07:05
  dailyWarnings           DMs members below daily fan quota; posts
                          deficit report to #urgent-warning

  DAILY 07:10
  dailyTop3               Posts per-circle daily leaderboard image
                          to #leaderboard; DMs top 3 trainers

  DAILY 07:20
  interCircleDaily        Posts unified cross-circle daily leaderboard
                          to #announcement

  DAILY 08:00
  monthlyWarning          Flags members at risk of failing monthly
                          quota (fires when day-of-month ≥ 10)

  DAILY 08:30
  logsUpdateReport        Posts fan-deficit summary to #urgent-warning

  DAILY 10:00
  offlineCheck            Identifies and flags members who have gone
                          offline / left the circle

  MONDAY 09:00
  weeklyLeaderboard       Posts per-circle weekly leaderboard image

  MONDAY 09:05
  weeklyTop3              Posts per-circle weekly Top 3 with DMs

  MONDAY 09:15
  interCircleWeekly       Posts unified cross-circle weekly leaderboard
                          to #announcement

  DAILY 22:55 (LAST DAY OF MONTH)
  interCircleMonthly      Posts cross-circle monthly leaderboard before
                          tally period ends

  DAILY 23:00 (LAST DAY OF MONTH)
  monthlyTop3             Posts per-circle monthly Top 3 with DMs

  DAILY 23:30
  tallyResults            Checks tally boundary and posts weekly
                          results when the tally period resets

  EVERY 4 HOURS
  nameLinker              Resolves uma.moe display names to Discord
                          usernames and keeps links fresh

  DAILY 03:00
  updateGameData          Scrapes Gametora/Wiki for character and
                          card data; updates local card cache

  DAILY 03:30
  sqliteBackup            Backs up all 8 SQLite databases; retains
                          last 7 days of daily backups

  EVERY 24 HOURS
  timelineScheduler       Scrapes uma.moe/timeline; purges and
  (+ 1-min countdown)     reposts #uma-timeline with active event
                          cards. Countdown refresh runs every minute.
                          Restart protection: skips if last run was
                          < 10 min ago (SQLite-persisted guard).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATABASE LAYER (8 SQLite FILES)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  store.db          Core hub. Tables: members, daily_gains,
                    guild_config (JSON settings per guild),
                    bot_state (KV flags).
                    Uses upsert+prune for member sync (no full
                    delete/reinsert churn).

  milestones.db     Milestone delivery tracking. PK:
                    (viewer_id, tier_key, month, circle_id).
                    Tracks channel_sent, dm_member_sent, etc.
                    Atomic INSERT OR IGNORE prevents duplicate
                    announcements across restarts.

  attendance.db     Daily presence records and login streaks,
                    scoped by circle_id.

  links.db          Discord ID → Viewer ID mapping (1-to-1).

  trainers.db       Persistent profile/skills cache for
                    /search_trainer results.

  onboarding.db     Enrollment state for members who joined
                    after 2026-05-12. Composite index on
                    (card_provided, joined_at) for fast
                    reminder queries.

  timeline.db       Posted event dedup (posted_events),
                    active message tracking (timeline_messages),
                    KV state (timeline_state). Survives restarts.

  imageArchive.db   Tracks which media messages have been
                    archived to prevent re-archiving.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORE SYSTEMS & KEY DESIGN DECISIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  IMAGE-ONLY OUTPUT
  All reports, leaderboards, and milestone cards are rendered as
  PNG images via headless Chromium (Playwright). No plain-text
  embeds are used for data outputs. This gives a consistent,
  branded visual identity across all announcements.

  ANALYTICS ENGINE (core/uma.js)
  Raw uma.moe data is cumulative fan counts, not deltas. The
  engine converts these to "Real Gain" by detecting and filtering
  registration spikes (30M+ single-day jumps), zeroing join-day
  gains, and computing daily/weekly/monthly deltas properly.

  MULTI-CIRCLE ARCHITECTURE
  Configured via CIRCLE_ID + CIRCLE_2_ID env vars. Every
  analytics task runs both circles in parallel (Promise.all).
  The new /intercircleleaderboard command merges both pools into
  a single unified ranking with per-circle colored badges.

  MILESTONE SYSTEM
  Four tiers of standard milestones (10M/20M/30M/40M) with 7
  randomized message variants each. Three special tiers (60M/
  80M/100M) with unique image pools, gated to top-3 per circle
  per month via a 3-slot atomic claiming system. Both circles
  have independent slot pools (up to 6 recipients per tier/month
  across the full server).

  ANTI-SPAM & RESILIENCE
  - In-flight promise deduplication on API fetches (prevents
    race conditions on simultaneous requests)
  - All milestone claims use INSERT OR IGNORE (atomic, no dupes)
  - Dedup-by-date guards on every auto-post task (date string
    stored in SQLite via store.getState)
  - _mediaNotified Map bounded at 200 entries (memory leak fix)
  - Playwright concurrency limited to 3 simultaneous pages

  CHANNEL SELF-HEALING
  On every boot, the bot ensures required channels exist and
  have correct permissions, auto-creating them if missing.
  Channels are identified by name or cached ID; permission
  overwrites are re-applied if they drift.

  HEALTH & OBSERVABILITY
  An HTTP server on port 8080 serves GET /health. The task
  registry tracks last run time, success/failure, and elapsed
  duration for every scheduled job.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROJECT LAYOUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  index.js              Entry point
  core/                 config, log, store, uma, format, tally,
                        channels, milestoneImages, health,
                        deploy-commands, busyLock, taskRegistry
  db/                   trainerDb, milestoneDb, onboardingDb,
                        attendanceDb, timelineCache, storeDb
  timeline/             timeline, timelineScheduler, timelineScraper
  trainer/              trainerLeaderboard, screenshotter (Playwright)
  commands/             22 slash command modules
  handlers/             ready, interactionCreate, messageCreate,
                        guildMemberAdd, presenceUpdate
  tasks/                25 cron job modules
  utils/                imageReport, imageReport-browser, cardCache,
                        embeds, dm, autoDelete, activityLog,
                        updateLog, changelog, characterData
  scrapers/             race and racetrack data scrapers
  data/                 runtime SQLite files (gitignored)
  attached_assets/      Falco pool milestone images
  milestone_images/     Special-tier milestone images (e.g. 60M)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEPLOYMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Railway   Dockerfile + railway.json. Attach a Volume at /data
            with DATA_DIR=/data to persist all 8 SQLite databases
            across deploys. Set DISCORD_TOKEN as env var.

  Replit    "Discord Bot" workflow runs node index.js.
            DISCORD_TOKEN stored as a Replit Secret.
            All other config via [userenv.shared] in .replit.

  Required env vars:
    DISCORD_TOKEN         Bot token (required)
    CIRCLE_ID             uma.moe circle ID (default: 974470619)
    GUILD_ID              Discord server ID
    DISCORD_CLIENT_ID     Application ID
    CIRCLE_2_ID           Second circle ID (optional)
    CIRCLE_2_NAME         Second circle display name (optional)
    TIMEZONE              Default: Asia/Tokyo
    DATA_DIR              SQLite storage path (default: ./data)
    LOG_LEVEL             info / debug / warn (default: info)
    TIMELINE_URL          Timeline scrape URL
    TIMELINE_UPDATE_INTERVAL  Minutes between scrapes (default: 1440)

═══════════════════════════════════════════════════════════════════
