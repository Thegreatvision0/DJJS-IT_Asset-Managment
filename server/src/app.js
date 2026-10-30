import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { securityHeaders } from './security.js';
import authRoutes from './routes/auth.js';
import dataRoutes from './routes/data.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(securityHeaders);
  const json = express.json({ limit: '5mb' });
  app.use((req, res, next) => req.path === '/api/restore' ? next() : json(req, res, next));
  app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  app.use('/api/auth', authRoutes);
  app.use('/api', dataRoutes);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  if (fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
    app.get('*', (req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
  }
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Server error — please try again' : err.message, ...(err.extra || {}) });
  });
  return app;
}
