import 'dotenv/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { normaliseE164Phone } from '../modules/auth/auth.schemas.js';
import { AdminProvisioningService } from '../modules/admin/admin-provisioning.service.js';

function required(name: string): string { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; }

async function main(): Promise<void> {
  const phone = normaliseE164Phone(required('ADMIN_PROVISION_PHONE'));
  const token = required('ADMIN_PROVISION_TOKEN');
  const expectedHash = required('ADMIN_PROVISION_TOKEN_HASH').toLowerCase();
  const operatorLabel = required('ADMIN_PROVISION_OPERATOR_LABEL').trim();
  if (!/^[a-f0-9]{64}$/.test(expectedHash) || token.length < 32 || operatorLabel.length < 3 || operatorLabel.length > 120) throw new Error('Invalid administrator provisioning configuration');
  const actualHash = createHash('sha256').update(token).digest('hex');
  if (!timingSafeEqual(Buffer.from(actualHash, 'hex'), Buffer.from(expectedHash, 'hex'))) throw new Error('Administrator provisioning token verification failed');
  const prisma = new PrismaClient();
  try {
    const result = await new AdminProvisioningService(prisma).provisionExistingUser(phone, operatorLabel);
    console.log(result.changed ? 'Administrator provisioned. Remove provisioning environment variables now.' : 'Administrator was already provisioned.');
  } finally { await prisma.$disconnect(); }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Administrator provisioning failed'); process.exit(1); });
