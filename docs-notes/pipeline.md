# UmaKraft Circle Bot — Pipeline Reference

> Last updated: 2026-07-07. Reflects all fixes applied in this session.
> Update this file whenever a task is added, removed, or rescheduled.

---

## Table of Contents

1. [Data Flow Overview](#data-flow-overview)
2. [Database Tables](#database-tables)
3. [Scheduled Task Pipeline](#scheduled-task-pipeline)
   - [Sub-Minute / High-Frequency](#sub-minute--high-frequency)
   - [Hourly Tasks](#hourly-tasks)
   - [Daily Tasks — Morning (06:00–10:00 JST)](#daily-tasks--morning-0600-1000-jst)
   - [Daily Tasks — Night (22:00–23:59 JST)](#daily-tasks--night-2200-2359-jst)
   - [Weekly Tasks](#weekly-tasks)
   - [Monthly Tasks](#monthly-tasks)
   - [Infrastructure Tasks](#infrastructure-tasks)
4. [Improvement Opportunities](#improvement-opportunities)

---

## Data Flow Overview

```
uma.moe API
    │
    ▼
syncCircleData()          ← Hourly :00 — foundational, all reporting depends on this
    │  writes: daily_gains (JST date key), members, lastDataSync_<circleId>
    │
    ├──► checkMilestones()          :05 — bails if lastDataSync_ > 10 min ago
    ├──► checkDailyAchievements()   :15 — circle-wide daily gain milestone cards
    └──► runWarningChecks()         :30 — per-member quota DMs

                    ┌── daily_gains ──┐
                    │                 │
              morning reports    night reports
           (07:00–08:35 JST)  (22:30–23:58 JST)
```

**Dependency rule:** every reporting task reads from `daily_gains`. If `syncCircleData` fails, all downstream tasks operate on stale data from the last successful sync.

**Date key alignment:** `syncCircleData` stores `daily_gains` using `jstDate()` — the same key format used by all consumers. There is no UTC/JST mismatch.

---

## Database Tables

| Table | Purpose |
|---|---|
| `members` | Circle member metadata — `viewer_id`, `trainer_name`, `joined_at`, `last_seen`, `left_at` |
| `daily_gains` | Daily fan delta records — `circle_id`, `viewer_id`, `date` (JST), `gain`, `total_fans` |
| `links` | Discord ↔ Uma viewer ID mappings |
| `guild_config` | Per-Discord-server settings and persistent message IDs |
| `bot_state` | General-purpose key-value store used for task dedup and feature flags |
| `milestone_fired` | Which trainer-level milestones have already been announced (backfilled into `achievementDb`) |
| `warning_state` | Active quota warning tracking per member per JST day |
| `warning_history` | Historical record of all warnings issued |
| `attendance` | Daily activity presence records per member |
| `user_streaks` | Consecutive active-day streak counts |
| `leaderboard_snapshots` | Historical rank snapshots (daily / weekly / monthly) |
| `posted_events` | Game timeline events already posted to Discord |
| `timeline_messages` | Discord message IDs for timeline embeds |
| `image_archive_hashes` | Hashes of archived images to prevent duplicates |
| `onboarding` | Unlinked Discord member onboarding state |
| `circles` | Circle registry (supports up to 10 circles) |

---

## Scheduled Task Pipeline

All times are **JST (Asia/Tokyo)** unless noted. Cron expressions use 5-field standard format.

---

### Sub-Minute / High-Frequency

| Schedule | Function | File | Description |
|---|---|---|---|
| Every 2 min | `runImageArchive()` | `tasks/imageArchive.js` | Downloads and dedup-hashes images from watched channels → `#image-archive` |
| Every 5 min | `runChatArchiver()` | `tasks/chatArchiver.js` | Moves the oldest message (>3 days) from `#chat` to `#chat-history`; deletes original after successful repost |
| Every 5 min | `runTimelineUpdate()` | `timeline/timeline.js` | Scrapes game event timeline and posts new events to Discord |
| Every 10 min | `sendOnboardingReminders()` | `tasks/onboardingReminder.js` | DMs unlinked Discord members to run `/link` |

**Dedup:** `runTimelineUpdate` uses `posted_events` table. `runImageArchive` hashes files before writing. `runChatArchiver` is a destructive move — original is deleted after archive — so no duplicate risk.

---

### Hourly Tasks

| Schedule | Function | File | Description |
|---|---|---|---|
| `:00` every hour | `syncCircleData()` | `tasks/dataSync.js` | Fetches uma.moe, classifies members, computes daily gain deltas, saves to `daily_gains` with JST date key |
| `:05` every hour | `checkMilestones()` | `tasks/milestones.js` | Checks if any trainer crossed a lifetime fan milestone; posts image card to channel + DM |
| `:10` and `:40` | `cleanupMilestoneMessages()` | `tasks/milestoneCleanup.js` | Deletes stale/redundant milestone announcement messages from Discord |
| `:15` every hour | `checkDailyAchievements()` | `tasks/dailyAchievement.js` | Fires circle-wide achievement card (1M–10M daily fans) if threshold crossed |
| `:30` every hour | `runWarningChecks()` | `tasks/warningEngine.js` | DMs individual members whose daily fan gain is below their personal quota |
| Every 6 hours `:00` | `purgeAnnouncementChannel()` | `tasks/purgeAnnouncement.js` | Removes non-bot messages and old bot messages from `#announcement` |

**Guards:**
- `checkMilestones`, `checkDailyAchievements`, `runWarningChecks` all check `isLocked()` — skip if a bulk operation holds the busy lock.
- `checkMilestones` additionally bails if `lastDataSync_<circleId>` is older than 10 minutes — prevents firing on stale data when `syncCircleData` runs slowly.
- `checkDailyAchievements` has SQLite dedup: `dailyAchievement:{circleId}:{threshold}:{jstDate}` — fires at most once per tier per JST day.
- `syncCircleData` guards against stale API data: skips writing `daily_gains` if `latestIdx < todayDateIdx` (uma.moe hasn't updated today yet).

**Data flow:** `:00` sync → `:05` milestones → `:15` achievements → `:30` warnings. Each task reads `daily_gains` written by the most recent `:00` sync.

---

### Daily Tasks — Morning (06:00–10:00 JST)

| Schedule | Function | File | Description |
|---|---|---|---|
| `0 6 * * *` | `runAttendanceCheck()` | `tasks/attendanceCheck.js` | Marks presence/absence for all linked members; updates streaks |
| `0 7 * * *` | `postDailyGreetingReport()` | `tasks/dailyGreetingReport.js` | Posts yesterday's gain summary image to `#announcement` |
| `10 7 * * *` | `postDailyTop3()` | `tasks/leaderboardAnnouncements.js` | Posts top 3 daily gainers image card |
| `20 7 * * *` | `postInterCircleDaily()` | `tasks/interCircleAnnouncements.js` | Posts comparative leaderboard across all configured circles |
| `0 8 * * *` | `postMonthlyWarning()` | `tasks/monthlyWarning.js` | DMs members below monthly quota threshold with image report |
| `15 8 * * *` | `postWeeklyWarning()` | `tasks/weeklyWarning.js` | DMs members below weekly quota threshold with image report |
| `35 8 * * *` | `postFanDeficitImageReport()` | `tasks/fanDeficitImageReport.js` | Posts circle-wide monthly quota progress image to `#announcement` |
| `0 10 * * *` | `checkOfflineMembers()` | `tasks/offlineCheck.js` | Alerts officers if linked members haven't been seen for X days |

**Dedup keys (all JST date-scoped):**
- `dailyGreetingReport:{circleId}:{date}`
- `dailyTop3:{circleId}:{date}`
- `icDaily:{date}`
- `monthlyWarning:{circleId}:{date}`
- `weeklyWarning:{circleId}:{date}`
- `fanDeficitReport:{circleId}:{date}`
- `offlineCheck:{date}`

---

### Daily Tasks — Night (22:00–23:59 JST)

| Schedule | Function | File | Description |
|---|---|---|---|
| `30 22 * * *` | `runOfficerSummary()` | `tasks/warningEngine.js` | Posts officer-facing summary card of members currently at risk |
| `55 22 * * *` | `postInterCircleMonthly()` | `tasks/interCircleAnnouncements.js` | Posts monthly inter-circle comparison — last JST day of month only |
| `0 23 * * *` | `postMonthlyTop3()` | `tasks/leaderboardAnnouncements.js` | Posts monthly top 3 gainers — last JST day of month only |
| `30 23 * * *` | `maybePostTallyResults()` | `tasks/tallyResults.js` | Posts final daily tally — total circle gain and rank |
| `45 23 * * *` | `checkDailyFanWarning()` | `tasks/dailyFanWarning.js` | Posts warning card + DMs all linked members if circle gain < 1,000,000 for the day |
| `55 23 * * *` | `runMonthEndFinalSync()` | `tasks/index.js` (inline) | Final forced sync on last JST day of month to capture all gains before reset |
| `58 23 * * *` | `runMonthEndExport()` | `tasks/monthlyHistoryExport.js` | Exports monthly gains to CSV; archives to historical docs |

**Dedup keys:**
- `tallyResults:{circleId}:{date}`
- `dailyFanWarning:{circleId}:{date}`

**Month-end guard:** `postInterCircleMonthly`, `postMonthlyTop3`, and `runMonthEndFinalSync` all use `isLastDayOfMonthJST()` — a JST-aware helper that computes the last calendar day in JST, not UTC. This eliminates the UTC/JST boundary bug where the last day fired one day late on a UTC server.

**`checkDailyFanWarning` notes:**
- Channel post: generic warning image card showing circle gain, goal, shortfall, and progress bar. Circle name shown in top-right. No @mentions — visible to all channel members.
- DMs: personalised card per linked member with trainer name shown. Unlinked members see channel post only.
- DM retry: one retry pass after 5 seconds for transient Discord failures. Permanently blocked DMs are logged and skipped.

---

### Weekly Tasks

| Schedule | Function | File | Description |
|---|---|---|---|
| `0 6 * * 1` | `postWeeklyHelp()` | `tasks/weeklyAnnouncement.js` | Posts weekly tip/help message (Monday) |
| `0 9 * * 1` | `postWeeklyLeaderboard()` | `tasks/weeklyAnnouncement.js` | Full circle leaderboard for previous week (Monday) |
| `5 9 * * 1` | `postWeeklyTop3()` | `tasks/leaderboardAnnouncements.js` | Top 3 gainers for the previous week (Monday) |
| `15 9 * * 1` | `postInterCircleWeekly()` | `tasks/interCircleAnnouncements.js` | Inter-circle weekly comparison (Monday) |

**Dedup keys:** `weeklyLeaderboard:{circleId}:{date}` and equivalent per task.

---

### Monthly Tasks

| Schedule | Function | File | Description |
|---|---|---|---|
| `30 0 1 * *` | `runMonthStartCatchUp()` | `tasks/monthlyHistoryExport.js` | First of month: backfills any missed data from the final day of last month |
| `0 6 2 * *` | `runHistoricalMonthSync()` | `tasks/historicalSync.js` | Second of month: fetches official final rankings from uma.moe for the closed month |

---

### Infrastructure Tasks

| Schedule | Function | File | Description |
|---|---|---|---|
| `0 3 * * *` | `updateGameData()` | `tasks/updateGameData.js` | Refreshes local game asset cache (character names, card data) from remote |
| `30 3 * * *` | `runSqliteBackup()` | `tasks/sqliteBackup.js` | Creates a timestamped copy of `store.db` to `backups/` |

---

## Improvement Opportunities

### ✅ Fixed

| Area | Fix Applied |
|---|---|
| **UTC/JST date mismatch in `daily_gains`** | `syncCircleData` now uses `jstDate()` as the date key — matches all consumers |
| **False achievement triggers from stale API data** | `syncCircleData` skips gain writes when `latestIdx < todayDateIdx` (uma.moe not yet updated) |
| **Month-end logic used UTC `new Date()`** | All 3 month-end guards replaced with `isLastDayOfMonthJST()` — JST-aware, no UTC boundary drift |
| **`purgeAnnouncement` ran every hour** | Reduced to every 6 hours (`0 */6 * * *`) |
| **`checkMilestones` could fire on stale data** | Added `lastDataSync_<circleId>` staleness guard — bails if last sync > 10 min ago |
| **DM failures silently swallowed with no retry** | `checkDailyFanWarning` now collects failed DMs and retries once after a 5-second delay |
| **`checkDailyFanWarning` channel card showed hardcoded circle name** | Renderer now uses the `circleName` parameter — correct for multi-circle setups |
| **`warningEngine` re-fire on restart concern** | Already handled — `warningDb` persists `warning_state` per member per JST day; dedup survives restarts |
| **`chatArchiver` dedup concern** | Not applicable — archiver performs a destructive move (delete original after repost), not a copy |

### 🟢 Remaining / Future Work

| Area | Issue | Suggestion |
|---|---|---|
| **`runHistoricalMonthSync` may catch incomplete data** | uma.moe sometimes finalises rankings after the 2nd; the scheduled sync on the 2nd may still see incomplete data | Add a `/sync-history [month]` slash command as a manual fallback so officers can re-trigger when uma.moe has settled |
| **No retry for DMs in `checkDailyAchievements`** | Achievement DM failures are silently skipped within a run; retry only happens at next hourly tick if dedup wasn't written | Apply the same 5-second retry pass used in `checkDailyFanWarning` |
| **`daily_gains` MAX() upsert cannot correct downward** | The `MAX(gain, excluded.gain)` upsert is correct for intra-day accumulation but cannot fix a gain that was over-written before the API guard was in place | Historical data already in DB is not affected; monitor post-fix to confirm no new inflation |
| **`runMonthEndExport` has no last-day guard** | Unlike `monthEndFinalSync`, `runMonthEndExport` at 23:58 runs every night — it relies on internal checks to be a no-op on non-last-days | Add an `isLastDayOfMonthJST()` guard for consistency and to avoid unnecessary work |
