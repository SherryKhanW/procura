import express from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readAppConfig } from './config.js';
import { createAuth, protectWrites } from './auth/routes.js';
import { createAdminRouter } from './admin/routes.js';
import { AdminError } from './admin/validation.js';
import { createCatalogRouter, createDeliveryRouter, createOrderRouter, createRequestRouter } from './procurement/routes.js';
import { ProcurementError } from './procurement/validation.js';

export function createApp({ repository, config = readAppConfig() } = {}) {
  if (!repository) throw new Error('An authentication repository is required.');
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.proxyHops || false);
  app.use(helmet({ contentSecurityPolicy: { directives: {
    'upgrade-insecure-requests': config.production ? [] : null,
  } } }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', protectWrites(config));
  app.use(express.json({ limit: '100kb' }));
  // Liveness only: does not expose credentials, table names, or database data.
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'procura-api' }));
  const auth = createAuth({ repository, config });
  app.use('/api/auth', auth.router);
  // All future business endpoints belong below this authentication guard.
  app.use('/api', auth.requireAuth);
  app.use('/api/admin', createAdminRouter(repository));
  app.use('/api/catalog', createCatalogRouter(repository));
  app.use('/api/requests', createRequestRouter(repository));
  app.use('/api/orders', createOrderRouter(repository));
  app.use('/api/deliveries', createDeliveryRouter(repository));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found' }));
  const clientDist = fileURLToPath(new URL('../../client/dist/', import.meta.url));
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('/{*path}', (_req, res) => res.sendFile('index.html', { root: clientDist }));
  }
  app.use((error, _req, res, _next) => {
    if (error instanceof AdminError || error instanceof ProcurementError) return res.status(error.status).json({ error: error.message });
    const badJson = error.type === 'entity.parse.failed';
    const tooLarge = error.type === 'entity.too.large';
    const databaseError = Boolean(error.sqlState || error.errno || ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'].includes(error.code));
    // Never expose SQL, account details, driver messages, hashes, or passwords.
    res.status(badJson ? 400 : tooLarge ? 413 : databaseError ? 503 : 500).json({ error: badJson ? 'Invalid JSON' : tooLarge ? 'Request too large' : databaseError ? 'The database service is unavailable. Please try again later.' : 'Unexpected server error' });
  });
  return app;
}
