import type { AdminModule } from '../types';

export const policiesModule: AdminModule = {
  id: 'policies',
  navLabel: null, // Access policy editor
  route: '/admin/policies',
  featureFlag: 'adminPolicies',
  requiredRole: 'admin',
  order: 30,
  description: 'Access policy rules, tier constraints, and role requirements',
};
