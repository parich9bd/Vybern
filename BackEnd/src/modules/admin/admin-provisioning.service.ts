import { Prisma, PrismaClient, UserRole } from '@prisma/client';

const operation = 'ADMIN_PROVISIONED';

export class AdminProvisioningService {
  constructor(private readonly prisma: PrismaClient) {}

  async provisionExistingUser(phone: string, operatorLabel: string): Promise<{ changed: boolean }> {
    const run = () => this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { phone }, select: { id: true, role: true } });
      if (!user) throw new Error('The administrator account must complete normal OTP authentication before provisioning');
      const changed = user.role === UserRole.CUSTOMER;
      if (changed) await tx.user.update({ where: { id: user.id }, data: { role: UserRole.ADMIN } });
      await tx.adminProvisioningEvent.upsert({
        where: { targetUserId_operation: { targetUserId: user.id, operation } },
        create: { targetUserId: user.id, operation, operatorLabel },
        update: {},
      });
      return { changed };
    }, { isolationLevel: 'Serializable' });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try { return await run(); } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt === 2) throw error;
      }
    }
    throw new Error('Administrator provisioning transaction did not complete');
  }
}
