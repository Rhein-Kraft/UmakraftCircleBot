# /memberlist

Show the full circle roster — active members and former members with their last active date.

## Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `list` | Boolean | ❌ | Show the full roster (active + former members) |
| `member` | User | ❌ | Discord member to look up |
| `trainer` | String | ❌ | Uma.moe trainer name to look up — includes past members |

## Behavior
- Sources data from `PastHistoryTrainer.md` for historical accuracy.
- **Single lookup:** Shows join date and activity info for one member.
- **List mode (`list:true`):** Renders the full roster including former members with their last recorded active date.
- Replaces and extends the functionality of `/joindate`.

## Example
```
/memberlist
/memberlist list:true
/memberlist trainer:SmartFalcon
```
