# /link_list

Show a paginated list of all linked Discord members and their associated Uma.moe trainer accounts.

## Permissions
> 🔒 Requires **Manage Guild**

## Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `page` | Integer | ❌ | Page number to view (defaults to 1) |

## Behavior
- Renders and posts a paginated image report.
- Each page lists Discord usernames alongside their linked Uma.moe trainer names and IDs.
- Useful for auditing links and finding unlinked or incorrectly linked members.

## Example
```
/link_list
/link_list page:2
```
