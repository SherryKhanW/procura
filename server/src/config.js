import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Resolve relative to this module, regardless of the launch directory.
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

export function readAppConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  if (production && !env.APP_ORIGIN) throw new Error('Set APP_ORIGIN to the public HTTPS application origin in production.');
  const origin = env.APP_ORIGIN || 'http://127.0.0.1:5173';
  let parsed;
  try { parsed = new URL(origin); } catch { throw new Error('APP_ORIGIN must be a valid HTTP(S) origin.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin || (production && parsed.protocol !== 'https:')) {
    throw new Error('APP_ORIGIN must be an HTTP(S) origin without a trailing slash; production requires HTTPS.');
  }
  const proxyHops = Number(env.TRUST_PROXY_HOPS || 0);
  if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 5) throw new Error('TRUST_PROXY_HOPS must be between 0 and 5.');
  return { production, origin, proxyHops };
}

export function readDatabaseConfig(env = process.env) {
  for (const name of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
    if (!env[name]) throw new Error(`Set ${name} in server/.env before checking the database.`);
  }
  const port = Number(env.DB_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('DB_PORT must be a valid port.');
  if (!['true', 'false'].includes(env.DB_SSL || 'false')) throw new Error('DB_SSL must be true or false.');
  return {
    host: env.DB_HOST, port, database: env.DB_NAME, user: env.DB_USER,
    password: env.DB_PASSWORD, sslEnabled: env.DB_SSL === 'true', caPath: env.DB_SSL_CA,
  };
}
