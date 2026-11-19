import { readAppConfig } from './config.js';
import { createApp } from './app.js';
import { createDatabasePool } from './db.js';
import { createAuthRepository } from './auth/repository.js';
import { createAdminRepository } from './admin/repository.js';

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid port.');
const config = readAppConfig();
const pool = createDatabasePool();
const repository = { ...createAuthRepository(pool), ...createAdminRepository(pool) };
const server = createApp({ repository, config }).listen(port, host, () => console.log(`Procura API listening on ${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(async () => {
  await pool.end();
  process.exit(0);
}));
