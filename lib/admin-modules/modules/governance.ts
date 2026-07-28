import type { AdminModule } from '../types';

export const governanceModule: AdminModule = {
  id: 'governance',
  navLabel: 'Governance',
  route: '/admin/governance',
  featureFlag: 'governance',
  requiredRole: 'admin',
  order: 70,
  description: 'Community governance proposals, voting power, and delegation policy',
};
