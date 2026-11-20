import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url(),
  CORS_ORIGIN: z.string().url().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  REDIS_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  AUTH_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/).default('vybern_session'),
  AUTH_COOKIE_SECURE: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  AUTH_COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('lax'),
  AUTH_SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(30).max(300).default(60),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  OTP_REQUEST_LIMIT_PER_PHONE: z.coerce.number().int().min(1).max(20).default(5),
  OTP_REQUEST_LIMIT_PER_IP: z.coerce.number().int().min(1).max(100).default(10),
  OTP_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  SMS_PROVIDER: z.enum(['development', 'unconfigured']).default('development'),
  PAYMENT_PROVIDER: z.enum(['mock', 'unconfigured']).default('mock'),
  ORDER_EXPIRATION_INTERVAL_SECONDS: z.coerce.number().int().min(30).max(3600).default(60),
  MEDIA_STORAGE_PATH: z.string().trim().min(1).default('./private/media'),
  MEDIA_MAX_FILE_SIZE_BYTES: z.coerce.number().int().min(1024).max(20_000_000).default(5_000_000),
});

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const parsed = environmentSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
  }
  if (parsed.data.NODE_ENV === 'production' && !parsed.data.CORS_ORIGIN) {
    throw new Error('CORS_ORIGIN is required in production');
  }
  const environment = { ...parsed.data, AUTH_COOKIE_SECURE: parsed.data.AUTH_COOKIE_SECURE ?? parsed.data.NODE_ENV === 'production' };
  if (environment.NODE_ENV === 'production' && !environment.AUTH_COOKIE_SECURE) {
    throw new Error('AUTH_COOKIE_SECURE=true is required in production');
  }
  if (environment.NODE_ENV === 'production' && environment.SMS_PROVIDER === 'development') {
    throw new Error('SMS_PROVIDER=development is not allowed in production');
  }
  if (environment.NODE_ENV === 'production' && environment.PAYMENT_PROVIDER === 'mock') {
    throw new Error('PAYMENT_PROVIDER=mock is not allowed in production');
  }
  if (environment.AUTH_COOKIE_SAME_SITE === 'none' && !environment.AUTH_COOKIE_SECURE) {
    throw new Error('AUTH_COOKIE_SAME_SITE=none requires AUTH_COOKIE_SECURE=true');
  }
  if (environment.NODE_ENV === 'production' && !environment.MEDIA_STORAGE_PATH.startsWith('/')) {
    throw new Error('MEDIA_STORAGE_PATH must be an absolute path in production');
  }
  return environment;
}
