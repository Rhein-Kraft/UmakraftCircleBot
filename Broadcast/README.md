# Broadcast

Broadcast is the event-notification pipeline of UmaKraft Circle Bot.

It handles all push notifications — messages that fire automatically on a cron schedule
or when a data threshold is crossed — without any user request.

## Structure

```
Broadcast/
  Broker/     — receives triggers, creates notification jobs, manages queue
  Inspector/  — validates eligibility, checks dedup, resolves recipients, selects variant
  Archive/    — atomic claim, per-step delivery flags, append-only history log
  Announcer/  — renders content and delivers to Discord with restart-safe retry
```

## Getting Started

1. Read `Overview.md` for the full pipeline design and data flow.
2. Read each department spec: `Broker/Broker.md`, `Inspector/Inspector.md`,
   `Archive/Archive.md`, `Announcer/Announcer.md`.
3. Use in-memory Archive adapters for local development and testing.
4. Run unit tests per department before any change.

## Key Design Rules

- Broadcast is a **push** pipeline. It never responds to slash commands.
- Only Announcer sends to Discord.
- Inspector is the single gatekeeper — nothing reaches Archive or Announcer without passing Inspector.
- Archive is the source of truth on restart. Broker reads incomplete Archive records
  and routes them directly to Announcer without re-running Inspector.
- Workshop and Broadcast are parallel consumers of Refinery/Depot. They never import each other.

## Notification Types

| Notification | Trigger | Destinations |
|---|---|---|
| Daily greeting | 07:00 JST cron | Channel post + per-member DM (local timezone) |
| Noon / night / midnight messages | Hourly cron, per-member timezone | Member DM |
| Offline check | Daily cron, days-since-last-online | Member DM (escalating variants) |
| Daily fan warning | 23:45 JST, fan goal missed | Channel post + all member DMs |
| Daily achievement tier | Hourly, total fans threshold crossed | Channel post + all member DMs |
| Weekly fan warning | End of week, weekly goal missed | Channel post + member DMs |
| Monthly fan warning | End of month, monthly goal missed | Channel post + member DMs |
| Milestone | Monthly, per-trainer fan tier crossed | Channel post + trainer DM + leader DM |
| Leaderboard announcement | Daily/weekly tally complete | Channel post + top-3 DMs |
| Fan deficit image report | Daily tally check | Channel post |
| Inter-circle leaderboard | Weekly | Channel post |

## Relationship with Other Directories

- **Reads from:** `Refinery/Depot` (computed products, threshold data)
- **Calls for renders:** `Workshop/Fabricator` (Announcer requests image card renders)
- **Writes to:** `Broadcast/Archive` only
- **Sends to:** Discord (channel posts, DMs)
- **Never imports from:** `Workshop/Terminal`, `Distribution/`, `Umamoe/`
