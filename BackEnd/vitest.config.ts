import { defineConfig } from 'vitest/config';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required to run tests; DATABASE_URL is never used for test fixtures');
}

const testDatabaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, '');
if (testDatabaseName !== 'vybern_test') {
  throw new Error(`TEST_DATABASE_URL must target the dedicated vybern_test database, not ${testDatabaseName || 'an unnamed database'}`);
}

export default defineConfig({
  test: {
    // dotenv does not overwrite this inherited environment value. This makes every
    // PrismaClient in the suite target the dedicated database, never DATABASE_URL.
    env: { DATABASE_URL: testDatabaseUrl },
    fileParallelism: false,
  },
});
