/* Create or reset a System Administrator. Usage: npm run create-admin -- <username> <password> */
import { openStore } from './store/index.js';
import { hashPassword } from './security.js';
import { defaultRoles } from '../../shared/seed.js';
const [username, password] = process.argv.slice(2);
if (!username || !password || password.length < 6) { console.log('Usage: npm run create-admin -- <username> <password (min 6)>'); process.exit(1); }
const store = await openStore();
const roles = await store.getAll('roles'); let admin = roles.find(r => r.all);
if (!admin) { admin = defaultRoles()[0]; await store.saveDocs('roles', [admin]); }
const users = await store.getAll('users'); let u = users.find(x => x.username.toLowerCase() === username.toLowerCase());
u = Object.assign(u || { id: 'u_' + Date.now().toString(36), username, name: username, department: 'IT', createdAt: new Date().toISOString() }, { roleId: admin.id, active: 'Yes', pwHash: hashPassword(password) });
await store.saveDocs('users', [u]); console.log('Administrator ready: ' + username); await store.close();
