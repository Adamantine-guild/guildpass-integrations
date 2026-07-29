# Governance API Contract

## Overview

This document describes the expected API contract for the Governance module in `guildpass-core`. The frontend (`guildpass-integrations`) uses these endpoints to enable community members to view proposals, cast votes, and admins to create and manage governance workflows.

The module is **feature-gated** behind `NEXT_PUBLIC_FEATURE_GOVERNANCE` (default `false`).

## Proposal Lifecycle

Proposals move through the following states:

- **draft**: Created by admin, not yet voting-active. Can be edited or deleted.
- **active**: Voting is open to community members. Cannot be edited.
- **closed**: Voting period has ended. Results are final.
- **resolved**: Outcome has been applied/executed (e.g., policy updated, resource added).

## Authentication

All governance endpoints require **SIWE authentication** (bearer token in `Authorization: Bearer <token>` header).

The authenticated address (`token.address`) is used to:
- Determine voting weight (via tier/role lookup)
- Authorize admin-only operations (checking `roles` in session)
- Track vote authorship

## Endpoints

### Member Queries (Read-Only)

#### GET /v1/governance/proposals

List active and recently-closed proposals.

**Query Parameters:**

- `filter` (optional): One of `draft`, `active`, `closed`, `resolved` — filters results to that status
- `limit` (optional, default 20): Number of results per page
- `cursor` (optional): Pagination cursor (opaque string)

**Response (200 OK):**

```json
{
  "proposals": [
    {
      "id": "prop_abc123",
      "communityId": "guildpass-demo",
      "type": "policy_change",
      "title": "Update member tier requirements",
      "description": "Propose lowering the Pro tier cost from $100 to $80/month",
      "status": "active",
      "proposer": "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
      "createdAt": "2026-07-28T10:00:00Z",
      "votingStartsAt": "2026-07-28T11:00:00Z",
      "votingEndsAt": "2026-08-04T11:00:00Z",
      "payload": {
        "policyType": "membership_tier",
        "changeType": "price_reduction",
        "tier": "pro",
        "oldPrice": 100,
        "newPrice": 80
      },
      "totalWeight": 250,
      "votesSummary": {
        "totalVotes": 42,
        "weightsFor": 180,
        "weightsAgainst": 50,
        "weightsAbstain": 20,
        "percentFor": 72,
        "percentAgainst": 20,
        "percentAbstain": 8
      }
    }
  ],
  "nextCursor": "offset_50"
}
```

---

#### GET /v1/governance/proposals/:id

Retrieve a single proposal with full details.

**Response (200 OK):** Same structure as above.

**Response (404 Not Found):**

```json
{
  "code": "not_found",
  "message": "Proposal not found"
}
```

---

#### GET /v1/governance/proposals/:id/votes

List all votes on a proposal (for transparency and audit).

**Query Parameters:**

- `limit` (optional, default 20)
- `cursor` (optional): Pagination cursor

**Response (200 OK):**

```json
{
  "votes": [
    {
      "id": "vote_xyz789",
      "proposalId": "prop_abc123",
      "voter": "0x94F68E164F64B8A2E2B9E7B1A3Ec5E7E3d8eB2A1",
      "choice": "for",
      "weight": 5,
      "voterContext": {
        "tier": "pro",
        "role": "member"
      },
      "votedAt": "2026-07-30T14:22:33Z"
    },
    {
      "id": "vote_xyz790",
      "proposalId": "prop_abc123",
      "voter": "0xF39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      "choice": "against",
      "weight": 2,
      "voterContext": {
        "tier": "standard",
        "role": "member"
      },
      "votedAt": "2026-07-30T15:45:12Z"
    }
  ],
  "nextCursor": "offset_20"
}
```

---

#### GET /v1/governance/proposals/:id/votes/my

Retrieve the authenticated member's vote on a proposal (if any).

**Response (200 OK):**

```json
{
  "id": "vote_xyz789",
  "proposalId": "prop_abc123",
  "voter": "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
  "choice": "for",
  "weight": 10,
  "voterContext": {
    "tier": "pro",
    "role": "moderator"
  },
  "votedAt": "2026-07-30T16:30:00Z"
}
```

**Response (204 No Content):** Member has not voted on this proposal.

---

### Member Mutations

#### POST /v1/governance/proposals/:id/vote

