import { mkdir, open, readFile, rm } from 'node:fs/promises';
import { basename, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../lib/errors.js';

export interface MediaStorage {
  createKey(extension: 'jpg' | 'png' | 'webp'): string;
  put(key: string, contents: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

function validKey(key: string): boolean {
  return /^images\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(key);
}

export class LocalMediaStorage implements MediaStorage {
  private readonly root: string;

  constructor(root: string) { this.root = resolve(root); }

  createKey(extension: 'jpg' | 'png' | 'webp'): string {
    return `images/${randomUUID()}.${extension}`;
  }

  private pathFor(key: string): string {
    if (!validKey(key) || basename(key) !== key.split('/').at(-1)) throw new AppError(400, 'INVALID_STORAGE_KEY', 'Invalid media storage key');
    const path = resolve(this.root, key);
    if (!path.startsWith(`${this.root}${sep}`)) throw new AppError(400, 'INVALID_STORAGE_KEY', 'Invalid media storage key');
    return path;
  }

  async put(key: string, contents: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(resolve(path, '..'), { recursive: true, mode: 0o750 });
    const handle = await open(path, 'wx', 0o640);
    try { await handle.writeFile(contents); } finally { await handle.close(); }
  }

  async read(key: string): Promise<Buffer> {
    try { return await readFile(this.pathFor(key)); } catch { throw new AppError(404, 'MEDIA_CONTENT_NOT_FOUND', 'Media content not found'); }
  }

  async remove(key: string): Promise<void> {
    try { await rm(this.pathFor(key), { force: true }); } catch { /* cleanup is idempotent */ }
  }
}
