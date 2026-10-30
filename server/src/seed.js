/* Loads fictional sample data. Usage: npm run seed  (add -- --force to replace existing data) */
import { openStore } from './store/index.js';
import { seed } from '../../shared/seed.js';
import { hashPassword } from './security.js';

const store = await openStore();
if (!(await store.isEmpty()) && !process.argv.includes('--force')) { console.log('Database already has data. Run "npm run seed -- --force" to REPLACE everything with sample data.'); await store.close(); process.exit(1); }
const data = seed((u, p) => hashPassword(p));
data.users.forEach(u => delete u.demo);
await store.replaceAll(data);
console.log(`Sample data loaded: ${data.assets.length} assets. Logins: admin/admin123, manager/manager123, support/support123, coordinator/coord123, auditor/audit123 — change these passwords.`);
await store.close();
