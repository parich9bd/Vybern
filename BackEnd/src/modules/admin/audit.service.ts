import type { Prisma, PrismaClient } from '@prisma/client';
import type { FastifyRequest } from 'fastify';

export class AuditService {
  constructor(private readonly prisma: PrismaClient) {}

  async record(actorUserId: string, action: string, targetType: string, request: FastifyRequest, targetId?: string, metadata?: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId, action, targetType, targetId, metadata,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']?.slice(0, 512),
      },
    });
  }
}
