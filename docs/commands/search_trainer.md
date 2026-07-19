# /search_trainer

Search the trainer card database by name, rank, or skill count.

## Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `trainer` | String | ❌ | Trainer name to search for |
| `rank` | Integer | ❌ | Filter by trainer rank |
| `whiteskills` | Integer | ❌ | Filter by number of white skills |

## Behavior
- Reply is restricted to the `#uma-results` channel.
- Returns paginated, interactive results you can browse through.
- Reply is ephemeral (only visible to the user who ran it).

## Example
```
/search_trainer trainer:SmartFalcon
/search_trainer rank:1
/search_trainer whiteskills:3
```
