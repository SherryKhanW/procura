import mariadb from 'mariadb';
import { readFileSync } from 'node:fs';
import { readDatabaseConfig } from './config.js';

export function createDatabasePool() {
  const { sslEnabled, caPath, ...config } = readDatabaseConfig();
  const ssl = sslEnabled ? { rejectUnauthorized: true, ...(caPath ? { ca: readFileSync(caPath, 'utf8') } : {}) } : undefined;
  return mariadb.createPool({
    ...config, ssl, connectionLimit: 5, connectTimeout: 5000, acquireTimeout: 10000,
    multipleStatements: false,
  });
}
