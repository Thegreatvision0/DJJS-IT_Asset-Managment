/* In-memory store for trying the app without MongoDB (DATA_STORE=memory).
   If DATA_FILE is set, data is written to that JSON file so it survives restarts. Not for production. */
import fs from 'node:fs';
import path from 'node:path';
import { DATA_COLS } from './collections.js';

export function createMemoryStore(file) {
  let db = { masters: null, ver: 0, audits: [] }; DATA_COLS.forEach(c => db[c] = []);
  let timer = null;
  const persist = () => { if (!file) return; clearTimeout(timer); timer = setTimeout(() => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(db)); }, 200); };
  const cp = o => JSON.parse(JSON.stringify(o));
  return {
    name: 'memory',
    async connect() { if (file && fs.existsSync(file)) { db = Object.assign(db, JSON.parse(fs.readFileSync(file, 'utf8'))); } },
    async loadAll() { const r = {}; DATA_COLS.forEach(c => r[c] = cp(db[c])); r.masters = cp(db.masters); r.ver = db.ver; return r; },
    async getAll(col) { return cp(db[col]); },
    async getDoc(col, id) { const d = db[col].find(x => x.id === id); return d ? cp(d) : null; },
    async saveDocs(col, docs) { docs.forEach(d => { const i = db[col].findIndex(x => x.id === d.id); if (i >= 0) db[col][i] = cp(d); else db[col].push(cp(d)); }); persist(); },
    async deleteDoc(col, id) { db[col] = db[col].filter(x => x.id !== id); persist(); },
    async saveSettings(masters, ver) { db.masters = cp(masters); db.ver = ver; persist(); },
    async addAudit(entries) { db.audits.unshift(...cp(entries).reverse()); if (db.audits.length > 20000) db.audits.length = 20000; persist(); },
    async listAudit({ q, user, ref, limit = 500 }) {
      const ql = (q || '').toLowerCase();
      return db.audits.filter(a => (!user || a.user === user) && (!ref || a.ref === ref || (a.detail || '').includes(ref)) && (!ql || [a.action, a.module, a.ref, a.detail, a.user].join(' ').toLowerCase().includes(ql))).slice(0, Math.min(+limit || 500, 3000));
    },
    async auditUsers() { return [...new Set(db.audits.map(a => a.user))].sort(); },
    async replaceAll(data) { DATA_COLS.forEach(c => db[c] = cp(data[c] || [])); db.masters = cp(data.masters); db.ver = data.ver; if (data.audit) db.audits = cp(data.audit); persist(); },
    async isEmpty() { return db.users.length === 0; },
    async close() { },
  };
}
