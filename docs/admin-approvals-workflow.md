# Multi-Admin Approval & Pending Actions Workflow Design

## Overview
This document outlines the architecture and design of the Multi-Admin Approval Workflow engine in `guildpass-integrations`. It details the client-side pending action queue, approval threshold configuration, mutation interception mechanics, and the explicit boundary between the client-side MVP implementation and future `guildpass-core` backend support.

---

## Background & Problem Statement
Previously, sensitive administrative actions—such as assigning/removing member roles (`POST /v1/members/:address/roles`, `DELETE /v1/members/:address/roles/:role`) and updating resource access policies (`PUT /v1/policies/:resourceId`)—took effect unilaterally and immediately upon execution by any single admin. 

For security-conscious communities, unilateral execution poses significant operational risks (e.g., rogue admins or compromised keys immediately revoking other admins or opening resource access). Multi-admin approval ensures sensitive actions require $N$-of-$M$ admin sign-offs before the mutation is committed.

---

## Architectural Architecture & Implementation

### 1. Data Models (`lib/api/types.ts`)
- **`PendingActionType`**: Identifies supported multi-approval operations (`'assignRole' | 'removeRole' | 'updatePolicy'`).
- **`ApprovalConfig`**: Community configuration mapping each action type to its required approval threshold ($N \ge 1$).
- **`PendingActionPayload`**: Encloses the parameters of the proposed mutation (`address`, `role`, `policy`).
- **`PendingAction`**: Represents an active or historical proposal:
  ```typescript
  export interface PendingAction {
    id: string;
    type: PendingActionType;
    payload: PendingActionPayload;
    proposer: string;
    requiredApprovals: number;
    currentApprovals: string[]; // List of admin addresses who approved
    status: 'pending' | 'executed' | 'rejected';
    createdAt: string;
  }
  ```

### 2. Mutation Interception & Execution (`lib/api/mock.ts`)
When an admin initiates a sensitive mutation:
1. `_checkApproval(type, payload)` checks the community's `ApprovalConfig`.
2. If `requiredApprovals == 1` (default), the mutation executes immediately.
3. If `requiredApprovals > 1`, a `PendingAction` is instantiated with `currentApprovals = [proposerAddress]`, stored in `pendingActions`, and saved to state. The mutation method returns `{ status: 'pending', pendingActionId }`.
4. When another admin approves the pending action via `approveAction(id)`, their address is recorded. Once `currentApprovals.length >= requiredApprovals`, `status` changes to `'executed'` and the underlying state mutation is performed.
5. If an admin invokes `rejectAction(id)`, the status changes to `'rejected'` and no state changes occur.

### 3. UI Layer & Optimistic Rollbacks
- **Settings Surface ([`app/[communitySlug]/admin/settings/page.tsx`](file:///c:/Users/DELL/Downloads/Rogut%20Omni%20Channel%20Mock%20API/guildpass-integrations/app/%5BcommunitySlug%5D/admin/settings/page.tsx))**: Allows admins to configure threshold requirements ($1$ to $5$) per action type.
- **Approvals Queue ([`app/[communitySlug]/admin/approvals/page.tsx`](file:///c:/Users/DELL/Downloads/Rogut%20Omni%20Channel%20Mock%20API/guildpass-integrations/app/%5BcommunitySlug%5D/admin/approvals/page.tsx))**: Displays active pending proposals, approval progress, payload details, and action controls for approving/rejecting.
- **Optimistic UI Handling**: In [`members/page.tsx`](file:///c:/Users/DELL/Downloads/Rogut%20Omni%20Channel%20Mock%20API/guildpass-integrations/app/%5BcommunitySlug%5D/admin/members/page.tsx) and [`policies/page.tsx`](file:///c:/Users/DELL/Downloads/Rogut%20Omni%20Channel%20Mock%20API/guildpass-integrations/app/%5BcommunitySlug%5D/admin/policies/page.tsx), when a mutation returns `status === 'pending'`, the optimistic UI state is cleanly rolled back, and an informational banner/toast notifies the admin that the proposal was submitted for approval.

---

## Client-Side MVP vs. `guildpass-core` Security Boundaries

> [!IMPORTANT]
> **Client-Side Boundary Notice**:
> The current implementation is client-side and in-memory/mock-persisted (`lib/api/mock.ts`). `lib/api/live.ts` explicitly throws an unsupported error for pending action approval methods until `guildpass-core` implements backend multi-sig endpoints.

### Comparison Table

| Capability | Client-Side MVP (`guildpass-integrations`) | Production Backend (`guildpass-core` Target) |
| :--- | :--- | :--- |
| **State Persistence** | Local / In-memory state (`communityStates`) | Distributed DB (`postgres` / `redis`) |
| **Identity & Authentication** | Mock Admin Address / Local SIWE session | Cryptographic SIWE signature per approval |
| **Security Guarantee** | Client UX simulation; bypassed if client calls API directly | Enforced at backend API layer before DB write |
| **Auditing & History** | Local session event logs | Immutable tamper-proof audit trail |

### Required `guildpass-core` Endpoints for Production Integration
To transition from client-side MVP to full production security, `guildpass-core` will need to implement:
- `GET /v1/pending-actions` - List pending action queue.
- `POST /v1/pending-actions/:id/approve` - Submit signed approval payload.
- `POST /v1/pending-actions/:id/reject` - Submit signed rejection payload.
- `PUT /v1/communities/:slug/approval-config` - Persist approval policy configurations.
