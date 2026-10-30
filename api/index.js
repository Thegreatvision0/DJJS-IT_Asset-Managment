/* Vercel serverless entry: every /api/* request is routed here (see vercel.json).
   The database connection and Express app are created once per instance and reused. */
import { config, configProblems } from '../server/src/config.js';
import { openStore } from '../server/src/store/index.js';
import { ensureInitialised } from '../server/src/service.js';
import { createApp } from '../server/src/app.js';

let ready = null;
const boot = () => (ready ??= (async () => {
  await openStore();
  await ensureInitialised(config.adminPassword);
  return createApp();
})().catch(e => { ready = null; throw e; })); // retry on the next request after a failed start

export default async function handler(req, res) {
  if (configProblems.length) {
    console.error('[config] ' + configProblems.join(' '));
    return res.status(503).json({ error: 'Server is not configured yet: ' + configProblems.join(' ') + ' Add it in Vercel → Settings → Environment Variables, then redeploy.' });
  }
  try { const app = await boot(); return app(req, res); }
  catch (e) {
    console.error('[startup]', e);
    const db = /mongo|server selection|ECONNREFUSED|ENOTFOUND|auth/i.test(String(e && (e.name + e.message)));
    return res.status(503).json({ error: db ? 'Cannot reach the database. Check MONGODB_URI and allow 0.0.0.0/0 in MongoDB Atlas → Network Access.' : 'Server failed to start — see the Vercel function logs.' });
  }
}
