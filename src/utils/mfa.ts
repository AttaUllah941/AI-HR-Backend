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
