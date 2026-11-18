/* Moves the whole database between servers as one file (no MongoDB tools needed).
     node src/dbTransfer.js export <file.json>            copy every collection of MONGODB_URI into a file
     node src/dbTransfer.js import <file.json> [--force]  load that file into MONGODB_URI (refuses a non-empty database without --force)
   Keeps ids, dates and number types exactly (MongoDB Extended JSON). The file contains user password hashes —
   store and copy it like a backup, and delete temporary copies afterwards. */
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { config } from './config.js';

const [cmd, file, flag] = process.argv.slice(2);
if (!['export', 'import'].includes(cmd) || !file) { console.log('usage: node src/dbTransfer.js export|import <file.json> [--force]'); process.exit(1); }
if (!config.mongoUri) { console.error('MONGODB_URI is not set in server/.env'); process.exit(1); }
const { EJSON } = mongoose.mongo.BSON;

try { await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 }); }
catch (e) { console.error('Failed: cannot connect to MongoDB -', e.message); process.exit(1); }
const db = mongoose.connection.db;
try {
  if (cmd === 'export') {
    const out = { app: 'djjs-itam', exportedAt: new Date().toISOString(), database: db.databaseName, collections: {} };
    for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
      if (name.startsWith('system.')) continue;
      out.collections[name] = await db.collection(name).find({}).toArray();
    }
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    fs.writeFileSync(file, EJSON.stringify(out, { relaxed: false }));
    console.log(`Exported ${db.databaseName}: ` + Object.entries(out.collections).map(([k, v]) => `${k} ${v.length}`).join(', ') + ` -> ${file}`);
  } else {
    const data = EJSON.parse(fs.readFileSync(file, 'utf8'), { relaxed: false });
    if (data.app !== 'djjs-itam' || !data.collections) throw new Error('This is not a DJJS IT Asset Management export file');
    const existing = (await db.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name).filter(n => !n.startsWith('system.'));
    let used = 0; for (const n of existing) used += await db.collection(n).estimatedDocumentCount();
    if (used && flag !== '--force') throw new Error(`The target database "${db.databaseName}" already has ${used} record(s). Use --force to replace it.`);
    for (const n of existing) if (!data.collections[n]) await db.collection(n).drop(); // --force: the database becomes exactly the file
    for (const [name, docs] of Object.entries(data.collections)) {
      const c = db.collection(name); await c.deleteMany({});
      for (let i = 0; i < docs.length; i += 1000) await c.insertMany(docs.slice(i, i + 1000), { ordered: true });
    }
    console.log(`Imported into ${db.databaseName}: ` + Object.entries(data.collections).map(([k, v]) => `${k} ${v.length}`).join(', '));
  }
} catch (e) { console.error('Failed:', e.message); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
