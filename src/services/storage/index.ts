import { env } from '../../config/env.js';
import { CloudinaryFileStorage } from './cloudinary-file-storage.js';
import { LocalFileStorage } from './local-file-storage.js';
import type { FileStorage, StorageProviderName } from './storage.types.js';

export type { FileStorage, StorageProviderName, StoredBlob } from './storage.types.js';

const instances = new Map<StorageProviderName, FileStorage>();

/** Lazily builds a provider so the local uploads folder is only created when it is used. */
export function getFileStorage(provider: string): FileStorage {
  const name: StorageProviderName = provider === 'cloudinary' ? 'cloudinary' : 'local';
  let storage = instances.get(name);
  if (!storage) {
    storage = name === 'cloudinary' ? new CloudinaryFileStorage() : new LocalFileStorage();
    instances.set(name, storage);
  }
  return storage;
}

/** Provider used for new uploads (FILE_STORAGE_PROVIDER). Existing files keep their own provider. */
export function getActiveFileStorage(): FileStorage {
  return getFileStorage(env.FILE_STORAGE_PROVIDER);
}
