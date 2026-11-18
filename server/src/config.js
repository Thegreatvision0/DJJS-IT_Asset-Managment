import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.resolve(here, '../.env');
if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') process.loadEnvFile(envFile);

const env = process.env;
export const config = {
  port: Number(env.PORT) || 5000,
  mongoUri: env.MONGODB_URI || '',
  // on Vercel there is no lasting disk, so MongoDB is always used when it is configured
  store: env.VERCEL && env.MONGODB_URI ? 'mongo' : env.DATA_STORE || (env.MONGODB_URI ? 'mongo' : 'memory'),
  dataFile: env.DATA_FILE || '',
  jwtSecret: env.JWT_SECRET || '',
  tokenHours: Math.min(720, Math.max(1, Number(env.TOKEN_HOURS) || 12)),
  // number of proxies in front of the server: 1 on Vercel, none for the office server unless TRUST_PROXY says so
  trustProxy: env.TRUST_PROXY !== undefined ? (Number(env.TRUST_PROXY) || false) : (env.VERCEL ? 1 : false),
  adminPassword: env.ADMIN_PASSWORD || '',
  clientDist: path.resolve(here, '../../client/dist'),
  production: env.NODE_ENV === 'production' || !!env.VERCEL,
  serverless: !!env.VERCEL,
  // Active Directory sign-in (office server only — a cloud host cannot reach the domain controllers)
  ad: {
    urls: env.VERCEL ? [] : String(env.AD_URL || '').split(',').map(s => s.trim()).filter(Boolean),
    domain: String(env.AD_DOMAIN || '').trim(),
    baseDN: String(env.AD_BASE_DN || '').trim() || String(env.AD_DOMAIN || '').split('.').filter(Boolean).map(p => 'DC=' + p).join(','),
    allowPlain: env.AD_ALLOW_PLAIN === '1',
    label: String(env.AD_LABEL || '').trim() || String(env.AD_DOMAIN || '').split('.')[0].toUpperCase(),
  },
  // HTTPS (office server): a .pfx certificate, or a PEM certificate + key
  publicHost: String(env.PUBLIC_HOST || '').trim(), // site name used for http → https redirects
  https: { pfx: env.HTTPS_PFX || '', pfxPass: env.HTTPS_PFX_PASS || '', cert: env.HTTPS_CERT || '', key: env.HTTPS_KEY || '', port: Number(env.HTTPS_PORT) || 443 },
};
/** settings that must be fixed before the app can serve requests (empty when all is well) */
export const configProblems = [];
if (!config.jwtSecret || config.jwtSecret.startsWith('change-this')) {
  if (config.production) configProblems.push('JWT_SECRET must be set to a long random value in production.');
  else {
    config.jwtSecret = crypto.randomBytes(32).toString('hex');
    console.warn('[config] JWT_SECRET not set — using a temporary secret (everyone is logged out on restart).');
  }
}
if (config.production && config.jwtSecret && config.jwtSecret.length < 32) console.warn('[config] JWT_SECRET is shorter than 32 characters — use a longer random value.');
if (config.ad.urls.length && !config.ad.domain) configProblems.push('AD_DOMAIN must be set when AD_URL is set (e.g. AD_DOMAIN=NRM.ORG).');
// serverless instances have no lasting disk, so demo (memory) data would vanish
if (config.serverless && config.store !== 'mongo') configProblems.push('MONGODB_URI must be set on Vercel (demo/memory mode cannot keep data there).');
