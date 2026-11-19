import express from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  // Liveness only: does not expose credentials, table names, or database data.
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'procura-api' }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found' }));
  const clientDist = fileURLToPath(new URL('../../client/dist/', import.meta.url));
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('/{*path}', (_req, res) => res.sendFile('index.html', { root: clientDist }));
  }
  app.use((error, _req, res, _next) => {
    const badJson = error.type === 'entity.parse.failed';
    const tooLarge = error.type === 'entity.too.large';
    res.status(badJson ? 400 : tooLarge ? 413 : 500).json({ error: badJson ? 'Invalid JSON' : tooLarge ? 'Request too large' : 'Unexpected server error' });
  });
  return app;
}
