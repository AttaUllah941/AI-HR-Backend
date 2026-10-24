import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/** AES-256-GCM envelope for secrets at rest. Format: enc:v1:<iv b64url>:<tag b64url>:<ct b64url>. */
export const SECRET_BOX_PREFIX = 'enc:v1:';

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(SECRET_BOX_PREFIX);
}

/** Parse a 32-byte key supplied as 64 hex chars or base64. Returns null when invalid. */
export function parseEncryptionKey(raw: string): Buffer | null {
  const value = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, 'hex');
  if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) {
    const buf = Buffer.from(value, 'base64');
    if (buf.length === 32) return buf;
  }
  return null;
}

/** Derive a 32-byte key from an arbitrary secret (non-production fallback). */
export function deriveKeyFromSecret(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, 'zenith-hr', 'mfa-secret-box-v1', 32));
}

export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${SECRET_BOX_PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${ct.toString('base64url')}`;
}

/** Decrypts an enc:v1 value; values without the prefix are legacy plaintext and pass through. Throws on tamper. */
export function decryptSecret(stored: string, key: Buffer): string {
  if (!isEncryptedSecret(stored)) return stored;
  const parts = stored.slice(SECRET_BOX_PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error('Malformed encrypted secret');
  const [iv, tag, ct] = parts.map((p) => Buffer.from(p, 'base64url')) as [Buffer, Buffer, Buffer];
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
