import type { Readable } from 'node:stream';

export type StorageProviderName = 'local' | 'cloudinary';

export type StoredBlob = {
  storageProvider: StorageProviderName;
  storageKey: string;
  storedName: string;
  checksumSha256: string;
  sizeBytes: number;
  originalName: string;
  mimeType: string;
};

/** Contract shared by the local-disk and Cloudinary implementations. */
export interface FileStorage {
  readonly provider: StorageProviderName;
  save(companyId: string, originalName: string, mimeType: string, buffer: Buffer): Promise<StoredBlob>;
  openReadStream(storageKey: string): Promise<Readable>;
  remove(storageKey: string): Promise<void>;
}
