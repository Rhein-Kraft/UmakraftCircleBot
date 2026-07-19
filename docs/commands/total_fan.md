# /total_fan

Show a member's lifetime total fan count and their current circle rank.

## Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `member` | User | ❌ | Discord member to look up (defaults to yourself) |
| `trainer` | String | ❌ | Uma.moe trainer name to look up |
| `circle` | Choices | ❌ | Which circle to check (defaults to the primary circle) |

## Behavior
- Renders and posts an image report showing the member's all-time total fan count and their rank within the circle.
- Leave all options blank to check your own totals.

## Example
```
/total_fan
/total_fan member:@Trainer
/total_fan trainer:SmartFalcon
```
