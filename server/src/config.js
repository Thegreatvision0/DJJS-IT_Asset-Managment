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
  store: env.DATA_STORE || (env.MONGODB_URI ? 'mongo' : 'memory'),
  dataFile: env.DATA_FILE || '',
  jwtSecret: env.JWT_SECRET || '',
  tokenHours: Number(env.TOKEN_HOURS) || 12,
  adminPassword: env.ADMIN_PASSWORD || '',
  clientDist: path.resolve(here, '../../client/dist'),
  production: env.NODE_ENV === 'production' || !!env.VERCEL,
  serverless: !!env.VERCEL,
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
// serverless instances have no lasting disk, so demo (memory) data would vanish
if (config.serverless && config.store !== 'mongo') configProblems.push('MONGODB_URI must be set on Vercel (demo/memory mode cannot keep data there).');
