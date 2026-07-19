# /store

Save your trainer card to the bot database by trainer ID.

## Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `trainer_id` | String | ✅ | Your Uma.moe trainer ID |

## Behavior
- Reply is ephemeral and restricted to the `#uma-store` channel.
- Scrapes your trainer's support card skills from uma.moe and stores the result.
- Renders and posts a confirmation image summarising the stored card data.
- Entries expire after 72 hours unless marked permanent with `/keep`.

## Example
```
/store trainer_id:974470619
```
