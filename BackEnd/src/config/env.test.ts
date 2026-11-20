import { describe, expect, it } from 'vitest';
import { loadEnvironment } from './env.js';

const productionEnvironment = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://vybern:password@db.example/vybern',
  REDIS_URL: 'redis://redis.example:6379',
  CORS_ORIGIN: 'https://shop.example',
  AUTH_SECRET: 'a-very-long-test-secret-that-is-at-least-32-characters',
  SMS_PROVIDER: 'unconfigured',
  PAYMENT_PROVIDER: 'unconfigured',
  MEDIA_STORAGE_PATH: '/var/lib/vybern/media',
} as NodeJS.ProcessEnv;

describe('environment validation', () => {
  it('rejects an explicitly insecure session cookie in production', () => {
    expect(() => loadEnvironment({ ...productionEnvironment, AUTH_COOKIE_SECURE: 'false' })).toThrow(
      'AUTH_COOKIE_SECURE=true is required in production',
    );
  });

  it('enforces a Secure session cookie in production when not explicitly configured', () => {
    expect(loadEnvironment(productionEnvironment).AUTH_COOKIE_SECURE).toBe(true);
  });

  it('allows an explicitly secure production session cookie', () => {
    expect(loadEnvironment({ ...productionEnvironment, AUTH_COOKIE_SECURE: 'true' }).AUTH_COOKIE_SECURE).toBe(true);
  });
});
