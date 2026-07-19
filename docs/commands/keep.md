# /keep

Mark a trainer card entry as permanently kept in the database, preventing automatic expiry.

## Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `trainer_id` | String | ✅ | The Uma.moe trainer ID to mark as permanent |

## Behavior
- Reply is ephemeral (only visible to the user who ran it).
- By default, trainer card entries are removed after 72 hours of inactivity.
- Using `/keep` flags the entry as permanent so it is never automatically deleted.

## Example
```
/keep trainer_id:974470619
```