Cast or update a vote on an active proposal. Requires SIWE authentication.

**Request Body:**

```json
{
  "choice": "for"
}
```

Where `choice` is one of: `"for"`, `"against"`, `"abstain"`.

**Response (201 Created / 200 OK):**

```json
{
  "id": "vote_xyz789",
  "proposalId": "prop_abc123",
  "voter": "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
  "choice": "for",
  "weight": 10,
  "voterContext": {
    "tier": "pro",
    "role": "moderator"
  },
  "votedAt": "2026-07-30T16:30:00Z"
}
```

**Response (400 Bad Request):**
- Proposal is not active (already closed or not yet active)
- Invalid `choice` value

**Response (403 Forbidden):**
- Authenticated address is banned or lacks community membership

**Response (404 Not Found):**
- Proposal does not exist

---

### Admin Mutations

All admin mutations require:
- SIWE authentication
- Caller's session `roles` must include `"admin"`

#### POST /v1/governance/proposals

Create a new proposal in `draft` status.

**Request Body:**

```json
{
  "type": "policy_change",
  "title": "Update member tier requirements",
  "description": "Propose lowering the Pro tier cost from $100 to $80/month",
  "proposer": "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
  "votingStartsAt": "2026-08-01T10:00:00Z",
  "votingEndsAt": "2026-08-08T10:00:00Z",
  "payload": {
    "policyType": "membership_tier",
    "changeType": "price_reduction",
    "tier": "pro",
    "oldPrice": 100,
    "newPrice": 80
  }
}
```

**Response (201 Created):**

```json
{
  "id": "prop_abc123",
  "communityId": "guildpass-demo",
  "type": "policy_change",
  "title": "Update member tier requirements",
  "description": "...",
  "status": "draft",
  "proposer": "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
  "createdAt": "2026-07-28T10:00:00Z",
  "votingStartsAt": "2026-08-01T10:00:00Z",
  "votingEndsAt": "2026-08-08T10:00:00Z",
  "payload": { ... },
  "totalWeight": 0,
  "votesSummary": {
    "totalVotes": 0,
    "weightsFor": 0,
    "weightsAgainst": 0,
    "weightsAbstain": 0
  }
}
```

**Response (400 Bad Request):**
- Invalid proposal data (missing title, invalid dates, etc.)

**Response (403 Forbidden):**
- Caller is not an admin

---

#### PATCH /v1/governance/proposals/:id

Update a draft or closed proposal (in-flight voting cannot be edited).

**Request Body:** Any subset of non-immutable fields:

```json
{
  "title": "Updated proposal title",
  "description": "Updated description",
  "votingStartsAt": "2026-08-02T10:00:00Z",
  "votingEndsAt": "2026-08-09T10:00:00Z",
  "payload": { ... }
}
```

**Response (200 OK):** Updated proposal object.

**Response (400 Bad Request):**
- Proposal is active (voting is in progress)

**Response (403 Forbidden):**
- Caller is not an admin

**Response (404 Not Found):**
- Proposal does not exist

---

#### POST /v1/governance/proposals/:id/publish

Transition a draft proposal to `active`, opening voting.

**Request Body:** Empty `{}` or no body.

**Response (200 OK):**

```json
{
  "id": "prop_abc123",
  "status": "active",
  ...
}
```

**Response (400 Bad Request):**
- Proposal is not in draft status

**Response (403 Forbidden):**
- Caller is not an admin

**Response (404 Not Found):**
- Proposal does not exist

---

#### POST /v1/governance/proposals/:id/close

Close voting on an active proposal, transitioning to `closed`. Results are tallied but no outcome is yet applied.

**Request Body:** Empty `{}` or no body.

**Response (200 OK):**

```json
{
  "id": "prop_abc123",
  "status": "closed",
  ...
}
```

**Response (400 Bad Request):**
- Proposal is not active

**Response (403 Forbidden):**
- Caller is not an admin

---

#### POST /v1/governance/proposals/:id/resolve

Apply the outcome of a closed proposal and transition to `resolved`. This is primarily a notification/audit endpoint; actual state changes (e.g., updating a policy) happen on the backend when the outcome is applied.

**Request Body:**

```json
{
  "outcome": "approved"
}
```

