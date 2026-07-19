# Broker

## Purpose

The **Broker** is the entry point for the Broadcast pipeline.

It receives notification triggers — a cron tick from `tasks/index.js` or a threshold
event surfaced by Refinery — creates a structured notification job envelope, and hands
that envelope to Inspector for validation.

Broker also manages the per-circle notification queue, runs the boot-time silent-claim
guard, and routes incomplete Archive records back to Announcer on restart.

---

## Responsibilities

1. Receive cron triggers and data threshold events.
2. Create a notification job envelope with the notification type, circle ID, source data
   reference, and timestamp.
3. Manage the per-circle queue — run circles sequentially so one failing circle never
   blocks another.
4. On the first cron tick after bot restart, run the boot-time silent-claim guard:
   claim all qualifying notifications into Archive without sending any messages. From
   the second tick onward, only genuinely new records trigger sends.
5. On every cron tick, read Archive for records with any delivery flag still at 0 and
   route them directly to Announcer (skip Inspector — the notification is already claimed).
6. Pass new qualifying jobs to Inspector.

Broker does not evaluate eligibility, select variants, write to Archive, or send to Discord.

---

## Notification Job Envelope

The envelope Broker creates and hands to Inspector:

```json
{
  "type": "milestone | dailyWarning | achievement | greeting | offline | ...",
  "circleId": "circle-001",
  "sourceRef": {
    "depotId": "compiled-product-id",
    "snapshotDate": "2026-07-19"
  },
  "triggeredAt": "2026-07-19T07:00:00.000Z",
  "meta": {}
}
```

`sourceRef.depotId` points to the compiled product in `Refinery/Depot` that this
notification is based on. Inspector fetches the product from Depot using this reference.

---

## Boot-Time Silent-Claim Guard

On restart, there is a risk of a spam burst: the bot missed several cron ticks while
offline, and on its first tick it fires every notification that would have qualified
during the downtime.

The guard prevents this:

```text
First tick after restart:
  → claim all qualifying notifications into Archive (INSERT OR IGNORE)
  → do NOT pass any to Announcer
  → mark the circle as "booted"

Second tick onward:
  → only records claimed AFTER the boot tick are new → proceed normally
```

This pattern is already proven in production by `fantracking/milestone/milestones.js`.

---

## Restart Recovery Flow

On every cron tick, before processing new jobs:

```text
Archive.getIncomplete(circleId)
  → returns records where channel_sent=0 OR dm_member_sent=0 OR dm_leader_sent=0
  → route each directly to Announcer
  → Announcer retries only the steps with flag = 0
```

Inspector is not re-run for recovery records. The notification was already validated
and claimed — only delivery is retried.

---

## Interface

```javascript
// Register a cron-triggered notification type
broker.register(type, options)

// Trigger a notification job manually (e.g. from a data event)
await broker.trigger({ type, circleId, sourceRef, meta })

// Run the full broker cycle for all configured circles (called by tasks/index.js)
await broker.run(client)
```

---

## Workflow

```text
tasks/index.js (cron schedule)
     │
     ▼
Broker.run(client)
     │
     ├── read Archive for incomplete records → Announcer (retry)
     │
     └── for each circle:
           │
           ├── boot guard (first tick after restart)?
           │     → claim silently, skip Announcer
           │
           └── create job envelope → Inspector
```

---

## Design Principle

Broker is a coordinator, not a processor.

It knows *when* to fire and *which circle* to process. It does not know whether a
notification qualifies, who should receive it, or what the message should say.
Those responsibilities belong to Inspector and Announcer respectively.

---

## Current Source Files

These files contain the logic that will be consolidated into Broker:

| Current file | Broker responsibility extracted |
|---|---|
| `fantracking/milestone/milestones.js` | Boot guard, per-circle queue, restart recovery |
| `tasks/dailyGreetingReport.js` | Time check, channel greeting trigger |
| `tasks/dailyMessages.js` | Per-timezone hour check, DM loop trigger |
| `tasks/offlineCheck.js` | Days-offline threshold trigger |
| `tasks/weeklyAnnouncement.js` | Weekly tally event trigger |
| `tasks/interCircleAnnouncements.js` | Inter-circle comparison trigger |

---

## Version History

- `v1.0` — Initial Broker specification
