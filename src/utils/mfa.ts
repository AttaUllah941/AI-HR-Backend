import { env } from '../config/env.js';
import {
  decryptSecret,
  deriveKeyFromSecret,
  encryptSecret,
  isEncryptedSecret,
  parseEncryptionKey,
} from './secret-box.js';
import { generateSecret, generateURI, verifySync } from 'otplib';

export function createMfaSecret(): string {
  return generateSecret();
}

export function buildMfaUri(secret: string, email: string, issuer = 'Zenith HR'): string {
  return generateURI({
    issuer,
    label: email,
    secret,
  });
}

export function verifyMfaCode(secret: string, token: string): boolean {
  const result = verifySync({ secret, token });
  return result.valid === true;
}

let cachedKey: Buffer | null = null;
function mfaKey(): Buffer {
  if (!cachedKey) {
    cachedKey =
      (env.MFA_ENCRYPTION_KEY ? parseEncryptionKey(env.MFA_ENCRYPTION_KEY) : null) ??
      deriveKeyFromSecret(env.JWT_ACCESS_SECRET);
  }
  return cachedKey;
}

/** Encrypt an MFA secret for storage. */
export function sealMfaSecret(plain: string): string {
  return encryptSecret(plain, mfaKey());
}

/** Read a stored MFA secret (accepts legacy plaintext). */
export function openMfaSecret(stored: string): string {
  return decryptSecret(stored, mfaKey());
}

/** True when the stored value is legacy plaintext and should be re-encrypted. */
export function isLegacyMfaSecret(stored: string): boolean {
  return !isEncryptedSecret(stored);
}
