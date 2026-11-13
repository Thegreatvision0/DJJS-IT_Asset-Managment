import { config } from '../config.js';
import { createMemoryStore } from './memoryStore.js';
let store;
const listeners = [];
/** called after every data write with (newRev, method, args) — the service keeps its cache in step this way */
export const onWrite = fn => listeners.push(fn);

/* every method that changes records bumps the revision counter afterwards */
const WRITES = ['saveDocs', 'deleteDoc', 'saveSettings', 'replaceAll'];
function tracked(st) {
  WRITES.forEach(name => {
    const fn = st[name]; if (!fn) return;
    st[name] = async (...args) => { const out = await fn.apply(st, args); const rev = await st.bumpRev(); listeners.forEach(l => l(rev, name, args)); return out; };
  });
  return st;
}

export async function openStore() {
  if (config.store === 'mongo') {
    if (!config.mongoUri) throw new Error('MONGODB_URI is not set');
    const { createMongoStore } = await import('./mongoStore.js');
    store = tracked(createMongoStore(config.mongoUri));
  } else store = tracked(createMemoryStore(config.dataFile));
  await store.connect();
  return store;
}
export const getStore = () => store;
