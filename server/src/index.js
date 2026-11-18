import { config, configProblems } from './config.js';
import { openStore } from './store/index.js';
import { ensureInitialised } from './service.js';
import { createApp } from './app.js';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';

if (configProblems.length) { configProblems.forEach(p => console.error(p)); process.exit(1); }
const store = await openStore();
await ensureInitialised(config.adminPassword);
const app = createApp();
const H = config.https; const servers = [];
if (H.pfx || (H.cert && H.key)) {
  // HTTPS on HTTPS_PORT; plain http on PORT only redirects to it, so passwords never travel unencrypted
  const tlsOpts = H.pfx ? { pfx: fs.readFileSync(H.pfx), passphrase: H.pfxPass } : { cert: fs.readFileSync(H.cert), key: fs.readFileSync(H.key) };
  servers.push(https.createServer({ ...tlsOpts, minVersion: 'TLSv1.2' }, app).listen(H.port, () => console.log(`[api] DJJS IT Asset Management on https://localhost${H.port === 443 ? '' : ':' + H.port} (store: ${store.name}${config.ad.urls.length ? ', domain sign-in on' : ''})`)));
  servers.push(http.createServer((req, res) => { const host = config.publicHost || String(req.headers.host || 'localhost').replace(/:\d+$/, '').replace(/[^a-z0-9.-]/gi, '') || 'localhost'; res.writeHead(301, { Location: `https://${host}${H.port === 443 ? '' : ':' + H.port}${req.url}` }); res.end(); }).listen(config.port));
} else {
  if (config.ad.urls.length) console.warn('[security] Domain sign-in is on but HTTPS is not configured — Windows passwords would cross the network unencrypted. Set HTTPS_PFX (see .env.example).');
  servers.push(app.listen(config.port, () => console.log(`[api] DJJS IT Asset Management on http://localhost:${config.port} (store: ${store.name}${config.ad.urls.length ? ', domain sign-in on' : ''})`)));
}
servers.forEach(s => s.on('error', e => { console.error('[api] cannot start:', e.code === 'EADDRINUSE' ? `port ${e.port} is already used by another program` : e.message); process.exit(1); }));
const stop = async () => { servers.forEach(s => s.close()); await store.close(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
