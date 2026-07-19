# Announcer

## Purpose

The **Announcer** is the delivery engine of the Broadcast pipeline.

It receives a claimed Archive record — a notification that has already been validated
by Inspector and atomically claimed in Archive — and executes the delivery plan
step by step: rendering the message content, posting to the Discord channel, and
sending DMs to each qualifying recipient.

After each successful step, Announcer marks the corresponding delivery flag in Archive.
If a step fails, Announcer leaves the flag at 0 and lets the next Broker run retry it.

---

## Responsibilities

1. **Render** — request the image card from `Workshop/Fabricator` using the image
   parameters in the validated notification envelope. Announcer does not render
   cards itself — it delegates to Fabricator and receives the card buffer back.

2. **Post to channel** — post the rendered card and message text to each configured
   Discord announcement channel. On success → `Archive.markChannelSent()`.

3. **Send member DMs** — send the individual DM (with personalized text and card)
   to each recipient in the delivery plan. On success → `Archive.markDmMemberSent()`.

4. **Send leader DM** — send the leader notification DM if the delivery plan requires it.
   On success → `Archive.markDmLeaderSent()`.

5. **Record history** — after each step (success or failure) → `Archive.recordHistory()`.

6. **Handle retry** — when Broker surfaces an incomplete Archive record on restart,
   Announcer checks which flags are still at 0 and executes only those steps.
   Steps with flag = 1 are skipped completely.

Announcer does not evaluate eligibility, check dedup, select variants, or write
claim records. All of that was done by Inspector and Archive before Announcer is called.

---

## Input

A claimed Archive record, retrieved by Broker:

```json
{
  "notificationKey": "milestone:circle-001:trainer-alice:100M:2026-07",
  "type": "milestone",
  "circleId": "circle-001",
  "claimedAt": "2026-07-19T07:00:01.000Z",
  "channelSent": 0,
  "dmMemberSent": 0,
  "dmLeaderSent": 0,
  "payloadJson": {
    "recipients": {
      "channels": ["channel-id-1"],
      "memberDms": ["viewer-id-1"],
      "leaderDm": "viewer-id-leader"
    },
    "payload": {
      "variant": 3,
      "trainerName": "Alice",
      "tierLabel": "100,000,000",
      "message": "...",
      "imageParams": { "type": "milestone", "tier": "100M", "trainerName": "Alice" }
    }
  }
}
```

---

## Delivery Order

Steps always run in this order. Each step is skipped if its flag is already 1.

```text
1. render image card  (Workshop/Fabricator)
2. post to channel(s) → Archive.markChannelSent()
3. send member DM(s)  → Archive.markDmMemberSent()
4. send leader DM     → Archive.markDmLeaderSent()
```

Announcer enforces this order on both first delivery and retry runs.

---

## Failure Handling

When a Discord API call fails:

- Log the error with the notification key, step name, and Discord error code.
- Call `Archive.recordHistory()` with `outcome: 'failure'` and the error code.
- Leave the delivery flag at 0.
- Do not retry immediately — return control to Broker.
- On the next Broker run, the incomplete record is surfaced and routed back to Announcer.

Announcer never enters a retry loop itself. Retry cadence is controlled entirely by
the Broker cron schedule (typically every 30 minutes).

---

## Render Delegation

Announcer calls `Workshop/Fabricator` to render image cards. It passes the
`imageParams` from the notification payload and receives a `Buffer` back.

```javascript
const cardBuffer = await fabricator.render(payload.imageParams)
const attachment = bufferToAttachment(cardBuffer, buildReportFilename(type))
```

This preserves the boundary: Fabricator renders, Announcer delivers.
Announcer never contains HTML, canvas, SVG, or Playwright code.

---

## Interface

```javascript
// Execute the delivery plan for a claimed notification
await announcer.deliver(archivedRecord, client)

// Retry incomplete steps for an already-claimed record (called by Broker on restart)
await announcer.retry(archivedRecord, client)

// Internal: render + post to channel
await announcer._postChannel(record, client)

// Internal: render + send member DMs
await announcer._sendMemberDms(record, client)

// Internal: send leader DM
await announcer._sendLeaderDm(record, client)
```

---

## Workflow

```text
Broker (claimed Archive record)
     │
     ▼
Announcer.deliver(record, client)
     │
     ├── channelSent = 0?
     │     → Fabricator.render(imageParams)
     │     → client.channel.send(embed + attachment)
     │     → Archive.markChannelSent()
     │     → Archive.recordHistory('channel', 'success')
     │
     ├── dmMemberSent = 0?
     │     → for each viewerId in recipients.memberDms:
     │         → utils/dm.dmByViewerId(viewerId, embed + attachment)
     │     → Archive.markDmMemberSent()
     │     → Archive.recordHistory('dm_member', 'success')
     │
     └── dmLeaderSent = 0?
           → utils/dm.dmLeader(circleId, embed + attachment)
           → Archive.markDmLeaderSent()
           → Archive.recordHistory('dm_leader', 'success')
```

---

## Current Source Files

These files contain the delivery logic that will be consolidated into Announcer.
The render portions of these files move to `Workshop/Fabricator/renders/`.

| Current file | Delivery logic extracted to Announcer |
|---|---|
| `fantracking/milestone/notifier.js` | `sendChannelAnnouncement()`, `buildMemberDmText()`, `buildLeaderDmText()`, `retrySends()` |
| `fantracking/leaderboard/announcements.js` | Channel post + top-3 DMs |
| `fantracking/warnings/imageReport.js` | Warning image report delivery |
| `tasks/fanDeficitImageReport.js` | Fan deficit report channel post |

---

## Design Principle

Announcer is stateless with respect to notification logic.

By the time Announcer is called, every decision has already been made:
- Inspector decided the notification qualifies.
- Archive claimed it and produced the delivery plan.
- Fabricator will render the card on request.

Announcer's only job is to execute the delivery plan faithfully, mark each step in
Archive when it succeeds, and leave the rest to the next Broker run when it fails.

This makes Announcer simple, auditable, and independently testable — it can be run
against any Archive record with a mock Discord client and a mock Fabricator.

---

## Version History

- `v1.0` — Initial Announcer specification
