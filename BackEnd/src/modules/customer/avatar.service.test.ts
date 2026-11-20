import { describe, expect, it } from 'vitest';
import { AvatarService } from './avatar.service.js';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x48, 0x44, 0x52]);

describe('AvatarService', () => {
  it('rejects non-image bytes before storage', async () => {
    const storage = { createAvatarKey: () => 'avatars/a.png', createKey: () => 'images/a.png', put: async () => undefined, read: async () => Buffer.alloc(0), remove: async () => undefined };
    const service = new AvatarService({} as never, storage, 1024);
    await expect(service.replace('user', Buffer.from('not-an-image'))).rejects.toMatchObject({ code: 'INVALID_MEDIA_CONTENT' });
  });

  it('uses a controlled avatar key and removes the replaced file', async () => {
    const removed: string[] = [];
    const storage = { createAvatarKey: () => 'avatars/123e4567-e89b-12d3-a456-426614174000.png', createKey: () => 'images/a.png', put: async () => undefined, read: async () => Buffer.alloc(0), remove: async (key: string) => { removed.push(key); } };
    const prisma = { user: { findUniqueOrThrow: async () => ({ avatarKey: 'avatars/123e4567-e89b-12d3-a456-426614174001.png' }), update: async () => ({ avatarKey: 'avatars/123e4567-e89b-12d3-a456-426614174000.png', avatarContentType: 'image/png', avatarUpdatedAt: new Date() }) } };
    const service = new AvatarService(prisma as never, storage, 1024);
    await service.replace('user', png);
    expect(removed).toEqual(['avatars/123e4567-e89b-12d3-a456-426614174001.png']);
  });
});
