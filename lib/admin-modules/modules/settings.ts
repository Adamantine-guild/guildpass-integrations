import type { AdminModule } from '../types';

export const settingsModule: AdminModule = {
  id: 'settings',
  navLabel: 'Settings',
  route: '/admin/settings',
  featureFlag: 'adminSettings',
  requiredRole: 'admin',
  order: 60,
  description: 'Community settings, branding, and integration gateway configuration',
};
