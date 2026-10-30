/* MongoDB store (Mongoose). Records are kept with string ids (_id = id).
   Field rules live in shared/engine.js so the same validation runs for every write. */
import mongoose from 'mongoose';
import { DATA_COLS, INDEXES } from './collections.js';

const models = {};
const flexible = () => new mongoose.Schema({ _id: { type: String, required: true } }, { strict: false, versionKey: false, minimize: false, id: false });
function model(name) {
  if (models[name]) return models[name];
  const schema = flexible();
  (INDEXES[name] || []).forEach(([fields, opts]) => schema.index(fields, opts));
  if (name === 'audits') { schema.index({ at: -1 }); schema.index({ ref: 1 }); schema.index({ user: 1 }); }
  return (models[name] = mongoose.model(name, schema, name));
}
const out = d => { if (!d) return d; const { _id, ...rest } = d; return { id: _id, ...rest }; };
const inn = d => { const { id, _id, ...rest } = d; return { _id: id || _id, ...rest }; };

export function createMongoStore(uri) {
  return {
    name: 'mongo',
    async connect() { await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 }); for (const c of [...DATA_COLS, 'audits', 'settings']) await model(c).init(); },
    async loadAll() {
      const res = {}; await Promise.all(DATA_COLS.map(async c => { res[c] = (await model(c).find({}).lean()).map(out); }));
      const s = await model('settings').findById('masters').lean(); res.masters = s ? s.masters : null; res.ver = s ? s.ver : 0; return res;
    },
    async getAll(col) { return (await model(col).find({}).lean()).map(out); },
    async getDoc(col, id) { return out(await model(col).findById(id).lean()); },
    async saveDocs(col, docs) { if (!docs.length) return; await model(col).bulkWrite(docs.map(d => ({ replaceOne: { filter: { _id: d.id }, replacement: inn(d), upsert: true } }))); },
    async deleteDoc(col, id) { await model(col).deleteOne({ _id: id }); },
    async saveSettings(masters, ver) { await model('settings').replaceOne({ _id: 'masters' }, { _id: 'masters', masters, ver }, { upsert: true }); },
    async addAudit(entries) { if (entries.length) await model('audits').insertMany(entries.map(inn), { ordered: false }); },
    async listAudit({ q, user, ref, limit = 500 }) {
      const f = {}; if (user) f.user = user; if (ref) f.$or = [{ ref }, { detail: { $regex: ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') } }];
      if (q) { const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }; f.$and = [{ $or: [{ action: rx }, { module: rx }, { ref: rx }, { detail: rx }, { user: rx }] }]; }
      return (await model('audits').find(f).sort({ at: -1 }).limit(Math.min(+limit || 500, 3000)).lean()).map(out);
    },
    async auditUsers() { return (await model('audits').distinct('user')).sort(); },
    async replaceAll(data) {
      for (const c of DATA_COLS) { await model(c).deleteMany({}); if ((data[c] || []).length) await model(c).insertMany(data[c].map(inn)); }
      await this.saveSettings(data.masters, data.ver);
      if (data.audit && data.audit.length) { await model('audits').deleteMany({}); await this.addAudit(data.audit.map(a => ({ ...a, id: a.id }))); }
    },
    async isEmpty() { return (await model('users').countDocuments()) === 0; },
    async close() { await mongoose.disconnect(); },
  };
}
