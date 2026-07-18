# Members Pagination Contract Extension

This document specifies the contract extension for scalable member querying and filtering on the `GET /v1/members` endpoint.

## Endpoint
`GET /v1/members`

## Request Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `cursor` | `string` | No | A cursor or offset identifying the page starting point. |
| `limit` | `integer` | No | The maximum number of members to return. Defaults to `100`. |
| `filter` | `string` | No | Case-insensitive query string to filter members by wallet address. |

## Response Formats

The client automatically detects the response format using capability detection.

### Standard Paginated Format (New)
When pagination query parameters are supplied, the backend should return a JSON object with the following structure:

```json
{
  "members": [
    {
      "address": "0x0000000000000000000000000000000000000001",
      "roles": ["admin"],
      "tier": "pro",
      "active": true
    }
  ],
  "nextCursor": "100"
}
```

- `members`: An array of MemberRow objects.
- `nextCursor`: A string that should be passed as the `cursor` query parameter to fetch the next page of results, or `null`/`undefined` if there are no more pages.

### Flat Array Format (Fallback / Backward Compatible)
If the backend does not support pagination parameters, it can fall back to returning a flat JSON array of all members:

```json
[
  {
    "address": "0x0000000000000000000000000000000000000001",
    "roles": ["admin"],
    "tier": "pro",
    "active": true
  }
]
```
In this scenario, the integration client detects the array type and performs pagination/filtering client-side to preserve system usability without crashing.
