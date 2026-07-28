import './setup-env';
import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  adminRegistry,
  registerAdminModule,
  unregisterAdminModule,
  getAdminModule,
  getAllAdminModules,
  getEnabledAdminModules,
  getNavAdminModules,
  clearAdminModuleRegistry,
  registerDefaultAdminModules,
  type AdminModule,
} from '../lib/admin-modules';

describe('AdminModule Plugin System & Registry', () => {
  beforeEach(() => {
    clearAdminModuleRegistry();
    registerDefaultAdminModules();
  });

  it('registers default first-party modules correctly', () => {
    const modules = getAllAdminModules();
    const ids = modules.map((m) => m.id);

    assert.ok(ids.includes('overview'));
    assert.ok(ids.includes('members'));
    assert.ok(ids.includes('policies'));
    assert.ok(ids.includes('analytics'));
    assert.ok(ids.includes('rewards'));
    assert.ok(ids.includes('settings'));
    assert.ok(ids.includes('governance'));
  });

  it('allows registering and looking up a custom admin module', () => {
    const customModule: AdminModule = {
      id: 'custom-audit',
      navLabel: 'Audit Logs',
      route: '/admin/audit',
      requiredRole: 'admin',
      order: 15,
      description: 'Custom third-party audit logging plugin',
    };

    registerAdminModule(customModule);
    const fetched = getAdminModule('custom-audit');

    assert.ok(fetched);
    assert.equal(fetched?.id, 'custom-audit');
    assert.equal(fetched?.navLabel, 'Audit Logs');
  });

  it('filters enabled modules by user role', () => {
    // Non-admin user should not receive admin-gated modules
    const nonAdminModules = getEnabledAdminModules({ roles: ['member'] });
    assert.equal(nonAdminModules.length, 0);

    // Admin user should receive enabled admin modules
    const adminModules = getEnabledAdminModules({
      roles: ['admin'],
      featureFlags: { analytics: true, rewards: true, adminSettings: true, adminPolicies: true, governance: true },
    });
    assert.ok(adminModules.length >= 5);
  });

  it('filters enabled modules by feature flags', () => {
    const enabledWithFlags = getEnabledAdminModules({
      roles: ['admin'],
      featureFlags: {
        analytics: true,
        rewards: false,
        adminSettings: false,
        adminPolicies: true,
        governance: false,
      },
    });

    const enabledIds = enabledWithFlags.map((m) => m.id);
    assert.ok(enabledIds.includes('analytics'));
    assert.ok(enabledIds.includes('policies'));
    assert.equal(enabledIds.includes('rewards'), false);
    assert.equal(enabledIds.includes('settings'), false);
    assert.equal(enabledIds.includes('governance'), false);
  });

  it('generates correct nav items with community prefix', () => {
    const navItems = getNavAdminModules({
      roles: ['admin'],
      prefix: '/guildpass-demo',
      featureFlags: { analytics: true, rewards: true, adminSettings: true },
    });

    const overviewNav = navItems.find((item) => item.id === 'overview');
    const analyticsNav = navItems.find((item) => item.id === 'analytics');

    assert.ok(overviewNav);
    assert.equal(overviewNav?.href, '/guildpass-demo/admin');
    assert.equal(overviewNav?.label, 'Admin');

    assert.ok(analyticsNav);
    assert.equal(analyticsNav?.href, '/guildpass-demo/admin/analytics');
    assert.equal(analyticsNav?.label, 'Analytics');
  });

  it('allows unregistering a module', () => {
    assert.ok(getAdminModule('analytics'));
    const unregistered = unregisterAdminModule('analytics');
    assert.equal(unregistered, true);
    assert.equal(getAdminModule('analytics'), undefined);
  });

  it('adds a new admin module without modifying core nav or routes', () => {
    const newPlugin: AdminModule = {
      id: 'token-faucet',
      navLabel: 'Faucet',
      route: (prefix) => `${prefix}/admin/faucet`,
      requiredRole: 'admin',
      order: 45,
    };

    registerAdminModule(newPlugin);

    const navItems = getNavAdminModules({
      roles: ['admin'],
      prefix: '/builders-collective',
      featureFlags: { analytics: true },
    });

    const faucetNav = navItems.find((item) => item.id === 'token-faucet');
    assert.ok(faucetNav);
    assert.equal(faucetNav?.href, '/builders-collective/admin/faucet');
    assert.equal(faucetNav?.label, 'Faucet');
  });
});
