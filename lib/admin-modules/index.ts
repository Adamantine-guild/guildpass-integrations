import { adminRegistry } from './registry';
import { overviewModule } from './modules/overview';
import { membersModule } from './modules/members';
import { policiesModule } from './modules/policies';
import { analyticsModule } from './modules/analytics';
import { rewardsModule } from './modules/rewards';
import { settingsModule } from './modules/settings';
import { governanceModule } from './modules/governance';

export * from './types';
export * from './registry';

/**
 * First-party admin modules.
 */
export const defaultAdminModules = [
  overviewModule,
  membersModule,
  policiesModule,
  analyticsModule,
  rewardsModule,
  settingsModule,
  governanceModule,
];

/**
 * Register all standard first-party admin modules into the registry.
 */
export function registerDefaultAdminModules(): void {
  for (const module of defaultAdminModules) {
    adminRegistry.register(module);
  }
}

// Auto-register default first-party admin modules
registerDefaultAdminModules();
