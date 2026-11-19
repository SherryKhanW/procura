import { randomBytes, scrypt as deriveKey, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(deriveKey);
// OWASP's 32 MiB scrypt configuration. Store parameters alongside each salt.
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const format = /^scrypt\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{128})$/;
// Unknown/unprovisioned accounts still perform the expensive verification.
const dummyHash = `scrypt$32768$8$3$${'0'.repeat(32)}$${'0'.repeat(128)}`;

export function validPassword(password) {
  return typeof password === 'string' && [...password].length >= 12 && [...password].length <= 128;
}

export async function hashPassword(password) {
  if (!validPassword(password)) throw new Error('Use a password between 12 and 128 characters.');
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64, options);
  return `scrypt$32768$8$3$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || [...password].length > 128) return false;
  const match = format.exec(typeof storedHash === 'string' ? storedHash : '') ?? format.exec(dummyHash);
  const key = await scrypt(password, match[1], 64, options);
  return timingSafeEqual(key, Buffer.from(match[2], 'hex')) && format.test(storedHash ?? '');
}

export function normalizeEmail(email) {
  if (typeof email !== 'string' || email.length > 255) return null;
  const normalized = email.trim().toLowerCase();
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@procura\.co$/.test(normalized) ? normalized : null;
}
