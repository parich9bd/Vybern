import 'dotenv/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { PrismaClient, UserRole } from '@prisma/client';
import { normaliseE164Phone } from '../modules/auth/auth.schemas.js';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  const phone = normaliseE164Phone(required('ADMIN_BOOTSTRAP_PHONE'));
  const token = required('ADMIN_BOOTSTRAP_TOKEN');
  const expectedHash = required('ADMIN_BOOTSTRAP_TOKEN_HASH').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedHash) || token.length < 32) throw new Error('Invalid bootstrap token configuration');
  const actualHash = createHash('sha256').update(token).digest('hex');
  if (!timingSafeEqual(Buffer.from(actualHash, 'hex'), Buffer.from(expectedHash, 'hex'))) throw new Error('Bootstrap token verification failed');
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.count({ where: { role: UserRole.SUPER_ADMIN } });
    if (existing > 0) throw new Error('A super administrator already exists; bootstrap is permanently closed');
    const user = await prisma.user.upsert({ where: { phone }, update: { role: UserRole.SUPER_ADMIN }, create: { phone, role: UserRole.SUPER_ADMIN } });
    await prisma.auditLog.create({ data: { actorUserId: user.id, action: 'SUPER_ADMIN_BOOTSTRAPPED', targetType: 'User', targetId: user.id } });
    console.log('Super administrator provisioned. Remove bootstrap environment variables now.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Bootstrap failed'); process.exit(1); });
