# Automatic Tasks

All tasks that run automatically on a time schedule (cron jobs) or triggered by a Discord event. No manual command is needed to fire these.

> **Scope:** This document covers cron-scheduled tasks and Discord event-driven automations only. One-time startup jobs (sync, recovery, import) that run when the bot first comes online are not listed here.

All cron times are in the bot's configured timezone (default: **Asia/Tokyo / JST**).

---

## 📅 Scheduled Tasks (Cron Jobs)

Managed centrally in `tasks/index.js` using a `schedule()` wrapper around `node-cron`.

### Every 2 Minutes
| File | Cron | What it does |
|------|------|--------------|
| `tasks/imageArchive.js` | `*/2 * * * *` | Archives images posted in monitored channels |

### Every 5 Minutes
| File | Cron | What it does |
|------|------|--------------|
| `tasks/chatArchiver.js` | `*/5 * * * *` | Archives chat messages from monitored channels |

### Every 10 Minutes
| File | Cron | What it does |
|------|------|--------------|
| `tasks/onboardingReminder.js` | `*/10 * * * *` | Sends reminders to unlinked new members to complete onboarding |

### Hourly
| File | Cron | What it does |
|------|------|--------------|
| `tasks/dataSync.js` | `0 * * * *` | Syncs circle fan data from uma.moe for all circles (3s delay between each) |
| `tasks/milestones.js` | `5 * * * *` | Checks for trainer milestone events (e.g. fan count thresholds) |
| `tasks/milestoneCleanup.js` | `10,40 * * * *` | Cleans up old milestone announcement messages |
| `tasks/purgeAnnouncement.js` | `0 * * * *` | Purges old messages in announcement channels |
| `tasks/warningEngine.js` | `30 * * * *` | Runs automated fan-deficit warning checks for all members |

### Daily
| File | Cron | What it does | Condition |
|------|------|--------------|-----------|
| `tasks/dailyGreetingReport.js` | `0 7 * * *` | Posts the daily greeting image card to the announcement channel | — |
| `tasks/leaderboardAnnouncements.js` | `10 7 * * *` | Posts the daily Top 3 fan-gain leaderboard | — |
| `tasks/interCircleAnnouncements.js` | `20 7 * * *` | Posts daily inter-circle fan-gain stats | — |
| `tasks/monthlyWarning.js` | `0 8 * * *` | Posts the monthly warning summary | — |
| `tasks/weeklyWarning.js` | `15 8 * * *` | Posts the weekly warning summary | — |
| `tasks/fanDeficitImageReport.js` | `35 8 * * *` | Posts an image report of current fan deficits | — |
| `tasks/offlineCheck.js` | `0 10 * * *` | Flags members who have been offline for an extended period | — |
| `tasks/attendanceCheck.js` | `0 6 * * *` | Checks attendance status for all circle members | — |
| `tasks/warningEngine.js` | `30 22 * * *` | Posts an officer summary of warnings and fan deficits | — |
| `tasks/tallyResults.js` | `30 23 * * *` | Tallies and saves the day's final results | — |
| `tasks/leaderboardAnnouncements.js` | `0 23 * * *` | Posts monthly Top 3 leaderboard | Only if tomorrow is a new month |
| `tasks/dataSync.js` | `55 23 * * *` | Final data sync before month-end reset | Only if tomorrow is a new month |
| `tasks/interCircleAnnouncements.js` | `55 22 * * *` | Final month-end inter-circle report | Only if tomorrow is a new month |
| `tasks/monthlyHistoryExport.js` | `58 23 * * *` | Exports monthly history CSV and regenerates documents | Only on the last day of the month |
| `tasks/updateGameData.js` | `0 3 * * *` | Updates local game data and assets from source | — |
| `tasks/messageCleanup.js` | `15 4 * * *` | Cleans up command-related messages in channels | — |
| `tasks/sqliteBackup.js` | `30 3 * * *` | Backs up the SQLite database | — |

### Weekly
| File | Cron | What it does |
|------|------|--------------|
| `tasks/weeklyAnnouncement.js` | `0 6 * * 1` (Mon) | Posts the weekly help/info message |
| `tasks/weeklyAnnouncement.js` | `0 9 * * 1` (Mon) | Posts the weekly fan leaderboard |
| `tasks/leaderboardAnnouncements.js` | `5 9 * * 1` (Mon) | Posts the weekly Top 3 leaderboard |
| `tasks/interCircleAnnouncements.js` | `15 9 * * 1` (Mon) | Posts the weekly inter-circle fan stats |

