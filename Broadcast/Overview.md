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
| **Dedup** | Not needed | Critical — survives bot restarts via Archive |
| **State** | Stateless | Stateful — claim → send channel → send DMs → confirm |
| **Retry** | Discord handles | Manual per-step retry via Archive flags |

---

## Pipeline

```text
Refinery/Depot
     │  (threshold data, compiled products)
     ▼
  Broker       ← receives trigger, creates notification job envelope
     │
     ▼
  Inspector    ← eligibility check, dedup check, recipient resolution, variant selection
     │  accept → proceed / reject → drop
     ▼
  Archive      ← atomic claim; sets channel_sent=0, dm_member_sent=0, dm_leader_sent=0
     │
     ▼
  Announcer    ← render card → post channel → send DMs → update Archive flags per step
     │
     ▼
Discord (channel posts, member DMs, leader DMs)
```

---

## Department Responsibilities

### Broker

The entry point for the Broadcast pipeline. Broker receives a trigger (cron tick or
threshold event from Refinery), creates a structured notification job envelope, and
manages the per-circle notification queue so one failing circle never blocks another.

Broker also runs the **boot-time silent-claim guard**: on the first cron tick after
a bot restart, qualifying notifications are claimed into Archive but no messages are
sent. This prevents a spam burst on fresh deploy or container reset.

On restart, Broker reads Archive for any records with delivery flags still at 0 and
routes them directly to Announcer — skipping Inspector entirely, since the notification
was already validated and claimed before the restart.

### Inspector

The gatekeeper. No notification reaches Archive or Announcer without passing Inspector.

Inspector runs every check in order:

1. **Eligibility check** — does the data meet the threshold? Is the grace period over?
   Is the tally window still open? (Reads pre-computed values from Refinery/Depot —
   does not re-implement business logic.)
2. **Dedup check** — has this notification already fired for today / this month / this
   escalation level? (Reads Archive.)
3. **Recipient resolution** — which channel(s), which member DMs, whether leader DM
   is needed.
4. **Variant selection** — picks one variant from the message pool for this notification
   type, personalizes text per recipient where applicable.

If any check fails, Inspector rejects the job cleanly. Nothing is written to Archive.
If all checks pass, Inspector outputs a validated notification envelope.

### Archive

The notification state store. Archive is the source of truth that makes the entire
Broadcast pipeline restart-safe.

Every notification that passes Inspector is **claimed atomically** in Archive before
a single Discord message is sent. This mirrors the pattern already implemented in
`milestoneDb.js`:

```text
claim (INSERT OR IGNORE)
  → channel_sent = 0
  → dm_member_sent = 0
  → dm_leader_sent = 0
```

Archive responsibilities:

- **Claim** — atomic INSERT so no second Broker run can double-fire the same notification
- **Track** — per-step delivery flags updated by Announcer after each step succeeds
- **History** — append-only audit log of every notification event and delivery outcome
- **Retry surface** — surfaces records with flags still at 0 to Broker on restart
- **Pruning** — age-based retention cleanup to prevent unbounded growth

Archive is the only department in Broadcast that writes to a database.

### Announcer

The delivery engine. Announcer receives a claimed Archive record (notification is
already validated and persisted) and executes the delivery plan that Inspector produced.

Delivery order for each notification:

1. Request image card render from `Workshop/Fabricator` if needed
2. Post to announcement channel(s); on success → `Archive.markChannelSent()`
3. Send DM to each qualifying member; on success → `Archive.markDmMemberSent()`
4. Send DM to leader if required; on success → `Archive.markDmLeaderSent()`

If a Discord API call fails, Announcer does not retry immediately. It leaves the flag
at 0 in Archive and lets the next Broker run route the record back to Announcer.
This keeps Announcer simple and stateless — all retry state lives in Archive.

---

## Restart-Safety Contract

The full restart-safety guarantee:

```text
Bot restarts mid-delivery
     │
     ▼
Broker reads Archive for records with any flag = 0
     │
     ▼
Announcer retries only the steps with flag = 0
(Inspector is not re-run — the claim already exists)
     │
     ▼
No duplicate sends for steps already flagged = 1
No missing sends for steps still flagged = 0
```

This contract is already proven in production by `milestone/milestones.js`.
The Broadcast pipeline formalizes it as a shared infrastructure for all notification types.

---

## Relationship with Other Directories

| | Direction | What is exchanged |
|---|---|---|
| `Refinery/Depot` | Broadcast reads | Compiled products, computed threshold values |
| `Workshop/Fabricator` | Announcer calls | Image card render requests (Fabricator renders, Announcer delivers) |
| `Broadcast/Archive` | Internal | Claim records, delivery flags, history |
| Discord | Announcer writes | Channel posts, member DMs, leader DMs |

Broadcast never imports from Workshop/Terminal, Distribution, or Umamoe.

---

## Adding a New Notification Type

1. Add the eligibility rule to `Broadcast/Inspector/`
2. Add the Archive schema (table + claim/flag functions) to `Broadcast/Archive/`
3. Add the render template to `Workshop/Fabricator/reports/`
4. Add the delivery handler to `Broadcast/Announcer/`
5. Add the Broker entry point (cron registration + job envelope) to `Broadcast/Broker/`
6. Register the cron schedule in `tasks/index.js`

No other directory needs to change.

---

## Version History

- `v1.0` — Initial Broadcast architecture specification
