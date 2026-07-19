# /unlink

Remove the link between a Discord account and their Uma.moe trainer name.

## Permissions
> 🔒 Requires **Manage Guild**

## Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `member` | User | ❌ | Discord member to unlink (defaults to yourself) |

## Behavior
- Reply is ephemeral (only visible to the user who ran it).
- Removes the Discord ↔ Uma.moe mapping from the bot database.
- After unlinking, fan gain stats will no longer be tracked for that member until they are re-linked with `/link`.

## Example
```
/unlink
/unlink member:@Trainer
```
