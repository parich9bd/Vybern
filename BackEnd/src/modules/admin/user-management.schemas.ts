import { z } from 'zod';
import { UserRole, UserStatus } from '@prisma/client';

export const adminUserParamsSchema = z.object({ userId: z.string().cuid() });
export const adminUserListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().min(1).max(100).optional(),
});
export const updateAdminUserSchema = z.object({
  role: z.nativeEnum(UserRole).optional(),
  status: z.nativeEnum(UserStatus).optional(),
}).refine((value) => value.role !== undefined || value.status !== undefined, 'At least one field is required');
