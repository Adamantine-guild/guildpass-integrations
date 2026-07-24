import type { FeatureFlagKey } from '@/lib/features';
import type { AdminModule, AdminModuleContext, AdminNavItem } from './types';

class AdminModuleRegistry {
  private modules: Map<string, AdminModule> = new Map();

  /**
   * Register a new admin module plugin.
   * Overwrites any existing module with the same ID.
   */
  public register(module: AdminModule): void {
    if (!module.id) {
      throw new Error('AdminModule registration failed: module must have a valid "id".');
    }
    this.modules.set(module.id, module);
  }

  /**
   * Unregister an admin module by ID.
   */
  public unregister(id: string): boolean {
    return this.modules.delete(id);
  }

  /**
   * Retrieve a registered admin module by ID.
   */
  public get(id: string): AdminModule | undefined {
    return this.modules.get(id);
  }

  /**
   * Retrieve all registered admin modules sorted by order priority.
   */
  public getAll(): AdminModule[] {
    return Array.from(this.modules.values()).sort(
      (a, b) => (a.order ?? 100) - (b.order ?? 100)
    );
  }

  /**
   * Check if a module's required feature flag is enabled.
   */
  public isFeatureEnabled(module: AdminModule, context?: AdminModuleContext): boolean {
    if (!module.featureFlag) {
      return true;
    }

    if (context?.featureFlags && module.featureFlag in context.featureFlags) {
      return Boolean(context.featureFlags[module.featureFlag]);
    }

    const { isFeatureEnabledForIdentifier } = require('../features');
    return isFeatureEnabledForIdentifier(module.featureFlag, context?.userIdentifier);
  }

  /**
   * Check if the user meets the role requirements for a module.
   */
  public hasRequiredRole(module: AdminModule, roles?: string[]): boolean {
    if (!module.requiredRole) {
      return true;
    }

    if (!roles || roles.length === 0) {
      return false;
    }

    const required = Array.isArray(module.requiredRole)
      ? module.requiredRole
      : [module.requiredRole];

    return required.some((role) => roles.includes(role));
  }

  /**
   * Check if a module is enabled for the given context (evaluates both feature flag & role).
   */
  public isEnabled(module: AdminModule, context?: AdminModuleContext): boolean {
    const featureOk = this.isFeatureEnabled(module, context);
    const roleOk = this.hasRequiredRole(module, context?.roles);
    return featureOk && roleOk;
  }

  /**
   * Resolve the full href route for a module given the community prefix.
   */
  public resolveHref(module: AdminModule, prefix = ''): string {
    if (typeof module.route === 'function') {
      return module.route(prefix);
    }
    return prefix ? `${prefix}${module.route}` : module.route;
  }

  /**
   * Get all active and accessible modules for the provided context.
   */
  public getEnabledModules(context?: AdminModuleContext): AdminModule[] {
    return this.getAll().filter((mod) => this.isEnabled(mod, context));
  }

  /**
   * Get all nav items derived from enabled modules for navigation rendering.
   */
  public getNavItems(context?: AdminModuleContext): AdminNavItem[] {
    const prefix = context?.prefix ?? '';
    const enabledModules = this.getEnabledModules(context);

    return enabledModules
      .filter((mod) => mod.navLabel !== null && mod.navLabel !== undefined)
      .map((mod) => ({
        id: mod.id,
        href: this.resolveHref(mod, prefix),
        label: mod.navLabel as string,
        order: mod.order ?? 100,
      }))
      .sort((a, b) => a.order - b.order);
  }

  /**
   * Reset registry (clear all registered modules).
   */
  public clear(): void {
    this.modules.clear();
  }
}

/** Global singleton instance of the Admin Module Registry */
export const adminRegistry = new AdminModuleRegistry();

// Export convenient standalone helper functions for cleaner API usage
export const registerAdminModule = (module: AdminModule): void => adminRegistry.register(module);
export const unregisterAdminModule = (id: string): boolean => adminRegistry.unregister(id);
export const getAdminModule = (id: string): AdminModule | undefined => adminRegistry.get(id);
export const getAllAdminModules = (): AdminModule[] => adminRegistry.getAll();
export const getEnabledAdminModules = (context?: AdminModuleContext): AdminModule[] =>
  adminRegistry.getEnabledModules(context);
export const getNavAdminModules = (context?: AdminModuleContext): AdminNavItem[] =>
  adminRegistry.getNavItems(context);
export const isAdminModuleEnabled = (module: AdminModule, context?: AdminModuleContext): boolean =>
  adminRegistry.isEnabled(module, context);
export const resolveAdminModuleHref = (module: AdminModule, prefix?: string): string =>
  adminRegistry.resolveHref(module, prefix);
export const clearAdminModuleRegistry = (): void => adminRegistry.clear();
