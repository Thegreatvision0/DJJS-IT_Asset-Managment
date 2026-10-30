import { config } from '../config.js';
import { createMemoryStore } from './memoryStore.js';
let store;
export async function openStore() {
  if (config.store === 'mongo') {
    if (!config.mongoUri) throw new Error('MONGODB_URI is not set');
    const { createMongoStore } = await import('./mongoStore.js');
    store = createMongoStore(config.mongoUri);
  } else store = createMemoryStore(config.dataFile);
  await store.connect();
  return store;
}
export const getStore = () => store;
