import { config, configProblems } from './config.js';
import { openStore } from './store/index.js';
import { ensureInitialised } from './service.js';
import { createApp } from './app.js';

if (configProblems.length) { configProblems.forEach(p => console.error(p)); process.exit(1); }
const store = await openStore();
await ensureInitialised(config.adminPassword);
const app = createApp();
const server = app.listen(config.port, () => console.log(`[api] DJJS IT Asset Management on http://localhost:${config.port} (store: ${store.name})`));
const stop = async () => { server.close(); await store.close(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
