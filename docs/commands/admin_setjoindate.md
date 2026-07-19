# /admin_setjoindate

Manually override the join date recorded for a circle member.

## Permissions
> 🔒 Requires **Manage Guild**

## Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `date` | String | ✅ | New join date in `YYYY-MM-DD` format |
| `member` | User | ❌ | Discord member to update |
| `trainer` | String | ❌ | Uma.moe trainer name to update |

## Behavior
- Reply is ephemeral (only visible to the user who ran it).
- Updates the stored join date in the bot database (`store`).
- Use when a member's join date was recorded incorrectly or needs a manual correction.

## Example
```
/admin_setjoindate date:2025-04-01 member:@TrainerName
```
