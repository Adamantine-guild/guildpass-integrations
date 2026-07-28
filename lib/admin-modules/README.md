# Admin Module Plugin Architecture

The Admin Module Plugin System provides a modular, self-contained architecture for extending the GuildPass Admin Dashboard. Community deployments and downstream forks can add or customize admin capabilities without modifying core navigation (`components/nav.tsx`) or central routing configurations.

---

## Overview

Each admin module is defined as a self-contained plugin conforming to the `AdminModule` interface. Modules specify their own:
- **Identification & Meta**: Unique ID, display label, and human-readable description.
- **Routing**: Internal path or dynamic route builder (supporting community URL prefixes).
- **Access Control**: Role requirements (e.g. `admin`) and feature flag gating.
- **Order Priority**: Display ordering in top-level or dashboard navigation bars.
- **UI Component**: React component rendered for the module.

Modules register with a central `AdminModuleRegistry` singleton, which evaluates user roles and feature flag rollouts to dynamically supply valid navigation links and active views.

---

## Interface Definition (`lib/admin-modules/types.ts`)

```typescript
export interface AdminModule {
  /** Unique identifier for the module (e.g., 'overview', 'members', 'policies') */
  id: string;

  /** Display label shown in navigation. Set to null or omit to hide from main nav. */
  navLabel?: string | null;

  /** Path or dynamic route builder function `(prefix: string) => string` */
  route: string | ((prefix: string) => string);

  /** Optional feature flag key controlling availability */
  featureFlag?: FeatureFlagKey;

  /** Required role(s) to access this module (e.g., 'admin') */
  requiredRole?: AdminRole | AdminRole[];

  /** Navigation display priority order (lower numbers appear first) */
  order?: number;

  /** Human-readable description of module functionality */
  description?: string;

  /** Optional React component for rendering module UI */
  component?: ComponentType<any>;
}
```

---

## Registering a Custom Admin Module

To register a new module without modifying core app files:

```typescript
import { registerAdminModule } from '@/lib/admin-modules';

registerAdminModule({
  id: 'audit-logs',
  navLabel: 'Audit Logs',
  route: '/admin/audit',
  requiredRole: 'admin',
  featureFlag: 'adminSettings', // Optional feature flag gate
  order: 45,
  description: 'Security audit telemetry and member access logs',
});
```

When registered, the core navigation (`components/nav.tsx`) automatically includes "Audit Logs" for authorized admins when the specified feature flag is active.

---

## API Reference (`lib/admin-modules/registry.ts`)

- `registerAdminModule(module: AdminModule)`: Adds or replaces a module in the registry.
- `unregisterAdminModule(id: string)`: Removes a registered module by ID.
- `getAdminModule(id: string)`: Returns the module matching the ID.
- `getAllAdminModules()`: Returns all registered modules sorted by priority `order`.
- `getEnabledAdminModules(context)`: Evaluates user roles and feature flags, returning active modules.
- `getNavAdminModules(context)`: Returns computed `AdminNavItem[]` ready for top-level header or sidebar navigation.
- `clearAdminModuleRegistry()`: Resets the registry (useful for test isolation).

---

## First-Party Modules

The standard distribution includes default modules in `lib/admin-modules/modules/`:
1. `overview` (`/admin` - Ecosystem Webhook & Telemetry Logs)
2. `members` (`/admin/members` - Directory & Role Assignment)
3. `policies` (`/admin/policies` - Tier Constraints & Access Policies)
4. `analytics` (`/admin/analytics` - Growth & Tier Analytics)
5. `rewards` (`/admin/rewards` - Distribution & Token Allocations)
6. `settings` (`/admin/settings` - Gateway & Community Settings)
7. `governance` (`/admin/governance` - Proposal & Voting Policy)
