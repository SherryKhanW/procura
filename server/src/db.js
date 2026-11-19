import mariadb from 'mariadb';
import { readFileSync } from 'node:fs';
import { readDatabaseConfig } from './config.js';

function databaseOptions() {
  const { sslEnabled, caPath, ...config } = readDatabaseConfig();
  const ssl = sslEnabled ? { rejectUnauthorized: true, ...(caPath ? { ca: readFileSync(caPath, 'utf8') } : {}) } : undefined;
  return {
    ...config, ssl, connectTimeout: 8000,
    multipleStatements: false,
  };
}

export function createDatabasePool() {
  return mariadb.createPool({ ...databaseOptions(), connectionLimit: 5, acquireTimeout: 10000 });
}

// A one-shot diagnostic must surface the original connection failure instead
// of a pool-acquisition timeout that masks DNS, TLS, and authentication errors.
export function createDatabaseConnection() {
  return mariadb.createConnection(databaseOptions());
}
