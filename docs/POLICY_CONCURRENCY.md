# Policy Concurrency Control

## Overview

The policy editor implements optimistic concurrency control to prevent silent overwrites when multiple administrators edit the same policy simultaneously.

## Problem

Without concurrency control:
- Two admins open the same policy for editing
- Admin A saves changes → succeeds
- Admin B saves changes → silently overwrites Admin A's work
- Admin A's changes are lost without warning

## Solution

The policy editor now:
1. Captures the policy's `updatedAt` timestamp when loading
2. Sends this timestamp with every PUT request
3. The backend compares timestamps and returns 409 Conflict if they don't match
4. The frontend displays a conflict resolution dialog with three options:
   - **Reload Latest Version**: Discard local changes and view current version
   - **Force Overwrite**: Proceed with save, overwriting other changes
   - **Cancel**: Close dialog without saving

## Technical Implementation

### API Changes

#### AccessPolicy Type
```typescript
export interface AccessPolicy {
  resourceId: string
  minTier?: MembershipTier
  roles?: Role[]
  rule?: AccessRule
  updatedAt?: string // ISO 8601 timestamp
}
```

#### Backend Contract
PUT `/v1/policies/:resourceId` request body:
```json
{
  "resource_id": "alpha",
  "min_tier": "standard",
  "roles": ["member"],
  "updated_at": "2024-01-15T10:25:00Z"
}
```

409 Conflict response:
```json
{
  "code": "conflict",
  "message": "This policy was modified by another user. Please reload and try again.",
  "details": {
    "currentUpdatedAt": "2024-01-15T10:30:00Z",
    "providedUpdatedAt": "2024-01-15T10:25:00Z"
  }
}
```

### Frontend Flow

```
1. User loads policy editor
   ↓
2. Policy loaded with updatedAt="2024-01-15T10:25:00Z"
   ↓
3. User makes changes and clicks Save
   ↓
4. PUT request sent with updated_at="2024-01-15T10:25:00Z"
   ↓
5. Backend checks: current updatedAt = "2024-01-15T10:30:00Z"
   ↓
6. Timestamps don't match → 409 Conflict
   ↓
7. Frontend fetches current policy
   ↓
8. Conflict dialog displays both versions
   ↓
9. User chooses resolution:
   - Reload: Refetch policies, close dialog
   - Force: Retry save without updatedAt
   - Cancel: Close dialog, keep editing
```

### Components

#### PolicyConflictDialog
```tsx
<PolicyConflictDialog
  attemptedPolicy={userChanges}
  currentPolicy={serverVersion}
  onReload={() => refetchPolicies()}
  onForceOverwrite={() => saveWithoutVersion()}
  onCancel={() => closeDialog()}
/>
```

Shows:
- Side-by-side comparison of attempted vs current policy
- Visual highlighting of differences
- Warning about force overwrite consequences

#### ScenarioSelector (Dev Tool)
```tsx
<ScenarioSelector />
```

Mock mode testing tool that includes:
- "Concurrent Policy Edit" preset
- Simulates recent policy modification
- Triggers conflict on next save attempt

## Testing

### Mock Mode Testing
```bash
NEXT_PUBLIC_MOCK_MODE=true npm run dev
```

1. Navigate to Admin → Policies
2. Use Scenario Selector → "Concurrent Policy Edit (Admin)"
3. Edit the "Alpha Docs" policy
4. Save → Conflict dialog appears

See [policy-concurrency-testing.md](./policy-concurrency-testing.md) for detailed test scenarios.

### Automated Tests
```bash
npm test tests/policy-concurrency.test.ts
```

Tests cover:
- ✓ Successful update with matching updatedAt
- ✓ Rejected update with stale updatedAt (409)
- ✓ Force overwrite without updatedAt
- ✓ New policy creation (no version check)
- ✓ Timestamp updates on save
- ✓ Conflict details in error response

## Backward Compatibility

### Legacy Backends
If the backend doesn't support `updatedAt`:
- Field is optional in the type definition
- Requests without `updated_at` proceed normally
- No breaking changes for existing integrations

### Legacy Policies
Policies without `updatedAt` are handled gracefully:
- Can still be edited and saved
- First save adds `updatedAt`
- Subsequent saves include version check

### Force Overwrite Mechanism
Omitting `updatedAt` from the request bypasses the version check:
```typescript
// Remove updatedAt to force overwrite
const { updatedAt, ...policyWithoutVersion } = policy;
await api.updatePolicy(policyWithoutVersion);
```

## User Experience

### Conflict Warning
Clear, non-technical message:
> "This policy has been modified by another administrator since you started editing."

### Resolution Guidance
- **Recommended**: Reload to review other admin's changes first
- **Warning**: Force overwrite permanently discards their work
- **Safe**: Cancel lets you manually coordinate

### Visual Feedback
- Conflict dialog overlays the page (modal)
- Shows both versions for comparison
- Highlights the key differences
- Yellow warning box for force overwrite option

## Security Considerations

### No Data Loss Prevention
This is NOT a backup/undo system. It only:
- Detects concurrent edits
- Prevents _silent_ overwrites
- Forces explicit user decision

### Audit Trail
Consider logging policy updates with:
- Admin who made the change
- Timestamp
- Previous and new values
- Whether it was a force overwrite

### Race Conditions
Small race window between conflict check and save:
```
Time    Admin A              Admin B
10:00   Load (v1)           Load (v1)
10:01   Save → v2           -
10:02   -                   Save → detects v2
10:02   -                   Force overwrites → v3
```

This is inherent to optimistic locking. For stricter control, consider:
- Pessimistic locking (lock on edit start)
- Real-time collaboration (WebSocket sync)

## Future Enhancements

### Diff View
Show line-by-line differences:
```diff
- minTier: 'standard'
+ minTier: 'pro'
```

### Auto-Merge
Merge non-conflicting changes automatically:
- Admin A changes tier
- Admin B changes roles
- Both changes can coexist

### Edit History
Track all policy versions:
- Who changed what and when
- Revert to any previous version
- Audit compliance trail

### Real-Time Notifications
WebSocket-based live updates:
- "Admin B is editing this policy"
- "This policy was just updated"
- Live cursor positions (Google Docs style)

### Conflict Resolution UI
More sophisticated options:
- Accept theirs / Accept mine / Accept both
- Field-level merge tool
- Three-way merge view

## Related Files

- `lib/api/types.ts` - Type definitions
- `lib/api/mock.ts` - Mock implementation with conflict detection
- `lib/api/live.ts` - Live API client with 409 handling
- `app/admin/policies/page.tsx` - Policy editor with conflict state
- `components/ui/policy-conflict-dialog.tsx` - Conflict resolution UI
- `components/developer/scenario-selector.tsx` - Testing tool
- `tests/policy-concurrency.test.ts` - Automated tests

## References

- [Optimistic Locking Pattern](https://en.wikipedia.org/wiki/Optimistic_concurrency_control)
- [HTTP 409 Conflict](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/409)
- [ETag and If-Match Headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-Match)
