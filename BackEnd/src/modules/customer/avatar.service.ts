import { PrismaClient } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { detectImage } from '../media/media.service.js';
import type { MediaStorage } from '../media/media.storage.js';

export class AvatarService {
  constructor(private readonly prisma: PrismaClient, private readonly storage: MediaStorage, private readonly maxSize: number) {}

  async replace(userId: string, contents: Buffer) {
    if (contents.length === 0 || contents.length > this.maxSize) throw new AppError(413, 'AVATAR_TOO_LARGE', 'Avatar exceeds the configured file size limit');
    const image = detectImage(contents);
    const key = this.storage.createAvatarKey(image.extension);
    await this.storage.put(key, contents);
    try {
      const previous = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarKey: true } });
      const avatar = await this.prisma.user.update({ where: { id: userId }, data: { avatarKey: key, avatarContentType: image.contentType, avatarUpdatedAt: new Date() }, select: { avatarKey: true, avatarContentType: true, avatarUpdatedAt: true } });
      if (previous.avatarKey) await this.storage.remove(previous.avatarKey);
      return avatar;
    } catch (error) {
      await this.storage.remove(key);
      throw error;
    }
  }

  async remove(userId: string): Promise<void> {
    const user = await this.prisma.user.update({ where: { id: userId }, data: { avatarKey: null, avatarContentType: null, avatarUpdatedAt: null }, select: { avatarKey: true } });
    if (user.avatarKey) await this.storage.remove(user.avatarKey);
  }

  async content(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarKey: true, avatarContentType: true } });
    if (!user?.avatarKey || !user.avatarContentType) throw new AppError(404, 'AVATAR_NOT_FOUND', 'Avatar not found');
    return { contents: await this.storage.read(user.avatarKey), contentType: user.avatarContentType };
  }
}
