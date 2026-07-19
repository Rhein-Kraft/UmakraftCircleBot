# /profile

Show a full profile dashboard for a circle member — tracking info, fan gains, personal records, and monthly history.

## Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `member` | User | ❌ | Discord member to look up (defaults to yourself) |
| `trainer` | String | ❌ | Uma.moe trainer name — supports autocomplete, includes past members |
| `circle` | Choices | ❌ | Which circle to check (defaults to the primary circle) |

## Behavior
- Renders and posts a detailed image profile card.
- Includes: current fan gain stats, personal records, milestone badges, and a month-by-month history chart.
- Leave all options blank to view your own profile.

## Example
```
/profile
/profile member:@Trainer
/profile trainer:SmartFalcon circle:UmaKraft
```
