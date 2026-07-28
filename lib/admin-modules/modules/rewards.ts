import type { AdminModule } from '../types';

export const rewardsModule: AdminModule = {
  id: 'rewards',
  navLabel: 'Rewards',
  route: '/admin/rewards',
  featureFlag: 'rewards',
  requiredRole: 'admin',
  order: 50,
  description: 'Community reward distribution, token allocations, and claim rules',
};
