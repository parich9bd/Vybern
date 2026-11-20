import { describe, expect, it } from 'vitest';
import { UserRole } from '@prisma/client';
import { AdminProvisioningService } from './admin-provisioning.service.js';

describe('AdminProvisioningService', () => {
  it('promotes only an existing customer and creates one immutable operation event', async () => {
    const calls: string[] = [];
    const transaction = {
      user: { findUnique: async () => ({ id: 'user_1', role: UserRole.CUSTOMER }), update: async () => { calls.push('role'); } },
      adminProvisioningEvent: { upsert: async () => { calls.push('event'); } },
    };
    const prisma = { $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction) };
    await expect(new AdminProvisioningService(prisma as never).provisionExistingUser('+989011220337', 'trusted-local-operator')).resolves.toEqual({ changed: true });
    expect(calls).toEqual(['role', 'event']);
  });

  it('does not create an account when the target has not completed OTP authentication', async () => {
    const transaction = { user: { findUnique: async () => null } };
    const prisma = { $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction) };
    await expect(new AdminProvisioningService(prisma as never).provisionExistingUser('+989011220337', 'trusted-local-operator')).rejects.toThrow('complete normal OTP authentication');
  });
});
