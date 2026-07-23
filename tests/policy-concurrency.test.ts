/**
 * Policy Concurrency Control Tests
 * 
 * Tests the optimistic concurrency control mechanism for policy updates
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockAccessApi, resetMockData } from '@/lib/api/mock';
import { AccessPolicy } from '@/lib/api/types';
import { ApiError } from '@/lib/api/errors';

describe('Policy Concurrency Control', () => {
  let api: MockAccessApi;
  const testAddress = '0xTestAdmin123456789012345678901234567890';

  beforeEach(async () => {
    await resetMockData();
    api = new MockAccessApi(testAddress);
  });

  it('should successfully update policy with matching updatedAt', async () => {
    // Get the current policy
    const policies = await api.listPolicies();
    const alphaPolicy = policies.find(p => p.resourceId === 'alpha');
    expect(alphaPolicy).toBeDefined();
    expect(alphaPolicy?.updatedAt).toBeDefined();

    // Update with the correct updatedAt
    const updatedPolicy: AccessPolicy = {
      ...alphaPolicy!,
      minTier: 'pro',
    };

    await expect(api.updatePolicy(updatedPolicy)).resolves.toBeUndefined();

    // Verify the update
    const updatedPolicies = await api.listPolicies();
    const newAlphaPolicy = updatedPolicies.find(p => p.resourceId === 'alpha');
    expect(newAlphaPolicy?.minTier).toBe('pro');
    expect(newAlphaPolicy?.updatedAt).not.toBe(alphaPolicy?.updatedAt);
  });

  it('should reject update with stale updatedAt (409 Conflict)', async () => {
    // Get the current policy
    const policies = await api.listPolicies();
    const alphaPolicy = policies.find(p => p.resourceId === 'alpha');
    expect(alphaPolicy).toBeDefined();

    // Simulate another admin updating it first
    await api.updatePolicy({
      ...alphaPolicy!,
      minTier: 'pro',
    });

    // Try to update with the old updatedAt
    const stalePolicy: AccessPolicy = {
      ...alphaPolicy!,
      minTier: 'standard',
    };

    await expect(api.updatePolicy(stalePolicy)).rejects.toThrow(ApiError);
    
    try {
      await api.updatePolicy(stalePolicy);
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.status).toBe(409);
      expect(apiError.code).toBe('conflict');
      expect(apiError.safeMessage).toContain('modified by another user');
    }
  });

  it('should allow force overwrite when updatedAt is omitted', async () => {
    // Get the current policy
    const policies = await api.listPolicies();
    const alphaPolicy = policies.find(p => p.resourceId === 'alpha');
    expect(alphaPolicy).toBeDefined();

    // Update it once
    await api.updatePolicy({
      ...alphaPolicy!,
      minTier: 'pro',
    });

    // Force overwrite by omitting updatedAt
    const { updatedAt, ...policyWithoutVersion } = alphaPolicy!;
    const forcePolicy: AccessPolicy = {
      ...policyWithoutVersion,
      minTier: 'standard',
    };

    await expect(api.updatePolicy(forcePolicy)).resolves.toBeUndefined();

    // Verify the force update worked
    const updatedPolicies = await api.listPolicies();
    const finalPolicy = updatedPolicies.find(p => p.resourceId === 'alpha');
    expect(finalPolicy?.minTier).toBe('standard');
  });

  it('should create new policy without version check', async () => {
    const newPolicy: AccessPolicy = {
      resourceId: 'new-resource',
      minTier: 'standard',
      roles: ['member'],
    };

    await expect(api.updatePolicy(newPolicy)).resolves.toBeUndefined();

    const policies = await api.listPolicies();
    const createdPolicy = policies.find(p => p.resourceId === 'new-resource');
    expect(createdPolicy).toBeDefined();
    expect(createdPolicy?.updatedAt).toBeDefined();
  });

  it('should update updatedAt timestamp on each successful save', async () => {
    const policies = await api.listPolicies();
    const alphaPolicy = policies.find(p => p.resourceId === 'alpha');
    const originalUpdatedAt = alphaPolicy?.updatedAt;

    // Wait a bit to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));

    // Update the policy
    await api.updatePolicy({
      ...alphaPolicy!,
      minTier: 'pro',
    });

    // Get the updated policy
    const updatedPolicies = await api.listPolicies();
    const newPolicy = updatedPolicies.find(p => p.resourceId === 'alpha');

    expect(newPolicy?.updatedAt).toBeDefined();
    expect(newPolicy?.updatedAt).not.toBe(originalUpdatedAt);
    expect(new Date(newPolicy!.updatedAt!).getTime()).toBeGreaterThan(
      new Date(originalUpdatedAt!).getTime()
    );
  });

  it('should include conflict details in error response', async () => {
    const policies = await api.listPolicies();
    const alphaPolicy = policies.find(p => p.resourceId === 'alpha');
    
    // Update once to change the timestamp
    await api.updatePolicy({
      ...alphaPolicy!,
      minTier: 'pro',
    });

    // Get the new timestamp
    const updatedPolicies = await api.listPolicies();
    const newAlphaPolicy = updatedPolicies.find(p => p.resourceId === 'alpha');

    // Try to update with old timestamp
    try {
      await api.updatePolicy({
        ...alphaPolicy!, // Still has old updatedAt
        minTier: 'standard',
      });
      expect.fail('Should have thrown conflict error');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.details).toBeDefined();
      expect(apiError.details?.currentUpdatedAt).toBe(newAlphaPolicy?.updatedAt);
      expect(apiError.details?.providedUpdatedAt).toBe(alphaPolicy?.updatedAt);
    }
  });
});
