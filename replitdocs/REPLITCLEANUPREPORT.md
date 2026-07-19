# REPLITCLEANUPREPORT.md
# Repository Cleanup & Health Report

## Purpose
This file tracks potential inefficiencies, unused code, duplication
risks, and performance-heavy modules.

It is NOT a strict truth source — it is a candidate analysis report.

Because this is an event-driven system (Discord bot + schedulers +
scrapers), many modules may appear unused but are actually triggered
indirectly.

---

# ⚠️ IMPORTANT CONTEXT (READ FIRST)

This codebase includes:
- Discord event-driven handlers (not directly called)
- Scheduled cron tasks (triggered by scheduler, not imports)
- Manual scripts (run via CLI, not imported by the bot)
- Playwright-based scrapers (run on demand)
- Dynamic task registry loading

👉 Therefore: "Not imported" ≠ "unused"

---

# UNUSED OR ORPHANED FILES (CANDIDATES ONLY)

Files listed here are NOT confirmed unused — only not statically
referenced. Verify before removing.

## scripts/ — Manual Execution Tools (NOT ORPHANS)

These are intentionally standalone CLI utilities. The bot never
imports them. They are run manually by the owner.

| File                        | Purpose                              | Status         |
|-----------------------------|--------------------------------------|----------------|
| scripts/generateDocs.js     | Documentation generator              | KEEP (manual)  |
| scripts/postQolTimeline.js  | One-time timeline post tool          | KEEP (manual)  |
| scripts/postUpdate.js       | Manual update post trigger           | KEEP (manual)  |
| scripts/install-hooks.js    | Git hook installer                   | KEEP (manual)  |
| scripts/setCircle2Quotas.js | One-time circle 2 quota migration    | VERIFY — may have already been run. Safe to remove if circle 2 quotas are confirmed set. |
| scripts/scrapeCards.js      | Card data scraper                    | ACTIVE — imported by commands/admin_syncCards.js |

## utils/ — Verified Status

| File                          | Imported By              | Status                      |
|-------------------------------|--------------------------|-----------------------------|
| utils/imageReport-browser.js  | utils/imageReport.js     | ACTIVE — Chromium lifecycle manager for all PNG rendering |
| utils/skillScraper.js         | commands/store.js        | ACTIVE — extracts skill names during trainer store flow |
| utils/resumeCard.js           | Nothing found            | CANDIDATE ORPHAN — builds trainer resume embed; no current caller detected. Verify before removing. |

---

# POSSIBLE DUPLICATE OR LEGACY LOGIC

| Module A | Module B | Notes                                   |
|----------|----------|-----------------------------------------|
| (none detected) |   | Codebase is modular and well separated  |

---

# HEAVY / PERFORMANCE-IMPACTING MODULES

| File                        | Reason                                    | Recommendation                           |
|-----------------------------|-------------------------------------------|------------------------------------------|
| trainer/screenshotter.js    | Playwright rendering (high CPU + memory)  | Lazy-load browser; cache output by trainer ID |
| timeline/timelineScraper.js | Frequent scraping + browser automation    | Batch execution; throttle if scrape errors spike |
| utils/imageReport-browser.js| Shared Chromium instance for all PNG jobs | Already has concurrent-launch guard — monitor memory under load |
| core/uma.js                 | External API dependency (uma.moe)         | Snapshot cache already exists — verify TTL is appropriate for sync frequency |

---

# LEGACY OR DEPRECATED CODE

| File                        | Status                    | Notes                                                |
|-----------------------------|---------------------------|------------------------------------------------------|
| scripts/setCircle2Quotas.js | One-time migration script | Likely already executed. Verify quotas are set, then remove. |
| utils/resumeCard.js         | No callers found          | May be leftover from a removed feature. Check git history before deleting. |

---

# COMMAND REGISTRATION STATUS ✅

All 23 command files in commands/ are confirmed registered in
core/deploy-commands.js and loaded by the bot at startup.

No unregistered or orphaned command files detected.

Note: replit.md only documents 13 commands — it is outdated.
REPLITCODEINDEX.md has the authoritative list of all 23.

---

# LOW USAGE FEATURES (UNVERIFIED WITHOUT TELEMETRY)

Cannot be reliably determined without runtime logging.
Do not guess — guesses become stale facts.

Recommendation: add lightweight usage tracking per command and
scheduled task. Store execution counts in the bot_state table
or a dedicated activity table. utils/activityLog.js already
exists and is wired to interactionCreate — extend from there.

---

# NPM DEPENDENCY CLEANUP

Run periodically:

```bash
npm audit
npx depcheck
```

Check for:
- Unused packages
- Duplicated functionality
- Outdated dependencies with security advisories

---

# CIRCULAR DEPENDENCY CHECK

No circular imports detected at architecture level.
Risk level: LOW

ES module structure is clean and unidirectional:
  handlers → core → db (no reverse dependencies)

---

# RUNTIME ACTIVITY (UNVERIFIED — NO TELEMETRY YET)

Static analysis only. The following are architectural facts,
not usage frequency measurements.

## Confirmed Active Systems (by import graph)

### Scheduled Tasks (all registered in tasks/index.js)
- tasks/dataSync.js — every 30 min
- tasks/milestones.js — triggered by sync pipeline
- tasks/leaderboardAnnouncements.js — scheduled daily/weekly/monthly
- tasks/interCircleAnnouncements.js — scheduled daily/weekly/monthly
- tasks/attendanceCheck.js — daily 6AM JST
- tasks/chatArchiver.js — every 300 seconds
- tasks/sqliteBackup.js — daily rotation
- (+ 15 more tasks registered in tasks/index.js)

### Event Handlers (all registered in index.js)
- handlers/interactionCreate.js — all slash commands
- handlers/messageCreate.js — trainer ID detection, media
- handlers/ready.js — startup
- handlers/guildMemberAdd.js — welcome flow
- handlers/presenceUpdate.js — morning greetings

## Usage Frequency — Requires Telemetry
Cannot determine which commands or tasks run most often without
runtime logs. Do not add estimates here — they become stale.

---

# FINAL RECOMMENDATION SUMMARY

## SAFE TO IGNORE
- scripts/ flagged as unused (they are intentional manual tools)
- imageReport-browser.js and skillScraper.js flagged as orphans
  (both are active, verified by import graph)
- Circular dependency concerns (none found)

## REAL ACTION ITEMS
1. Verify utils/resumeCard.js — no callers found. Check git
   history for context. Remove if feature was abandoned.
2. Verify scripts/setCircle2Quotas.js — confirm circle 2 quotas
   are set in guild_config, then remove the one-shot script.
3. Review uma.js snapshot cache TTL against 30-min sync cycle.

## HIGH VALUE IMPROVEMENT
- Add runtime activity logging (command execution counts,
  task run frequency) stored in bot_state or a new activity
  table. utils/activityLog.js is already partially wired —
  extend it to cover scheduled tasks too.

---

Last Updated: 2026-05-31
