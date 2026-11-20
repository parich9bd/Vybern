import { z } from 'zod';

export const dashboardQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  recentLimit: z.coerce.number().int().min(1).max(50).default(10),
});
