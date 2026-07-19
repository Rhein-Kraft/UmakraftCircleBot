# /fan_gain

Show daily, weekly, and monthly fan gain for a member, plus their daily ranking.

## Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `member` | User | ❌ | Discord member to look up (defaults to yourself) |
| `trainer` | String | ❌ | Uma.moe trainer name — supports autocomplete |
| `circle` | Choices | ❌ | Which circle to check (defaults to the primary circle) |

## Behavior
- Renders and posts an image report showing daily, weekly, and monthly gain figures alongside the member's current daily rank.
- Leave all options blank to check your own stats.

## Example
```
/fan_gain
/fan_gain member:@Trainer
/fan_gain trainer:SmartFalcon
```
