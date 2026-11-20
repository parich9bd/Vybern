import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { AdminUserManagementService } from './user-management.service.js';

const prisma = new PrismaClient();
const suffix = String(Date.now()).slice(-8);
let firstSuperAdminId: string;
let secondSuperAdminId: string;
let adminId: string;

describe('Administrative user management integration', () => {
  beforeAll(async () => {
    firstSuperAdminId = (await prisma.user.create({ data: { phone: `+98911${suffix}`, role: UserRole.SUPER_ADMIN } })).id;
    secondSuperAdminId = (await prisma.user.create({ data: { phone: `+98912${suffix}`, role: UserRole.SUPER_ADMIN } })).id;
    adminId = (await prisma.user.create({ data: { phone: `+98913${suffix}`, role: UserRole.ADMIN } })).id;
    await prisma.session.create({ data: { userId: adminId, tokenHash: `token-${suffix}`, csrfTokenHash: `csrf-${suffix}`, expiresAt: new Date(Date.now() + 60_000) } });
  });

  afterAll(async () => {
    const ids = [firstSuperAdminId, secondSuperAdminId, adminId];
    await prisma.session.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it('lists administrative users without customer accounts', async () => {
    const result = await new AdminUserManagementService(prisma).list(1, 100);
    expect(result.data.map((user) => user.id)).toEqual(expect.arrayContaining([firstSuperAdminId, secondSuperAdminId, adminId]));
    expect(result.data.some((user) => user.role === UserRole.CUSTOMER)).toBe(false);
  });

  it('revokes active sessions after an administrative role change', async () => {
    const updated = await new AdminUserManagementService(prisma).update(adminId, { role: UserRole.SUPPORT });
    expect(updated.role).toBe(UserRole.SUPPORT);
    expect(await prisma.session.findFirst({ where: { userId: adminId, revokedAt: null } })).toBeNull();
  });

  it('prevents demoting or suspending the final active super administrator', async () => {
    const service = new AdminUserManagementService(prisma);
    await service.update(secondSuperAdminId, { status: UserStatus.SUSPENDED });
    await expect(service.update(firstSuperAdminId, { role: UserRole.ADMIN })).rejects.toMatchObject({ code: 'LAST_SUPER_ADMIN' });
    await expect(service.update(firstSuperAdminId, { status: UserStatus.SUSPENDED })).rejects.toMatchObject({ code: 'LAST_SUPER_ADMIN' });
  });
});
