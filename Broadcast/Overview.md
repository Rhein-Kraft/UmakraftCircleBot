# Broadcast Architecture Overview

## Purpose

The **Broadcast** directory is the event-notification pipeline of UmaKraft Circle Bot.

It handles all push notifications — greetings, warnings, achievements, milestones,
leaderboard announcements, and offline checks — that fire automatically based on a
cron schedule or a data threshold without any user request.

Broadcast is a sibling of Workshop, not an extension of it. Both consume data from
`Refinery/Depot`, but they serve entirely different models:

| | Workshop | Broadcast |
|---|---|---|
| **Trigger** | User runs a slash command | Cron fires or data threshold crossed |
| **Recipients** | One (the requester) | Many (channel + N member DMs + leader DM) |
| **Dedup** | Not needed | Critical — Archive prevents double-fires across restarts |
| **State** | Stateless | Stateful — Inspector claims in Archive; Announcer marks each step |
| **Retry** | Discord handles | Announcer retries flagged steps found by Broker on restart |

---

## Pipeline

```text
Refinery/Depot
     │
     ▼  ← Broker fetches raw computed data
  Broker
     │  ← passes raw data to Inspector
     ▼
  Inspector
     │  ← if approved: writes full notification record to Archive
     │  ← if rejected: drops cleanly, nothing written
     ▼
  Archive  (pure storage)
     │  ← Announcer reads the notification record
     ▼
  Announcer
     │  ← render card → post channel → send DMs → update Archive flags
     ▼
  Discord (channel posts, member DMs, leader DMs)
```

On bot restart, Broker reads Archive for records with any delivery flag still at 0
and routes those directly to Announcer — skipping Inspector entirely, since those
notifications were already approved and claimed before the restart.

---

## Department Responsibilities

### Broker

The entry point of the Broadcast pipeline. Broker is triggered by a cron schedule
or data threshold event. When triggered, it fetches the relevant compiled data from
`Refinery/Depot` and hands it to Inspector as raw input.

Broker does not decide whether a notification should fire — that is Inspector's job.
It only knows **when** to run and **what data to fetch**.

On restart, Broker also reads Archive for incomplete delivery records (any flag = 0)
and routes those directly to Announcer for retry — bypassing Inspector since those
notifications were already approved.

### Inspector

The decision-maker and the sole creator of Archive records.

Inspector receives raw Refinery data from Broker and runs every check in order:

1. **Eligibility** — does the data meet the threshold? Grace period over? Tally still open?
2. **Dedup** — does an Archive record for this `notificationKey` already exist?
3. **Recipient resolution** — which channels, which member DMs, whether leader DM needed
4. **Variant selection** — picks message content and image parameters from the pool

If any check fails → Inspector rejects the job cleanly. Nothing is written.

If all checks pass → Inspector writes the full notification record (delivery plan +
payload + flags all at 0) to Archive, then passes the `notificationKey` to Announcer.

Inspector is the **only** department that creates new Archive records.

### Archive

Pure storage. Archive holds notification records and delivery state. It contains no
pipeline logic — it only stores what Inspector writes and serves what Announcer reads.

Three callers, three distinct operations:

| Operation | Caller |
|---|---|
| `INSERT` new notification record | Inspector only |
| `UPDATE` delivery flags (`channel_sent`, `dm_member_sent`, `dm_leader_sent`) | Announcer only |
| `SELECT` incomplete records for restart recovery | Broker only |
| `SELECT` notification record by key | Announcer only |
| `INSERT` delivery history row | Announcer only |

Archive exposes a clean interface for each caller. No caller reaches into the database
directly — all access goes through Archive's interface.

### Announcer

The delivery engine. Announcer receives a `notificationKey` from Inspector (new delivery)
or from Broker (restart recovery retry). It reads the full notification record from Archive,
then executes the delivery plan step by step.

For each step:
1. Check the flag — if already 1, skip.
2. Execute the step (render card, post to channel, send DM).
3. On success → update the flag in Archive → append history row.
4. On failure → log the error → leave the flag at 0 → return (Broker will surface
   the record again on the next run for retry).

Announcer never re-evaluates eligibility. It delivers what Archive holds, exactly once
per step, regardless of how many times it is called.

---

## Restart-Safety Contract

```text
Bot restarts mid-delivery (channel posted, DMs not yet sent):

  Archive record:
    channel_sent   = 1   ← already done, skip
    dm_member_sent = 0   ← not yet done
    dm_leader_sent = 0   ← not yet done

  On next Broker run:
    Broker reads Archive.getIncomplete()
    → routes record to Announcer (skips Inspector)
    Announcer checks each flag:
    → channel step: flag=1, skip
    → member DM step: flag=0, execute
    → leader DM step: flag=0, execute
    Result: no duplicate channel post; no missed DMs
```

---

## Relationship with Other Directories

| | Direction | What is exchanged |
|---|---|---|
| `Refinery/Depot` | Broker reads | Compiled products, computed threshold values |
| `Workshop/Fabricator` | Announcer calls | Image card render requests (Fabricator renders, Announcer delivers) |
| `Broadcast/Archive` | Inspector writes; Announcer reads + updates; Broker reads on restart | Notification records and delivery flags |
| Discord | Announcer writes | Channel posts, member DMs, leader DMs |

Broadcast never imports from Workshop/Terminal, Distribution, or Umamoe.

---

## Adding a New Notification Type

1. **Inspector** — add the eligibility rule, dedup key format, recipient resolver, and variant pool
2. **Archive** — add the Archive schema entry if a new `notificationKey` format is needed (usually the existing schema covers it)
3. **Workshop/Fabricator** — add the render template for the image card
4. **Announcer** — add the delivery handler for the new type
5. **Broker** — add the data fetch logic and cron registration
6. **`tasks/index.js`** — register the cron schedule

No other directory needs to change.

---

## Version History

- `v1.0` — Initial Broadcast architecture specification
- `v1.1` — Clarified department boundaries: Inspector is sole Archive writer; Broker is
  data courier only; Archive is pure storage; Announcer reads Archive to execute delivery
