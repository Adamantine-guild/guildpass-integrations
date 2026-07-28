import type { AdminModule } from '../types';

export const membersModule: AdminModule = {
  id: 'members',
  navLabel: null, // Sub-feature accessed from admin dashboard or direct route
  route: '/admin/members',
  requiredRole: 'admin',
  order: 20,
  description: 'Member directory, search, pagination, and role assignment',
};
