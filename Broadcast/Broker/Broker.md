# Broker

## Purpose

The **Broker** is the entry point and data courier of the Broadcast pipeline.

When triggered by a cron schedule or a threshold event, Broker fetches the relevant
compiled data from `Refinery/Depot` and hands it to Inspector as raw input for
evaluation. Broker does not decide whether a notification should fire — that is
Inspector's job.

On bot restart, Broker also reads Archive for incomplete delivery records and routes
those directly to Announcer, bypassing Inspector entirely.

---

## Responsibilities

1. Receive the cron trigger or threshold event for a specific notification type and circle.
2. Fetch the relevant compiled product(s) from `Refinery/Depot` for that circle and period.
3. Build the raw notification input envelope from the fetched data.
4. Pass the raw input to Inspector.
5. On restart: read Archive for records with any delivery flag still at 0 and route them
   to Announcer (skip Inspector — those were already approved before the restart).
6. Manage the per-circle queue so one failing circle never blocks another.

Broker does not evaluate eligibility, resolve recipients, select variants, write to
Archive, or send to Discord.

---

## What Broker Fetches from Refinery

Broker knows what type of data each notification type needs and fetches exactly that
from `Refinery/Depot`:

| Notification type | What Broker fetches from Depot |
|---|---|
| Daily warning | Circle daily fan total for today |
| Achievement tier | Circle hourly fan total + tier thresholds |
| Milestone | Per-trainer monthly fan total + tier config |
| Leaderboard | Compiled leaderboard snapshot for today/week |
| Greeting | Member roster with linked status + timezones |
| Offline check | Member last-seen timestamps |
| Weekly / monthly warning | Circle period totals for the relevant window |
| Inter-circle | Multi-circle compiled snapshot |

---

## Raw Input Envelope

The envelope Broker builds and hands to Inspector:

```json
{
  "type": "dailyWarning",
  "circleId": "circle-001",
  "fetchedAt": "2026-07-19T23:45:00.000Z",
  "data": {
    "fanTotal": 842000,
    "memberStats": [ ... ],
    "snapshotDate": "2026-07-19",
    "depotRef": "depot-product-id-xyz"
  }
}
```

`data` contains exactly what was fetched from Refinery/Depot — no derived values,
no eligibility conclusions, no recipient lists. That computation belongs to Inspector.

---

## Restart Recovery

On every startup and before each cron tick, Broker reads Archive for incomplete records:

```text
Archive.getIncomplete(circleId)
  → records where channel_sent=0 OR dm_member_sent=0 OR dm_leader_sent=0

For each incomplete record:
  → route notificationKey directly to Announcer
  → skip Inspector (notification was already approved before restart)
```

This ensures deliveries that were interrupted by a crash or restart are completed
without re-evaluating eligibility or creating duplicate Archive records.

---

## Per-Circle Queue

Broker runs notification jobs for each configured circle sequentially and in isolation:

```text
for each circle in getConfiguredCircles():
  try:
    data = Depot.fetch(type, circleId)
    Inspector.evaluate({ type, circleId, data })
  catch error:
    log error, continue to next circle
```

One failing circle never blocks others.

---

## Interface

```javascript
// Called by tasks/index.js on cron tick
await broker.run(type, client)

// Internal: fetch data from Refinery/Depot for a given type + circle
await broker._fetch(type, circleId)

// Internal: on startup, find and recover incomplete Archive records
await broker._recoverIncomplete(circleId, client)
```

---

## Workflow

```text
tasks/index.js (cron schedule fires)
     │
     ▼
Broker.run(type, client)
     │
     ├── broker._recoverIncomplete()
     │     → Archive.getIncomplete(circleId)
     │     → Announcer.deliver(notificationKey, client)   [retry only]
     │
     └── for each circle:
           → Depot.fetch(type, circleId) → raw data
           → Inspector.evaluate({ type, circleId, data })
```

---

## Design Principle

Broker is a courier, not a judge.

It knows when to run and what data to fetch. It does not know whether the data
qualifies as a notification event — that is Inspector's job. This separation means
Broker can be tested with mock Depot data regardless of any eligibility logic, and
eligibility rules can be changed in Inspector without touching Broker.

---

## Current Source Files

Logic extracted into Broker from these files:

| Current file | Broker responsibility |
|---|---|
| `fantracking/milestone/milestones.js` | Per-circle queue, restart recovery, boot-time guard |
| `tasks/dailyGreetingReport.js` | Cron trigger, member roster fetch |
| `tasks/dailyMessages.js` | Per-timezone hour check, member fetch |
| `tasks/offlineCheck.js` | Days-offline threshold, last-seen fetch |
| `tasks/weeklyAnnouncement.js` | Weekly tally event, snapshot fetch |
| `tasks/interCircleAnnouncements.js` | Multi-circle snapshot fetch |

---

## Version History

- `v1.0` — Initial Broker specification
- `v1.1` — Clarified Broker as data courier only; data fetch from Refinery is primary
  responsibility; eligibility decisions belong entirely to Inspector
