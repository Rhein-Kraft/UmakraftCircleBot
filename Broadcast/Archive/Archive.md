# Archive

## Purpose

The **Archive** is the notification state store of the Broadcast pipeline.

It makes the entire pipeline restart-safe. Every notification that passes Inspector
is claimed atomically in Archive before a single Discord message is sent. Per-step
delivery flags track exactly which steps have been completed, so a bot restart mid-delivery
never causes a duplicate send or a missed send.

---

## Responsibilities

1. **Claim** — accept an atomic INSERT for each validated notification envelope.
   Uses `INSERT OR IGNORE` so a second Broker run for the same notification key
   is a no-op. A record in Archive means "this notification has been approved to send."

2. **Track delivery flags** — maintain three boolean flags per record, each updated
   by Announcer after the corresponding step succeeds:
   - `channel_sent` — announcement posted to the Discord channel
   - `dm_member_sent` — personal DM(s) sent to qualifying members
   - `dm_leader_sent` — DM sent to the circle leader (where applicable)

3. **Surface incomplete records** — return records with any flag still at 0 to Broker
   on restart so Announcer can retry only the outstanding steps.

4. **History log** — append an entry to the audit log after each delivery attempt,
   recording the outcome (success, failure, Discord error code).

5. **Pruning** — age-based retention cleanup to prevent unbounded growth. Old records
   beyond the retention window are deleted on a scheduled basis.

Archive is the only department in Broadcast that writes to a persistent database.

---

## Schema

### `broadcast_claims` table

Stores one record per notification event. Primary key is `notification_key`.

```sql
CREATE TABLE IF NOT EXISTS broadcast_claims (
  notification_key  TEXT    NOT NULL PRIMARY KEY,
  type              TEXT    NOT NULL,
  circle_id         TEXT    NOT NULL,
  claimed_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  channel_sent      INTEGER NOT NULL DEFAULT 0,
  dm_member_sent    INTEGER NOT NULL DEFAULT 0,
  dm_leader_sent    INTEGER NOT NULL DEFAULT 0,
  channel_msg_id    TEXT,
  channel_id        TEXT,
  guild_id          TEXT,
  payload_json      TEXT
);
CREATE INDEX IF NOT EXISTS idx_bc_type_circle
  ON broadcast_claims(type, circle_id);
CREATE INDEX IF NOT EXISTS idx_bc_incomplete
  ON broadcast_claims(channel_sent, dm_member_sent, dm_leader_sent)
  WHERE channel_sent = 0 OR dm_member_sent = 0 OR dm_leader_sent = 0;
```

### `broadcast_history` table

Append-only audit log. One row per delivery attempt per step.

```sql
CREATE TABLE IF NOT EXISTS broadcast_history (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_key  TEXT    NOT NULL,
  step              TEXT    NOT NULL,   -- 'channel' | 'dm_member' | 'dm_leader'
  outcome           TEXT    NOT NULL,   -- 'success' | 'failure'
  discord_code      INTEGER,
  attempted_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  detail            TEXT
);
CREATE INDEX IF NOT EXISTS idx_bh_key ON broadcast_history(notification_key);
```

---

## Interface

```javascript
// Atomically claim a notification; returns { claimed: true } or { claimed: false } (already exists)
await archive.claim(notificationKey, { type, circleId, payloadJson })

// Mark a delivery step as complete
await archive.markChannelSent(notificationKey, { channelMsgId, channelId, guildId })
await archive.markDmMemberSent(notificationKey)
await archive.markDmLeaderSent(notificationKey)

// Return records with any delivery flag still at 0 for a given circle
await archive.getIncomplete(circleId)

// Append a delivery attempt to the history log
await archive.recordHistory(notificationKey, { step, outcome, discordCode, detail })

// Delete records older than the retention window
await archive.prune({ olderThanDays })

// Initialize the database and run migrations
await archive.init()
```

---

## Existing Archive Implementations

The Archive pattern is already in production across three separate databases.
The Broadcast/Archive unification consolidates them into one interface and one database:

| Current file | Table(s) | Migrates to |
|---|---|---|
| `fantracking/milestone/db.js` | `milestone_fired` | `broadcast_claims` + `broadcast_history` |
| `fantracking/warnings/db.js` | `warning_state`, `warning_history` | `broadcast_claims` + `broadcast_history` |
| `fantracking/achievements/db.js` | `member_achievements` | `broadcast_claims` + `broadcast_history` |

> **Migration note:** Existing rows in `milestone_fired` and `warning_state` must be
> backfilled into `broadcast_claims` on first boot to preserve dedup guarantees.
> Records with all flags = 1 are imported as fully sent. Records with any flag = 0
> are imported as incomplete so Announcer will retry them.

---

## Adapter Contract

Archive is implemented via an adapter so local development and tests can use an
in-memory store without touching SQLite.

```javascript
// In-memory adapter (tests and local dev)
const archive = createArchiveAdapter('inmemory')

// SQLite adapter (production)
const archive = createArchiveAdapter('sqlite', { dbPath: config.dataDir + '/broadcast.db' })
```

Both adapters must implement the full interface above with identical semantics.

---

## Restart-Safety Guarantee

```text
Bot restarts mid-delivery (e.g. channel posted, DM not yet sent):

  broadcast_claims record:
    channel_sent   = 1   ← already done
    dm_member_sent = 0   ← not yet done
    dm_leader_sent = 0   ← not yet done

  On next Broker.run():
    archive.getIncomplete(circleId) returns this record
    → Announcer retries ONLY dm_member_sent and dm_leader_sent steps
    → No duplicate channel post (channel_sent = 1 is respected)
```

---

## Workflow

```text
Inspector (validated envelope)
     │
     ▼
Archive.claim(notificationKey, ...)
  INSERT OR IGNORE → channel_sent=0, dm_member_sent=0, dm_leader_sent=0
     │
     ▼
Announcer executes delivery plan
  → Archive.markChannelSent()    after channel post
  → Archive.markDmMemberSent()   after member DMs
  → Archive.markDmLeaderSent()   after leader DM
     │
     ▼
Archive.recordHistory()  after each step (success or failure)
```

---

## Design Principle

Archive is a ledger, not a processor.

It records what has been approved to send and what has been delivered. It does not
evaluate whether a notification should fire — that is Inspector's job. It does not
send anything — that is Announcer's job.

The atomic claim step is the contract boundary: once a `notification_key` exists in
Archive, it will be delivered exactly once per step, regardless of how many times
Broker runs or how many times the bot restarts.

---

## Version History

- `v1.0` — Initial Archive specification
