import { PrismaClient } from '@prisma/client';

const TEST_DATABASE_NAME = 'vybern_test';

function testDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) {
    throw new Error('TEST_DATABASE_URL is required for PostgreSQL integration tests');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL URL');
  }

  const databaseName = decodeURIComponent(url.pathname).replace(/^\//, '');
  if (databaseName !== TEST_DATABASE_NAME) {
    throw new Error(`Refusing to run integration tests against database "${databaseName}"; expected "${TEST_DATABASE_NAME}"`);
  }

  return value;
}

/**
 * Creates a Prisma client which can only ever point at the dedicated test
 * database. The connection identity check prevents a misleading URL from
 * accidentally turning fixture cleanup into development-data cleanup.
 */
export async function createVerifiedTestPrismaClient(): Promise<PrismaClient> {
  const client = new PrismaClient({ datasources: { db: { url: testDatabaseUrl() } } });

  try {
    await client.$connect();
    const result = await client.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
    if (result[0]?.current_database !== TEST_DATABASE_NAME) {
      throw new Error(`Refusing to use connected database "${result[0]?.current_database ?? 'unknown'}" for integration tests`);
    }
    return client;
  } catch (error) {
    await client.$disconnect();
    throw error;
  }
}
