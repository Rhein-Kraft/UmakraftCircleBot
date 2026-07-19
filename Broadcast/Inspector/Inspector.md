# Inspector

## Purpose

The **Inspector** is the gatekeeper of the Broadcast pipeline.

No notification reaches Archive or Announcer without passing Inspector. It runs every
eligibility, dedup, and recipient check in a single pass, and either accepts the job
(producing a validated notification envelope) or rejects it cleanly so nothing is
written to Archive.

---

## Responsibilities

1. **Eligibility check** — verify the notification conditions are truly met.
   - Has the fan threshold actually been crossed?
   - Is the grace period over? Is the tally window still open?
   - Is the escalation level higher than the last DM'd level?
   - Inspector reads pre-computed values from `Refinery/Depot`. It does not
     re-implement business logic — the Refiner already computed the values.

2. **Dedup check** — verify this notification has not already fired.
   - Has a claim record for this notification type, circle, and date/month already
     been inserted into Archive?
   - Has the current warning level already been DM'd to this member today?
   - If a matching record exists in Archive, Inspector rejects the job immediately.

3. **Recipient resolution** — determine the full delivery plan.
   - Which Discord channel(s) receive the post?
   - Which linked members receive a DM? (Filter: active, linked, within the circle)
   - Does the circle leader receive a separate DM?
   - What order should delivery happen in?

4. **Variant selection** — select the message content.
   - Pick one variant from the message pool (e.g. 1 of 50 warning variants, 1 of 5
     achievement variants for a given tier).
   - Apply per-recipient personalization tokens (trainer name, rank, fan count, etc.).
   - Produce the full message payload for Announcer to deliver.

If any check fails → reject the job; Broker discards it cleanly.
If all checks pass → emit a validated notification envelope to Archive and Announcer.

---

## Input

A notification job envelope from Broker:

```json
{
  "type": "milestone",
  "circleId": "circle-001",
  "sourceRef": { "depotId": "compiled-product-id", "snapshotDate": "2026-07-19" },
  "triggeredAt": "2026-07-19T07:00:00.000Z",
  "meta": {}
}
```

---

## Output

### Accepted — validated notification envelope

```json
{
  "type": "milestone",
  "circleId": "circle-001",
  "notificationKey": "milestone:circle-001:trainer-alice:100M:2026-07",
  "recipients": {
    "channels": ["channel-id-1"],
    "memberDms": ["viewer-id-1", "viewer-id-2"],
    "leaderDm": "viewer-id-leader"
  },
  "payload": {
    "variant": 3,
    "trainerName": "Alice",
    "tierLabel": "100,000,000",
    "message": "...",
    "imageParams": { "type": "milestone", "tier": "100M", "trainerName": "Alice" }
  },
  "inspectedAt": "2026-07-19T07:00:01.000Z"
}
```

### Rejected — reason logged, job discarded

```json
{
  "accepted": false,
  "reason": "DEDUP_EXISTS | THRESHOLD_NOT_MET | GRACE_PERIOD | TALLY_CLOSED | NO_RECIPIENTS",
  "notificationKey": "milestone:circle-001:trainer-alice:100M:2026-07"
}
```

---

## Notification Key

Every validated envelope has a `notificationKey` — a stable, deterministic string that
uniquely identifies this specific notification event. It is used as the primary key
in Archive's claim step so INSERT OR IGNORE prevents duplicate sends.

Key format by notification type:

| Type | Key format |
|---|---|
| milestone | `milestone:{circleId}:{viewerId}:{tierKey}:{YYYY-MM}` |
| dailyWarning | `daily-warning:{circleId}:{YYYY-MM-DD}` |
| weeklyWarning | `weekly-warning:{circleId}:{YYYY-Www}` |
| monthlyWarning | `monthly-warning:{circleId}:{YYYY-MM}` |
| achievement | `achievement:{circleId}:{tierKey}:{YYYY-MM-DD}` |
| greeting | `greeting:{circleId}:{YYYY-MM-DD}` |
| memberGreeting | `member-greeting:{viewerId}:{greetingType}:{YYYY-MM-DD-local}` |
| offline | `offline:{viewerId}:{YYYY-MM-DD}` |
| leaderboard | `leaderboard:{circleId}:{period}:{YYYY-MM-DD}` |

---

## Interface

```javascript
// Inspect a notification job; returns { accepted, envelope } or { accepted: false, reason }
await inspector.inspect(job)

// Register a notification type's eligibility rules (called during Broker.register)
inspector.registerType(type, { eligibility, dedup, recipients, variants })
```

---

## Workflow

```text
Broker (job envelope)
     │
     ▼
Inspector
  1. eligibility check  (reads Refinery/Depot)
  2. dedup check        (reads Broadcast/Archive)
  3. recipient resolution
  4. variant selection
     │
     ├── reject → Broker discards, logs reason
     │
     └── accept → validated envelope → Archive (claim) → Announcer (deliver)
```

---

## Design Principle

Inspector is the only place where "should this notification fire?" is answered.

All eligibility rules, dedup logic, recipient filters, and variant pools belong here.
Broker does not evaluate eligibility. Announcer does not check dedup. Archive does not
filter recipients. One gatekeeper means one place to audit and one place to change rules.

---

## Current Source Files

| Current file | Inspector responsibility extracted |
|---|---|
| `fantracking/milestone/eval.js` | Eligibility — `meetsThreshold()` |
| `fantracking/milestone/tiers.js` | Variant pool — tier config, labels, colors, variants |
| `fantracking/milestone/winners.js` | Recipient resolution — top-3 winner selection |
| `fantracking/milestone/cleanup.js` | Archive pruning (shared with Archive) |
| `fantracking/warnings/engine.js` | Eligibility — pace calc, level escalation, grace period |
| `fantracking/warnings/daily.js` | Eligibility — daily fan goal check |
| `fantracking/warnings/weekly.js` | Eligibility — weekly goal check |
| `fantracking/warnings/monthly.js` | Eligibility — monthly goal check |

---

## Version History

- `v1.0` — Initial Inspector specification
