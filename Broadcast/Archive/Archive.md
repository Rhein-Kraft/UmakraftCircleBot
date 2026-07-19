# Archive

## Purpose

The **Archive** is the notification state store of the Broadcast pipeline.

Archive is pure storage. It holds no pipeline logic, makes no decisions, and performs
no eligibility checks. It stores exactly what Inspector writes and serves exactly what
Announcer and Broker request.

Its schema and interface are designed so that the full delivery state of every
notification is visible at a glance and recoverable after a bot restart.

---

## Responsibilities

Archive has four responsibilities and no others:

1. **Store** — accept a new notification record written by Inspector.
2. **Serve** — return a notification record to Announcer by `notificationKey`.
3. **Surface** — return incomplete records (any delivery flag = 0) to Broker for restart recovery.
4. **Prune** — delete records older than the retention window on a scheduled basis.

Archive does not evaluate eligibility, resolve recipients, select variants, render
content, or send to Discord.

---

## Who Calls Archive

| Operation | Caller | Description |
|---|---|---|
| `INSERT` new record | Inspector only | Full notification record written on approval |
| `SELECT` by key | Announcer | Read the full delivery plan and payload |
| `UPDATE` delivery flag | Announcer only | Mark each step complete after success |
| `INSERT` history row | Announcer only | Append delivery attempt outcome |
| `SELECT` incomplete | Broker only | Find records with any flag = 0 for restart recovery |
| `DELETE` old records | Scheduled prune | Age-based retention cleanup |

No other department reads or writes Archive directly.

---

## Schema

### `broadcast_claims` table

One record per notification event. Primary key is `notification_key`.
Created by Inspector via `INSERT OR IGNORE` — a second insert for the same key is a no-op.

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
  payload_json      TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bc_type_circle
  ON broadcast_claims(type, circle_id);

CREATE INDEX IF NOT EXISTS idx_bc_incomplete
  ON broadcast_claims(channel_sent, dm_member_sent, dm_leader_sent);
```

`payload_json` stores the full notification record serialized by Inspector — recipients,
variant selection, image parameters, and message content. Announcer reads this to
execute the delivery plan without re-running Inspector.

### `broadcast_history` table

Append-only audit log. One row per delivery step attempt. Written by Announcer only.

```sql
CREATE TABLE IF NOT EXISTS broadcast_history (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_key  TEXT    NOT NULL,
  step              TEXT    NOT NULL,
  outcome           TEXT    NOT NULL,
  discord_code      INTEGER,
  attempted_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  detail            TEXT,
  FOREIGN KEY (notification_key) REFERENCES broadcast_claims(notification_key)
);

CREATE INDEX IF NOT EXISTS idx_bh_key ON broadcast_history(notification_key);
```

`step` values: `'channel'` | `'dm_member'` | `'dm_leader'`
`outcome` values: `'success'` | `'failure'`

---

## Interface

```javascript
// Called by Inspector: insert a new notification record
// Uses INSERT OR IGNORE — safe to call multiple times for the same key
await archive.insert(record)
/*
  record = {
    notificationKey,  type,  circleId,
    recipients,       payload
  }
*/

// Called by Announcer: read a full notification record
const record = await archive.get(notificationKey)

// Called by Broker: find all incomplete records for a circle (any flag = 0)
const records = await archive.getIncomplete(circleId)

// Called by Announcer: mark a delivery step complete
await archive.markChannelSent(notificationKey, { channelMsgId, channelId, guildId })
await archive.markDmMemberSent(notificationKey)
await archive.markDmLeaderSent(notificationKey)

// Called by Announcer: append a delivery attempt to the history log
await archive.recordHistory(notificationKey, { step, outcome, discordCode, detail })

// Called by scheduled task: remove records older than retention window
await archive.prune({ olderThanDays })

// Initialize database and run migrations
await archive.init()
```

---

## Adapter Contract

Archive is implemented via an adapter so local development and tests use an in-memory
store without touching SQLite.

```javascript
// In-memory adapter (tests and local dev)
const archive = createArchiveAdapter('inmemory')

// SQLite adapter (production)
const archive = createArchiveAdapter('sqlite', { dbPath })
```

Both adapters implement the full interface with identical semantics. The in-memory
adapter is not durable — data is lost on process exit.

---

## Migration from Existing Databases

The Archive unifies three separate notification databases that currently exist in production:

| Current file | Current table(s) | Migrates to Archive |
|---|---|---|
| `fantracking/milestone/db.js` | `milestone_fired` | `broadcast_claims` + `broadcast_history` |
| `fantracking/warnings/db.js` | `warning_state`, `warning_history` | `broadcast_claims` + `broadcast_history` |
| `fantracking/achievements/db.js` | `member_achievements` | `broadcast_claims` + `broadcast_history` |

**Migration rules on first boot:**
- Records with all delivery flags = 1 → import as fully sent (dedup protection preserved)
- Records with any delivery flag = 0 → import as incomplete (Broker will surface them for Announcer retry)
- `payload_json` is reconstructed from the existing record where possible; otherwise
  the record is marked as fully sent to avoid a broken retry

---

## Restart-Safety Illustration

```text
Scenario: Bot restarts after channel post succeeds but before DMs are sent.

broadcast_claims record:
  notification_key = "daily-warning:circle-001:2026-07-19"
  channel_sent     = 1   ← done
  dm_member_sent   = 0   ← not done
  dm_leader_sent   = 0   ← not applicable (null recipients)

On next Broker.run():
  archive.getIncomplete('circle-001')
  → returns this record
  → Broker routes notificationKey to Announcer

Announcer reads record:
  → channel step:    flag=1, skip
  → member DM step:  flag=0, execute → markDmMemberSent() on success
  → leader DM step:  no recipient, skip

Result: no duplicate channel post, no missed DMs.
```

---

## Design Principle

Archive is a ledger, not a processor.

Every record in Archive was written by Inspector — meaning it was explicitly approved,
deduplicated, and had its delivery plan resolved before it was stored. Announcer
trusts the record completely and delivers without re-evaluating anything.

The atomic `INSERT OR IGNORE` on `notification_key` is the single guarantee that
prevents duplicate notifications. Everything else in the Broadcast pipeline depends
on this guarantee holding.

---

## Current Source Files

Logic and schema extracted into Archive from these files:

| Current file | Archive responsibility |
|---|---|
| `fantracking/milestone/db.js` | Claim record, `channel_sent`/`dm_*_sent` flags, `milestone_fired` schema |
| `fantracking/warnings/db.js` | Warning state per trainer per day, `warning_history` audit log |
| `fantracking/achievements/db.js` | Achievement record per trainer per tier per month |

---

## Version History

- `v1.0` — Initial Archive specification
- `v1.1` — Redefined as pure storage: Inspector is sole record creator; Announcer is
  sole flag updater; Broker is sole incomplete-record reader; no pipeline logic in Archive
