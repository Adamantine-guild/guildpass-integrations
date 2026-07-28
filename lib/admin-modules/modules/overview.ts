import type { AdminModule } from '../types';

export const overviewModule: AdminModule = {
  id: 'overview',
  navLabel: 'Admin',
  route: '/admin',
  requiredRole: 'admin',
  order: 10,
  description: 'Ecosystem Webhook Logs, system telemetry, and operational events',
};
