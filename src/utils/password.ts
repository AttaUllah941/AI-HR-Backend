import bcrypt from 'bcryptjs';

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}


/**
 * A valid bcrypt hash (12 rounds) of a random value nobody knows. Checking a password against it
 * costs the same as a real check, so an unknown email cannot be told apart by response time.
 */
const UNKNOWN_USER_HASH = '$2b$12$q/99pzoMEiGPQFyHDpx21uHOVtxoBMdlRE6siAXSKcwqMeM2U4IbK';

export async function spendPasswordCheckTime(plain: string): Promise<void> {
  await bcrypt.compare(plain, UNKNOWN_USER_HASH);
}
