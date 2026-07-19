# /set_fans

Set the fan gain requirement for a specific circle and time period, or view current quota status.

## Permissions
> 🔒 Requires **Manage Guild**

## Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `status` | Boolean | ❌ | Show current quota settings instead of changing them |
| `circle` | Choices | ❌ | Which circle to configure (defaults to the primary circle) |
| `scope` | Choices | ❌ | `daily`, `weekly`, or `monthly` |
| `amount` | Choices | ❌ | Preset fan amount to set |
| `custom_amount` | Integer | ❌ | Custom fan amount (overrides `amount`) |

## Behavior
- Reply is ephemeral (only visible to the user who ran it).
- After setting a quota, posts a confirmation image and shows an impact check of how many current members would be below the new threshold.
- Use `status:true` to view the current quota configuration without making changes.

## Example
```
/set_fans status:true
/set_fans scope:daily custom_amount:50000
/set_fans scope:monthly amount:1500000 circle:UmaKraft
```
