# Announcer

## Purpose

The **Announcer** is the final stage of the Broadcast pipeline — the delivery engine.

Announcer receives a `notificationKey` (from Inspector on first delivery, or from
Broker on restart recovery), reads the full notification record from Archive, and
executes the delivery plan step by step: rendering the image card, posting to the
Discord channel, and sending DMs to each qualifying recipient.

After each successful step, Announcer updates the corresponding flag in Archive.
If a step fails, Announcer leaves the flag at 0 and returns — the next Broker run
will surface the incomplete record and call Announcer again.

---

## Responsibilities

1. **Read from Archive** — receive a `notificationKey` and fetch the full notification
   record (delivery plan + payload + current flag states) from Archive.

2. **Check each flag** — for each delivery step, check whether the flag is already 1.
   If yes, skip that step entirely. This is what prevents duplicate sends on retry.

3. **Render image card** — request the image card from `Workshop/Fabricator` using the
   `imageParams` stored in the Archive record. Announcer does not render cards itself.

4. **Post to channel** — post the rendered card and message text to each configured
   Discord channel in the recipients list. On success → `Archive.markChannelSent()`.

5. **Send member DMs** — send the individual DM to each `viewerId` in `memberDms`.
   On success → `Archive.markDmMemberSent()`.

6. **Send leader DM** — send the leader DM if `leaderDm` is set in the recipients.
   On success → `Archive.markDmLeaderSent()`.

7. **Record history** — after each step attempt (success or failure) →
   `Archive.recordHistory()` with outcome and Discord error code if applicable.

Announcer never evaluates eligibility, checks dedup, selects variants, or writes
new claim records. It delivers what Archive holds, exactly once per step.

---

## Input

A `notificationKey` string. Announcer fetches everything else from Archive.

```javascript
await announcer.deliver(notificationKey, client)
```

The full record Announcer reads from Archive:

```json
{
  "notificationKey": "daily-warning:circle-001:2026-07-19",
  "type": "dailyWarning",
  "circleId": "circle-001",
  "claimedAt": "2026-07-19T23:45:01.000Z",
  "channelSent": 0,
  "dmMemberSent": 0,
  "dmLeaderSent": 0,
  "recipients": {
    "channels": ["channel-id-1"],
    "memberDms": ["viewer-id-1", "viewer-id-2"],
    "leaderDm": null
  },
  "payload": {
    "variant": 12,
    "fanTotal": 842000,
    "goal": 1000000,
    "message": "Your daily fan gain did not reach the goal...",
    "imageParams": { "type": "dailyWarning", "fanTotal": 842000, "goal": 1000000 }
  }
}
```

---

## Delivery Steps

Steps always run in this fixed order. Each step is skipped if its flag is already 1.

```text
1. render card       Workshop/Fabricator.render(payload.imageParams) → Buffer
2. post to channel   client.channel.send(embed + attachment)
                     → Archive.markChannelSent()
                     → Archive.recordHistory('channel', 'success')
3. send member DMs   utils/dm.dmByViewerId(viewerId, ...) for each recipient
                     → Archive.markDmMemberSent()
                     → Archive.recordHistory('dm_member', 'success')
4. send leader DM    utils/dm.dmLeader(circleId, ...)  [if recipients.leaderDm is set]
                     → Archive.markDmLeaderSent()
                     → Archive.recordHistory('dm_leader', 'success')
```

---

## Failure Handling

When a Discord API call fails at any step:

- Log the error with `notificationKey`, step name, and Discord error code.
- Call `Archive.recordHistory(notificationKey, { step, outcome: 'failure', discordCode })`.
- Leave the delivery flag at 0.
- Return immediately — do not retry in the same run.

On the next Broker cron tick, `Archive.getIncomplete()` will surface this record
again and Broker will call `Announcer.deliver()` again. Only the failed step will
be re-attempted — steps already at flag = 1 are skipped.

Announcer never enters a retry loop itself. Retry cadence is the Broker cron interval.

---

## Render Delegation

Announcer calls `Workshop/Fabricator` to render image cards. It passes `imageParams`
from the Archive record and receives a `Buffer` back.

```javascript
const cardBuffer = await fabricator.render(record.payload.imageParams)
const attachment = bufferToAttachment(cardBuffer, buildReportFilename(record.type))
```

Fabricator renders — Announcer delivers. Announcer never contains HTML, SVG, canvas,
or Playwright code. That boundary is absolute.

---

## Interface

```javascript
// Deliver a notification. Called by Inspector (new) or Broker (restart recovery).
await announcer.deliver(notificationKey, client)

// Internal step handlers
await announcer._postChannel(record, cardBuffer, client)
await announcer._sendMemberDms(record, cardBuffer, client)
await announcer._sendLeaderDm(record, cardBuffer, client)
```

---

## Workflow

```text
Inspector writes Archive record → passes notificationKey to Announcer
                              OR
Broker reads Archive.getIncomplete() → passes notificationKey to Announcer

     │
     ▼
Announcer.deliver(notificationKey, client)
     │
     ├── record = Archive.get(notificationKey)
     │
     ├── record.channelSent = 0?
     │     → Fabricator.render(imageParams) → buffer
     │     → post to each channel
     │     → Archive.markChannelSent()
     │     → Archive.recordHistory('channel', 'success')
     │
     ├── record.dmMemberSent = 0?
     │     → for each viewerId in recipients.memberDms:
     │         → dm.dmByViewerId(viewerId, embed + attachment)
     │     → Archive.markDmMemberSent()
     │     → Archive.recordHistory('dm_member', 'success')
     │
     └── record.dmLeaderSent = 0 AND recipients.leaderDm set?
           → dm.dmLeader(circleId, embed + attachment)
           → Archive.markDmLeaderSent()
           → Archive.recordHistory('dm_leader', 'success')
```

---

## Design Principle

Announcer is stateless and trustful.

By the time Announcer is called, every decision has already been made and recorded:
Inspector approved the notification and wrote the delivery plan to Archive. Announcer
reads that plan and executes it faithfully without questioning it.

This makes Announcer independently testable — call it with any Archive record and a
mock Discord client, and it will attempt exactly the steps the record specifies.
No eligibility logic, no dedup queries, no variant pools. Just execute, flag, and return.

---

## Current Source Files

Delivery logic extracted into Announcer from these files.
Note: the render portions of these files move to `Workshop/Fabricator/renders/`.

| Current file | Delivery logic → Announcer |
|---|---|
| `fantracking/milestone/notifier.js` | `sendChannelAnnouncement()`, DM sends, `retrySends()` |
| `fantracking/leaderboard/announcements.js` | Channel post + top-3 DMs |
| `fantracking/warnings/imageReport.js` | Warning image report channel post |
| `tasks/fanDeficitImageReport.js` | Fan deficit report channel post |

---

## Version History

- `v1.0` — Initial Announcer specification
- `v1.1` — Announcer now reads from Archive by notificationKey; does not receive
  payload directly from Inspector; all delivery state sourced from Archive only