### Monthly
| File | Cron | What it does |
|------|------|--------------|
| `tasks/monthlyHistoryExport.js` | `30 0 1 * *` | Catch-up export if the end-of-month run was missed |
| `tasks/historicalSync.js` | `0 6 2 * *` | Full historical data sync from uma.moe (runs on the 2nd of each month) |

### Timeline Scheduler (`timeline/timelineScheduler.js`)
| Cron | What it does | Condition |
|------|--------------|-----------|
| `*/${interval} * * * *` | Scrapes the timeline URL and posts new events | `TIMELINE_URL` config must be set |
| `* * * * *` | Refreshes countdown timers inside active event embeds | — |

---

## ⚡ Event-Driven Tasks (Discord Event Listeners)

These fire automatically when something happens in the Discord server or in the bot's DMs. Registered in `handlers/`.

### `handlers/ready.js`
| Event | What it does |
|-------|--------------|
| `ClientReady` | Startup initialization — registers commands, loads state, starts scheduled tasks |

### `handlers/guildMemberAdd.js`
| Event | What it does | Condition |
|-------|--------------|-----------|
| `GuildMemberAdd` | Welcomes the new member and starts the onboarding flow | Onboarding only applies to members who join after the configured cutoff date |

### `handlers/presenceUpdate.js`
| Event | What it does | Condition |
|-------|--------------|-----------|
| `PresenceUpdate` | Sends a morning DM greeting when a member comes online | Only fires on `offline → online` transition; member must be linked; once per day |

### `handlers/messageCreate.js`
| Event | What it does | Condition |
|-------|--------------|-----------|
| `MessageCreate` | Routes DMs, enforces channel rules, logs member behavior | Ignores bots |
| `MessageDelete` | Logs deleted messages to the behavior log | Ignores bots |
| `MessageUpdate` | Logs edited messages to the behavior log | Ignores bots; ignores edits with no content change |
| `MessageReactionAdd` | Logs reactions to the behavior log | Ignores bots |

### `handlers/interactionCreate.js`
| Event | What it does | Condition |
|-------|--------------|-----------|
| `InteractionCreate` | Handles all slash commands and button interactions | Ignores stale or duplicate interactions (60s dedup window) |

---

## ⏱️ Internal Timers & Utilities

Short-lived timers used internally — not user-visible as scheduled jobs.

| Location | Trigger | What it does |
|----------|---------|--------------|
| `tasks/index.js` | 3s, 5s, 8s delays on startup | Staggers initialization API calls to avoid rate limits |
| `utils/autoDelete.js` | `setTimeout` (default 60s) | Auto-deletes ephemeral bot messages after a configurable delay |
| `core/umaQueue.js` | 500ms enforced gap | Rate-limits outgoing requests to the uma.moe API |
| `handlers/interactionCreate.js` | `setTimeout` (60s) | Clears seen interaction IDs from memory to prevent dedup buildup |

---

## 📊 Daily Schedule at a Glance

```
00:30  monthlyHistoryExport.js  (catch-up, 1st of month only)
03:00  updateGameData.js
03:30  sqliteBackup.js
04:15  messageCleanup.js
06:00  attendanceCheck.js
06:00  weeklyAnnouncement.js  (Mon only)
06:00  historicalSync.js  (2nd of month only)
07:00  dailyGreetingReport.js
07:10  leaderboardAnnouncements.js  (daily)
07:20  interCircleAnnouncements.js  (daily)
08:00  monthlyWarning.js
08:15  weeklyWarning.js
08:35  fanDeficitImageReport.js
09:00  weeklyAnnouncement.js  (Mon only)
09:05  leaderboardAnnouncements.js  (Mon only)
09:15  interCircleAnnouncements.js  (Mon only)
10:00  offlineCheck.js
--:00  dataSync.js  (every hour)
--:00  purgeAnnouncement.js  (every hour)
--:05  milestones.js  (every hour)
--:10  milestoneCleanup.js  (every hour, :10 and :40)
--:30  warningEngine.js  (every hour)
22:30  warningEngine.js  (officer summary)
22:55  interCircleAnnouncements.js  (month-end only)
23:00  leaderboardAnnouncements.js  (month-end only)
23:30  tallyResults.js
23:55  dataSync.js  (month-end only)
23:58  monthlyHistoryExport.js
```
