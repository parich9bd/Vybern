import { Prisma, PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { AppError } from '../../lib/errors.js';

const userSelect = {
  id: true,
  phone: true,
  firstName: true,
  lastName: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class AdminUserManagementService {
  constructor(private readonly prisma: PrismaClient) {}

  private async transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error: unknown) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt === 4) throw error;
      }
    }
    throw new Error('Unreachable transaction state');
  }

  async list(page: number, limit: number, search?: string) {
    const where: Prisma.UserWhereInput = {
      role: { not: UserRole.CUSTOMER },
      ...(search ? { OR: [{ phone: { contains: search } }, { firstName: { contains: search, mode: 'insensitive' } }, { lastName: { contains: search, mode: 'insensitive' } }] } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, select: userSelect, orderBy: [{ role: 'asc' }, { createdAt: 'desc' }], skip: (page - 1) * limit, take: limit }),
      this.prisma.user.count({ where }),
    ]);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async get(userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, role: { not: UserRole.CUSTOMER } }, select: userSelect });
    if (!user) throw new AppError(404, 'ADMIN_USER_NOT_FOUND', 'Administrative user not found');
    return user;
  }

  async update(userId: string, update: { role?: UserRole; status?: UserStatus }) {
    return this.transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: userSelect });
      if (!user || user.role === UserRole.CUSTOMER) throw new AppError(404, 'ADMIN_USER_NOT_FOUND', 'Administrative user not found');
      const remainsActiveSuperAdmin = (update.role ?? user.role) === UserRole.SUPER_ADMIN && (update.status ?? user.status) === UserStatus.ACTIVE;
      if (user.role === UserRole.SUPER_ADMIN && user.status === UserStatus.ACTIVE && !remainsActiveSuperAdmin) {
        const activeSuperAdmins = await tx.user.count({ where: { role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE } });
        if (activeSuperAdmins <= 1) throw new AppError(409, 'LAST_SUPER_ADMIN', 'The last active super administrator cannot be changed');
      }
      const changed = update.role !== undefined && update.role !== user.role || update.status !== undefined && update.status !== user.status;
      const updated = await tx.user.update({ where: { id: userId }, data: update, select: userSelect });
      if (changed) await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      return updated;
    });
  }
}
