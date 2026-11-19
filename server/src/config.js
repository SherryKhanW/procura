import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Resolve relative to this module, regardless of the launch directory.
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

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
