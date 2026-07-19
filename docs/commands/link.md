# /link

Link a Discord account to an Uma.moe trainer name so the bot can track that member's fan gains.

## Permissions
> 🔒 Requires **Manage Guild**

## Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `circle` | Choices | ❌ | Which circle to link in (defaults to the primary circle) |
| `trainer` | String | ❌ | Uma.moe trainer name — supports autocomplete |
| `trainer_id` | String | ❌ | Uma.moe trainer ID (alternative to name) |
| `member` | User | ❌ | Discord member to link (defaults to yourself) |

## Behavior
- Reply is ephemeral (only visible to the user who ran it).
- Creates a persistent mapping between the Discord user and their Uma.moe trainer account.
- Required before the bot can show fan gain stats for that member.

## Example
```
/link trainer:SmartFalcon member:@Trainer
/link trainer_id:974470619
```
