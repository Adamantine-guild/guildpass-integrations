import type { AdminModule } from '../types';

export const analyticsModule: AdminModule = {
  id: 'analytics',
  navLabel: 'Analytics',
  route: '/admin/analytics',
  featureFlag: 'analytics',
  requiredRole: 'admin',
  order: 40,
  description: 'Community growth charts, signup trends, and membership tier analytics',
};
