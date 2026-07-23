# Policy Concurrency Control Testing Guide

## Overview
This document describes how to test the optimistic concurrency control feature for policy editing in the admin dashboard.

## Feature Description
The policy editor now detects when a policy has been modified by another administrator since it was loaded. When a conflict is detected, the system:
1. Prevents silent overwrites
2. Shows a conflict resolution dialog
3. Offers three resolution options:
   - **Reload Latest Version**: Discards local changes and loads the current server version
   - **Force Overwrite**: Proceeds with the save, overwriting the other admin's changes
   - **Cancel**: Closes the dialog without making changes

## Testing in Mock Mode

### Setup
1. Ensure you're running in mock mode:
   ```bash
   NEXT_PUBLIC_MOCK_MODE=true npm run dev
   ```

2. Navigate to the Admin → Policies page

3. You should see a "🧪 Mock Scenario Tester" panel at the top (only visible in mock mode)

### Test Scenario: Concurrent Policy Edit

#### Method 1: Using Scenario Selector (Recommended)
1. In the Scenario Selector, choose "Concurrent Policy Edit (Admin)"
2. Click "Apply Scenario"
3. The page will reload with:
   - Your user set as an admin
   - The "alpha" policy recently modified (5 seconds ago) with tier changed to "pro"

4. Load the policies page and click "Edit" on the "Alpha Docs" resource
5. Make a change (e.g., change tier from "pro" to "standard")
6. Click "Update Policy"
7. **Expected Result**: A conflict dialog appears showing:
   - Your attempted changes
   - The current server version
   - Three resolution options

#### Method 2: Manual Simulation
1. Open the policies page in two browser tabs/windows
2. In Tab 1: Click edit on a policy (e.g., "Alpha Docs")
3. In Tab 2: Click edit on the same policy
4. In Tab 2: Make a change and save (this updates the `updatedAt` timestamp)
5. In Tab 1: Make a different change and try to save
6. **Expected Result**: Tab 1 shows a conflict dialog

### Testing Resolution Options

#### Reload Latest Version
1. Trigger a conflict (as above)
2. Click "Reload Latest Version" in the dialog
3. **Expected Result**:
   - Dialog closes
   - Policy list refreshes
   - Message: "Policy reloaded. Please review the current version before editing."
   - The policy shows the version from Tab 2

#### Force Overwrite
1. Trigger a conflict
2. Click "Force Overwrite" in the dialog
3. **Expected Result**:
   - Dialog closes
   - Your changes are saved
   - Success message appears
   - The policy reflects your changes (overwrites other admin's changes)

#### Cancel
1. Trigger a conflict
2. Click "Cancel" in the dialog
3. **Expected Result**:
   - Dialog closes
   - No changes saved
   - You can continue editing or navigate away

## Testing in Live Mode

### Prerequisites
- Backend must support the `updatedAt` field in policy responses
- Backend must return 409 Conflict when `updated_at` timestamp doesn't match

### Backend Contract
The PUT `/v1/policies/:resourceId` endpoint should:
1. Accept an `updated_at` field in the request body
2. Compare it with the current policy's `updated_at` value
3. Return 409 Conflict if they don't match, with response body:
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

### Live Testing Steps
1. Set up two authenticated admin sessions (different users or same user in incognito)
2. Both load the same policy for editing
3. User A saves changes → succeeds
4. User B attempts to save → should see conflict dialog
5. Test all three resolution options

## Edge Cases to Test

### No updatedAt Field (Legacy Policies)
- Policies without `updatedAt` should save without conflict checks
- This supports backward compatibility with older backends

### Network Failures During Conflict Check
- If fetching current policy fails, dialog still shows with limited info
- User can still force-overwrite or cancel

### Rapid Sequential Edits
- Same admin making multiple quick edits should not see conflicts
- Each successful save updates the `updatedAt` locally

### Session Expiry During Edit
- If session expires while editing, auth error takes precedence
- User sees "Session expired" banner instead of conflict dialog

## Acceptance Criteria Verification

✅ **Conflict Detection**: Policy modified since load triggers warning before save
- Test: Follow "Concurrent Policy Edit" scenario above

✅ **Resolution Options**: Admin can reload or force-overwrite
- Test: Click each button in the conflict dialog and verify behavior

✅ **No Silent Overwrites**: Conflict prevents automatic save
- Test: Verify that clicking "Update Policy" with stale data does NOT immediately save

✅ **Mock Mode Scenario**: New "concurrent-policy-edit" preset available
- Test: Select it from the Scenario Selector dropdown

## Files Modified
- `lib/api/types.ts` - Added `updatedAt` to `AccessPolicy`
- `lib/api/mappers.ts` - Map `updatedAt` from backend responses
- `lib/api/mock.ts` - Conflict detection logic and scenario preset
- `lib/api/live.ts` - Send `updated_at` in PUT requests, handle 409 responses
- `app/admin/policies/page.tsx` - Conflict state management and UI
- `components/ui/policy-conflict-dialog.tsx` - Conflict resolution dialog
- `components/developer/scenario-selector.tsx` - Developer testing tool

## Future Enhancements
- Show diff view comparing attempted vs current version
- Auto-merge non-conflicting changes
- Policy edit history/audit log
- Real-time collaborative editing with WebSocket notifications
