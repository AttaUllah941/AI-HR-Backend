import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env.js';
import { NotFoundError, ValidationError } from '../../utils/app-error.js';

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.csv',
  '.txt',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
]);

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

const PREVIEWABLE_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

const EXT_MIME_HINTS: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.csv': ['text/csv', 'text/plain', 'application/vnd.ms-excel'],
  '.txt': ['text/plain'],
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.gif': ['image/gif'],
  '.webp': ['image/webp'],
};

export type StoredBlob = {
  storageProvider: string;
  storageKey: string;
  storedName: string;
  absolutePath: string;
  checksumSha256: string;
  sizeBytes: number;
  originalName: string;
  mimeType: string;
};

function sanitizeBaseName(name: string): string {
  const base = path.basename(name).replace(/[^\w.\- ()[\]]+/g, '_').trim();
  return base.slice(0, 180) || 'file';
}

function startsWithBytes(buffer: Buffer, signature: number[], offset = 0): boolean {
  if (buffer.length < offset + signature.length) return false;
  return signature.every((byte, index) => buffer[offset + index] === byte);
}

/** True when the leading bytes of `buffer` are consistent with the claimed file extension. */
export function matchesMagicBytes(extension: string, buffer: Buffer): boolean {
  switch (extension) {
    case '.pdf':
      return startsWithBytes(buffer, [0x25, 0x50, 0x44, 0x46]); // %PDF
    case '.png':
      return startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case '.jpg':
    case '.jpeg':
      return startsWithBytes(buffer, [0xff, 0xd8, 0xff]);
    case '.gif':
      return (
        startsWithBytes(buffer, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || // GIF87a
        startsWithBytes(buffer, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]) // GIF89a
      );
    case '.webp':
      return (
        startsWithBytes(buffer, [0x52, 0x49, 0x46, 0x46]) && // RIFF
        startsWithBytes(buffer, [0x57, 0x45, 0x42, 0x50], 8) // WEBP
      );
    case '.docx':
    case '.xlsx':
      return startsWithBytes(buffer, [0x50, 0x4b, 0x03, 0x04]); // zip container
    case '.doc':
    case '.xls':
      return startsWithBytes(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); // OLE2
    case '.txt':
    case '.csv': {
      // Plain text must not contain NUL bytes in its leading chunk.
      const head = buffer.subarray(0, 8192);
      return !head.includes(0);
    }
    default:
      return false;
  }
}

export function validateUploadFile(input: {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  buffer?: Buffer;
}): { extension: string; safeOriginalName: string; mimeType: string } {
  if (!input.originalName?.trim()) {
    throw new ValidationError('File name is required');
  }
  if (input.sizeBytes <= 0) {
    throw new ValidationError('Empty files are not allowed');
  }
  if (input.sizeBytes > env.FILE_MAX_BYTES) {
    throw new ValidationError(
      `File exceeds the maximum size of ${Math.floor(env.FILE_MAX_BYTES / (1024 * 1024))}MB`,
    );
  }

  const safeOriginalName = sanitizeBaseName(input.originalName);
  const extension = path.extname(safeOriginalName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new ValidationError(`File type ${extension || '(none)'} is not allowed`);
  }

  const mimeType = (input.mimeType || 'application/octet-stream').toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new ValidationError(`MIME type ${mimeType} is not allowed`);
  }

  const hints = EXT_MIME_HINTS[extension] ?? [];
  if (hints.length && !hints.includes(mimeType)) {
    throw new ValidationError('File extension does not match its content type');
  }

  if (input.buffer && !matchesMagicBytes(extension, input.buffer)) {
    throw new ValidationError('File content does not match its declared type');
  }

  return { extension, safeOriginalName, mimeType };
}

export function isPreviewableMime(mimeType: string): boolean {
  return PREVIEWABLE_MIME_TYPES.has(mimeType.toLowerCase());
}

export class LocalFileStorage {
  constructor(private readonly root = path.resolve(env.FILE_STORAGE_ROOT)) {
    if (!existsSync(this.root)) {
      mkdirSync(this.root, { recursive: true });
    }
  }

  resolveAbsolute(storageKey: string): string {
    const absolute = path.resolve(this.root, storageKey);
    const relative = path.relative(this.root, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new ValidationError('Invalid storage path');
    }
    return absolute;
  }

  async save(
    companyId: string,
    originalName: string,
    mimeType: string,
    buffer: Buffer,
  ): Promise<StoredBlob> {
    const validated = validateUploadFile({
      originalName,
      mimeType,
      sizeBytes: buffer.length,
      buffer,
    });

    const storedName = `${Date.now()}-${randomUUID()}${validated.extension}`;
    const storageKey = path.posix.join(companyId, storedName);
    const absolutePath = this.resolveAbsolute(storageKey);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, buffer);

    return {
      storageProvider: 'local',
      storageKey,
      storedName,
      absolutePath,
      checksumSha256: createHash('sha256').update(buffer).digest('hex'),
      sizeBytes: buffer.length,
      originalName: validated.safeOriginalName,
      mimeType: validated.mimeType,
    };
  }

  openReadStream(storageKey: string) {
    const absolute = this.resolveAbsolute(storageKey);
    if (!existsSync(absolute)) {
      throw new NotFoundError('Stored file is missing on disk');
    }
    return createReadStream(absolute);
  }

  async remove(storageKey: string): Promise<void> {
    const absolute = this.resolveAbsolute(storageKey);
    if (existsSync(absolute)) {
      await fs.unlink(absolute);
    }
  }
}

export const localFileStorage = new LocalFileStorage();
