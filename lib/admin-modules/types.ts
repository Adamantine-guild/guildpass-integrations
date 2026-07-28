import type { ComponentType } from 'react';
import type { FeatureFlagKey } from '@/lib/features';

export type AdminRole = string;

/**
 * Self-contained definition for an Admin Module plugin.
 * Allows nav entries, routing, feature flags, role gating, and component rendering
 * to be declared in a single, pluggable structure.
 */
export interface AdminModule {
  /** Unique identifier for the module (e.g., 'overview', 'members', 'policies', 'analytics', 'rewards', 'settings') */
  id: string;

  /** Display label shown in the navigation bar. Set to null to omit from navigation. */
  navLabel?: string | null;

  /** Route path or route builder function (e.g., '/admin/policies' or (prefix) => `${prefix}/admin/policies`) */
  route: string | ((prefix: string) => string);

  /** Optional feature flag key controlling availability of this module */
  featureFlag?: FeatureFlagKey;

  /** Required role(s) to access this module (e.g., 'admin') */
  requiredRole?: AdminRole | AdminRole[];

  /** Navigation display priority order (lower numbers appear first) */
  order?: number;

  /** Human-readable description of module functionality */
  description?: string;

  /** React Component rendered for this module route */
  component?: ComponentType<any>;
}

/**
 * Evaluation context for checking module availability, navigation URLs, and access rights.
 */
export interface AdminModuleContext {
  /** User roles (e.g. ['admin', 'member']) */
  roles?: string[];
  /** Wallet address or user ID (for feature rollout bucket calculations) */
  userIdentifier?: string | null;
  /** Active community slug URL prefix (e.g., '/guildpass-demo' or '') */
  prefix?: string;
  /** Custom feature flag state overrides (defaults to global features) */
  featureFlags?: Record<string, boolean>;
}

/**
 * Computed navigation item derived from a registered AdminModule.
 */
export interface AdminNavItem {
  id: string;
  href: string;
  label: string;
  order: number;
}