The `outcome` field is a free-form string (e.g., `"approved"`, `"rejected"`, or a JSON-encoded summary of applied changes).

**Response (200 OK):**

```json
{
  "id": "prop_abc123",
  "status": "resolved",
  ...
}
```

**Response (403 Forbidden):**
- Caller is not an admin

**Response (404 Not Found):**
- Proposal does not exist

---

#### DELETE /v1/governance/proposals/:id

Delete a draft proposal. Admin only.

**Response (204 No Content):** Proposal deleted.

**Response (400 Bad Request):**
- Proposal is not in draft status

**Response (403 Forbidden):**
- Caller is not an admin

**Response (404 Not Found):**
- Proposal does not exist

---

## Voting Weight

When a member casts a vote, the backend determines the voter's weight as follows:

1. Look up the voter's membership and role in the community
2. Assign a base weight according to:
   - Tier weight: `free=1`, `standard=2`, `pro=3` (or configurable per community)
   - Role multiplier: `member=1x`, `moderator=2x`, `admin=3x` (or configurable)
3. Combined weight = `tier_weight × role_multiplier`

Example:
- A `pro` member with `moderator` role = `3 × 2 = 6` weight
- A `free` member with no special role = `1 × 1 = 1` weight

The `totalWeight` on a proposal is the sum of all members' possible voting weights in the community. This allows calculation of `percentFor`, `percentAgainst`, etc.

---

## Error Handling

### Standard Error Responses

All endpoints return error responses in this format:

```json
{
  "code": "error_code_here",
  "message": "Human-readable error message"
}
```

**Common Codes:**

- `not_found`: Resource (proposal, vote, etc.) not found
- `bad_request`: Invalid input data or validation failure
- `unauthorized`: Missing or invalid SIWE token
- `forbidden`: Authenticated user lacks required permissions (e.g., not admin)
- `conflict`: State conflict (e.g., trying to vote on a closed proposal)
- `service_unavailable`: Backend governance service temporarily unavailable

### Graceful Degradation (Frontend Live Mode)

The frontend's live-mode implementation should catch `503 Service Unavailable` and `404 Not Found` responses for governance endpoints and:

1. Log a warning to analytics
2. Fall back to rendering an empty state or "Governance is not yet available" message
3. Do **not** throw an uncaught error that crashes the page

This is essential since the backend may not yet have governance endpoints implemented.

---

## Pagination

All list endpoints support pagination via:

- `limit`: Max results per page (default 20, max 100)
- `cursor`: Opaque pagination cursor (from previous response's `nextCursor`)

Response format:

```json
{
  "proposals": [ ... ],
  "nextCursor": "offset_50"
}
```

When no more results exist, `nextCursor` is omitted or `null`.

---

## Mock Mode

The frontend's mock mode (enabled via `NEXT_PUBLIC_API_MODE=mock`) includes a full in-memory implementation of this contract:

- Creates and stores proposals in-memory
- Simulates vote weight calculations based on mock member tiers/roles
- Supports all proposal lifecycle transitions (draft → active → closed → resolved)
- Persists state to localStorage for consistent demo experience

This allows the Governance module to be fully demonstrable without a live backend.

---

## Future Enhancements

Potential endpoints for future consideration (not yet required):

- **Proposal Templates**: `GET /v1/governance/templates` — list pre-defined proposal types
- **Community Governance Settings**: `GET /v1/governance/settings`, `POST /v1/governance/settings` — configure voting rules, weights, etc.
- **Vote Delegation**: `POST /v1/governance/proposals/:id/delegate` — allow members to delegate their vote to another member
- **Webhooks**: `POST /v1/governance/webhooks` — notify external systems when proposals are resolved
- **Analytics**: `GET /v1/governance/analytics` — voting trends, participation rates, etc.

---

## References

- **Frontend Types**: [lib/api/types.ts](../lib/api/types.ts) — TypeScript interfaces for `Proposal`, `Vote`, `VoteChoice`, etc.
- **Mock Implementation**: [lib/api/mock.ts](../lib/api/mock.ts) — In-memory governance implementation for demo mode
- **Live Implementation**: [lib/api/live.ts](../lib/api/live.ts) — HTTP client for live backend endpoints
- **Feature Gate**: [lib/features.ts](../lib/features.ts) — `NEXT_PUBLIC_FEATURE_GOVERNANCE` flag
