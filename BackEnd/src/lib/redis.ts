import { createClient, type RedisClientType } from 'redis';

export interface KeyValueStore {
  connect?(): Promise<void>;
  get(key: string): Promise<string | null>;
  getDel(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { expiresInSeconds?: number; onlyIfNotExists?: boolean }): Promise<boolean>;
  del(key: string): Promise<number>;
  increment(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
  ttl?(key: string): Promise<number>;
  close(): Promise<void>;
}

export function createRedisStore(url: string): KeyValueStore {
  const client: RedisClientType = createClient({ url });
  client.on('error', () => undefined);
  return {
    async connect() { if (!client.isOpen) await client.connect(); },
    async get(key) { return client.get(key); },
    async getDel(key) { return client.getDel(key); },
    async set(key, value, options) {
      const result = await client.set(key, value, {
        ...(options?.expiresInSeconds ? { EX: options.expiresInSeconds } : {}),
        ...(options?.onlyIfNotExists ? { NX: true } : {}),
      });
      return result === 'OK';
    },
    async del(key) { return client.del(key); },
    async increment(key) { return client.incr(key); },
    async expire(key, seconds) { await client.expire(key, seconds); },
    async ttl(key) { return client.ttl(key); },
    async close() { if (client.isOpen) await client.quit(); },
  };
}

export async function connectRedisStore(store: KeyValueStore): Promise<void> {
  if (store.connect) await store.connect();
}
