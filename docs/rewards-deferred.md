# Rewards Visualization Module — Deferred Specification

**Status:** Preview / Read-only scaffold  
**Feature Flag:** `NEXT_PUBLIC_FEATURE_REWARDS` (defaults to `false`, preview available when enabled)  
**Affected Files:** `app/admin/rewards/page.tsx`, `lib/features.ts`, `lib/config.ts`

---

## Overview

The **Rewards** module is a read-only preview scaff old that displays member reward eligibility, engagement streaks, and earned badges. The module is intentionally deferred pending maturity of the reward distribution engine on the `guildpass-core` backend.

This document outlines what is currently implemented, what is deferred, and the backend contract required to fully realize the feature.

---

## Current Implementation

### What's Visible Today

The `/admin/rewards` page displays:

- **Member list** — all community members with addresses and tier levels
- **Role display** — member roles for quick role-based filtering
- **Membership status** — active / inactive indicator
- **Clearly marked placeholders** — for streak data, reward eligibility, reward history, and badge lifecycle

### Architecture

```
/admin/rewards (feature-gated, admin-only)
├── Requires admin session (SIWE authentication)
├── Fetches member list via getApi().listMembers()
├── Displays MemberRow data (address, tier, roles, active status)
└── Placeholder sections for future reward data
```

The page follows the established pattern of analytics and other admin views:

- Uses `FeatureGate` with `NEXT_PUBLIC_FEATURE_REWARDS` flag
- Protected by `AdminGuard` (wallet → SIWE → admin role chain)
- Integrates with `useQuery` and React Query for data fetching
- Includes session expiry re-auth flow
- Displays loading, error, and empty states

---

## Deferred Features (Pending Backend Support)

### 1. Reward Distribution Engine

**What's needed:**
- On-chain and off-chain reward computation logic
- Eligibility determination based on tier, roles, badges, and activity
- Reward allocation and escrow management

**Expected backend endpoint:**
```
GET /v1/admin/rewards/eligibility?address=0x...
→ {
  reward_id: string,
  member_address: string,
  tier: string,
  eligible: boolean,
  reason: string,
  computed_at: ISO8601,
}
```

### 2. Streak System

**What's needed:**
- Member engagement tracking (activity logs, contribution metrics)
- Streak accumulation logic (start date, current count, multiplier)
- Streak expiry and reset rules

**Expected backend endpoint:**
```
GET /v1/admin/rewards/streaks?address=0x...
→ {
  member_address: string,
  streak_type: "contribution" | "attendance" | "participation",
  current_count: number,
  started_at: ISO8601,
  expires_at: ISO8601,
  multiplier: number,
}[]
```

### 3. Reward History & Audit Log

**What's needed:**
- Immutable audit trail of all reward distributions
- Reward claim transactions (on-chain or webhook log)
- Dispute resolution metadata

**Expected backend endpoint:**
```
GET /v1/admin/rewards/history?address=0x...
→ {
  transaction_id: string,
  member_address: string,
  reward_id: string,
  amount: string,
  currency: "ETH" | "token_symbol",
  status: "pending" | "claimed" | "disputed",
  created_at: ISO8601,
}[]
```

### 4. Badge Lifecycle Management

**What's needed:**
- Badge creation and assignment rules
- Badge revocation criteria (earned streaks, role changes, etc.)
- Badge expiry and reissuance logic
- Badge metadata (name, description, image URL)

**Expected backend endpoint:**
```
GET /v1/admin/rewards/badges?address=0x...
→ {
  badge_id: string,
  name: string,
  description: string,
  image_url: string,
  earned_at: ISO8601,
  expires_at: ISO8601 | null,
  metadata: { tier_required?: string, rules?: string[] },
}[]
```

---

## Integration Plan

### Phase 1: Backend Maturity (Q3-Q4)

1. Develop reward computation engine in guildpass-core
2. Implement streak tracking system
3. Build reward audit and claim system
4. Design badge lifecycle rules

### Phase 2: Frontend Integration

1. Add query functions to `lib/api/live.ts` for each endpoint above
2. Update `MemberRow` type or create new `MemberRewardData` type with reward fields
3. Extend `RewardsContent` component with:
   - Streak cards / bar charts
   - Reward eligibility badges
   - History timeline or table
   - Badge carousel / gallery

### Phase 3: Admin Workflows (Future)

- Manual reward allocation override UI
- Streak reset tools for edge cases
- Badge revocation with audit comments
- Batch reward operations

---

## Design Principles

1. **Read-first approach** — initial version is observation-only; mutation endpoints deferred
2. **Progressive disclosure** — show deferred sections as clearly marked placeholders with context
3. **Audit trail first** — all reward operations must be immutable and logged
4. **Tier-aware** — rewards should respect membership tiers and role hierarchies

---

## Environment Variables

```bash
# Enable the rewards preview
NEXT_PUBLIC_FEATURE_REWARDS=false  # Set to true to enable
```

---

## Testing

### Mock Mode

In mock mode (`NEXT_PUBLIC_MOCK_MODE=true`), the rewards page:
- Displays seeded mock members
- Shows placeholder sections with italicized "awaiting backend" messages
- Does NOT simulate rewards data (no fake streaks or distributions yet)

### Live Mode

When connected to guildpass-core (live mode):
- Fetches real member data
- Placeholder sections persist until backend endpoints are available
- Graceful degradation if endpoints return 404 (renders empty state)

---

## Related Issues / PRs

- Related backend: [guildpass-core reward engine planning](https://github.com/Adamantine-Guild/guildpass-core/issues/XXX)
- Feature request: [Issue #260 — Build a rewards visualization module scaffold](https://github.com/Adamantine-Guild/guildpass-integrations/issues/260)

---

## Migration Checklist

When backend endpoints become available:

- [ ] Implement `getRewardsEligibility()` in `lib/api/live.ts`
- [ ] Implement `getStreaks()` in `lib/api/live.ts`
- [ ] Implement `getRewardsHistory()` in `lib/api/live.ts`
- [ ] Implement `getBadges()` in `lib/api/live.ts`
- [ ] Add mock versions of all endpoints in `lib/api/mock.ts`
- [ ] Update `app/admin/rewards/page.tsx` to consume new data
- [ ] Add unit tests for new query functions
- [ ] Update this doc with "Implemented" status
- [ ] Update nav to display Rewards link by default (when flag is enabled)
