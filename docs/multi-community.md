# Design Doc: Multi-Community / Multi-Tenant Support

This document details the architectural decisions and implementation plan for adding multi-community support to the `guildpass-integrations` frontend.

---

## 1. Routing Scheme

### Path Structure
Communities will be isolated using community-scoped path segments in the URL:
```
/[communitySlug]/dashboard
/[communitySlug]/admin
/[communitySlug]/admin/analytics
/[communitySlug]/admin/policies
/[communitySlug]/admin/rewards
/[communitySlug]/admin/settings
/[communitySlug]/resources/[resourceId]
/[communitySlug]/events/demo
```

### Root and Fallback Routing
To prevent regressions in existing single-community deployments, we must support URLs without a community slug prefix (e.g., `/dashboard`, `/admin`).

#### single-community (Default / Feature Flag Disabled)
* The browser URL remains `/dashboard`, `/admin`, etc.
* We use a Next.js middleware rewrite to internally map `/dashboard` to `/[defaultCommunitySlug]/dashboard` (where the default slug is `guildpass-demo`).
* This maps cleanly to the `[communitySlug]` App Router directory layout without modifying the browser's address bar or breaking any bookmarks or links.

#### multi-community (Feature Flag Enabled)
* If the user visits a root path like `/dashboard` without a slug, we will:
  1. Check `sessionStorage` or `localStorage` for a previously active community (`guildpass:active-community`).
  2. If found, redirect the browser to `/[savedCommunitySlug]/dashboard`.
  3. If not found, redirect to the default `/[defaultCommunitySlug]/dashboard`.
* The community switcher component in the navigation header will allow changing the active community. Changing the community redirects the browser to `/[newCommunitySlug]/dashboard` (or the corresponding page if applicable).

---

## 2. Session Scoping Decision

### Decision: Global SIWE Sessions
**SIWE authentication sessions are global across communities.**

### Rationale
* **Standard Web3 Paradigm**: EIP-4361 (SIWE) authenticates a *wallet address* for a specific *domain* (e.g., `localhost:3000`), not a specific resource or tenant.
* **Backend Role Model**: The backend maintains a mapping of a single wallet address to roles and memberships across different communities. The access token returned by the SIWE verification endpoint represents the user's wallet address.
* **User Experience**: Forcing users to sign a new SIWE signature every time they switch communities on the same site creates significant friction. With a global session, switching communities in the dropdown is instant and seamless.
* **Implementation Details**: The global session token (`guildpass:siwe-session`) is shared. Switching communities does not require re-auth. However, the query keys for queries like `getSession` will include the community slug, ensuring React Query fetches community-specific permissions (roles and memberships) using the same session token.

---

## 3. Feature Flag Scoping Decision

### Decision: Global Feature Flags
**Feature flags are global across the entire frontend deployment.**

### Rationale
* **Next.js Bundling**: Feature flags are read from compile-time environment variables (e.g. `NEXT_PUBLIC_FEATURE_EVENTS`). Since the built bundle is static and shared, these environment variables are global across all routes.
* **Predictability**: Managing feature rollouts at the deployment/infrastructure level ensures consistency across testing, staging, and production environments.
* **Separation of Concerns**: If community-specific features are needed in the future, they should be governed by the community configuration returned by the backend (`GET /v1/community`), rather than client-side environment variables.

---

## 4. Data-Layer Changes

### Parameterizing getApi
The API client instantiation helper `getApi` will be updated to accept the active community slug/ID:
```typescript
export function getApi(address?: string, token?: string, communityId?: string): AccessApi
```
The community ID will be passed to `LiveAccessApi` and `MockAccessApi` constructors.

### HTTP Header Scoping
In `LiveAccessApi`, all community-scoped endpoints will send the active community slug/ID via standard headers:
* `X-Community-Id`: `[communitySlug]`
* `X-Community-Slug`: `[communitySlug]`

This ensures that the backend can resolve the request to the correct community database/tenant context.

### React Query Cache Isolation
To prevent data leaks across communities, every query key in `queryKeys` must be parameterized by the active community.

```typescript
export const queryKeys = {
  session: {
    byAddress: (address: string, community: string) => ['session', address, community] as const,
  },
  members: {
    all: (community: string) => ['members', community] as const,
  },
  policies: {
    all: (community: string) => ['policies', community] as const,
    byResource: (resourceId: string, community: string) => ['policy', resourceId, community] as const,
  },
  resources: {
    all: (community: string) => ['resources', community] as const,
    detail: (resourceId: string, community: string) => ['resource', resourceId, community] as const,
  },
  community: {
    detail: (community: string) => ['community', community] as const,
  },
  profile: {
    byAddress: (address: string, community: string) => ['profile', address, community] as const,
  },
  walletVerification: {
    byAddress: (address: string, community: string) => ['walletVerification', address, community] as const,
  },
  webhookEvents: {
    all: (community: string) => ['webhookEvents', community] as const,
  },
  analytics: {
    summary: (community: string) => ['analytics', 'summary', community] as const,
  },
}
```
This guarantees that query results for one community will never be retrieved or rendered when viewing another community.
