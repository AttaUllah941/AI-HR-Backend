import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { Readable } from 'node:stream';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../config/env.js';
import { NotFoundError } from '../../utils/app-error.js';
import type { FileStorage, StoredBlob } from './storage.types.js';
import { validateUploadFile } from './local-file-storage.js';

/**
 * Cloudinary-backed storage. Files are uploaded as `raw` assets with `type: authenticated`, so they
 * are never publicly reachable: the API authorises the request, then streams the file through a
 * short-lived signed URL. The API secret stays on the server.
 */
export class CloudinaryFileStorage implements FileStorage {
  readonly provider = 'cloudinary' as const;

  constructor() {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  private publicId(storageKey: string): string {
    return `${env.CLOUDINARY_FOLDER}/${storageKey}`;
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

    await new Promise<void>((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          public_id: this.publicId(storageKey),
          resource_type: 'raw',
          type: 'authenticated',
          overwrite: false,
        },
        (error) => (error ? reject(error) : resolve()),
      );
      upload.end(buffer);
    });

    return {
      storageProvider: this.provider,
      storageKey,
      storedName,
      checksumSha256: createHash('sha256').update(buffer).digest('hex'),
      sizeBytes: buffer.length,
      originalName: validated.safeOriginalName,
      mimeType: validated.mimeType,
    };
  }

  async openReadStream(storageKey: string): Promise<Readable> {
    const url = cloudinary.url(this.publicId(storageKey), {
      resource_type: 'raw',
      type: 'authenticated',
      sign_url: true,
      secure: true,
    });
    const response = await fetch(url);
    if (response.status === 404 || response.status === 401 || response.status === 403) {
      throw new NotFoundError('Stored file is missing in Cloudinary');
    }
    if (!response.ok || !response.body) {
      throw new Error(`Cloudinary download failed with status ${response.status}`);
    }
    return Readable.fromWeb(response.body as never);
  }

  async remove(storageKey: string): Promise<void> {
    await cloudinary.uploader.destroy(this.publicId(storageKey), {
      resource_type: 'raw',
      type: 'authenticated',
      invalidate: true,
    });
  }
}
