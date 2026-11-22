/* Excel import helpers: match sheet headings to a module's fields and clean up typed values
   ("16GB" -> "16 GB", "11 PRO" -> "Windows 11 Pro", "INSTALLED" -> "Installed").
   The server still validates every row exactly like a manual entry. */
import { MODS } from './modules.js';
import { DB, comboList, label } from './core.js';

const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const importable = mod => !!(MODS[mod] && MODS[mod].importKey);

/** existing record this sheet row stands for: same import key, or (when the key is blank) the same importMatch fields on a record without a key */
export function findExisting(mod, data) {
  const m = MODS[mod]; const k = m.importKey; const key = String(data[k] || '').trim().toLowerCase();
  if (key) return DB[mod].find(r => String(r[k] || '').trim().toLowerCase() === key) || null;
  const by = m.importMatch || []; if (!by.length || by.some(f => !String(data[f] || '').trim())) return null;
  return DB[mod].find(r => !String(r[k] || '').trim() && by.every(f => norm(r[f]) === norm(data[f]))) || null;
}
/** fields that can be filled from a sheet (no read-only, calculated or section rows) */
function importFields(mod) {
  return MODS[mod].fields.filter(f => f.k && !f.ro && !f.listOnly && !f.viewOnly && f.t !== 'calc' && f.t !== 'sec' && f.t !== 'password' && f.t !== 'table' && f.t !== 'multiref');
}

/** heading text -> field key (or '' when the column is not used) */
export function matchHeader(mod, heading) {
  const h = norm(heading); if (!h) return '';
  const aliases = MODS[mod].importAliases || {};
  for (const f of importFields(mod)) {
    const names = [f.k, f.l, ...(aliases[f.k] || [])].map(norm);
    if (names.includes(h)) return f.k;
  }
  for (const f of importFields(mod)) { // looser: heading starts with the field label, e.g. "Processor / Generation" vs "Processor"
    const l = norm(f.l); if (l.length >= 4 && (h.startsWith(l) || l.startsWith(h) && h.length >= 4)) return f.k;
  }
  return '';
}

/** finds the heading row (the row matching the most fields) within the first rows of a sheet */
export function findHeader(mod, rows) {
  let best = { index: -1, map: {}, hits: 0 };
  rows.slice(0, 15).forEach((r, i) => {
    const map = {}; let hits = 0; const used = new Set();
    r.forEach((cell, c) => { const k = matchHeader(mod, cell); if (k && !used.has(k)) { map[c] = k; used.add(k); hits++; } });
    if (hits > best.hits) best = { index: i, map, hits };
  });
  return best.hits >= 2 ? best : null;
}

/** turns one typed cell into the value the field expects */
export function cleanValue(f, raw) {
  let v = String(raw ?? '').trim();
  if (!v) return '';
  if (f.t === 'number') { const n = Number(v.replace(/[₹,\s]/g, '')); return Number.isFinite(n) ? n : v; }
  if (f.t === 'date') {
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(v); // DD-MM-YYYY (India)
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const d = new Date(v); return isNaN(d) ? v : d.toISOString().slice(0, 10);
  }
  if (f.t === 'select' && f.o) {
    const opts = Array.isArray(f.o) ? f.o : comboList(f.o); const n = norm(v);
    const exact = opts.find(o => norm(o) === n); if (exact) return exact;
    if (/^\d+(\.\d+)?$/.test(v)) { const unit = opts.find(o => o === v + ' GB') || opts.find(o => o === v + ' TB'); if (unit) return unit; } // RAM / storage typed as a plain number
    const near = opts.filter(o => { const on = norm(o); return n.length >= 3 && (on.startsWith(n) || on.includes(n) || n.includes(on)); });
    if (near.length === 1) return near[0];
    if (near.length > 1) { const starts = near.filter(o => norm(o).startsWith(n)); if (starts.length === 1) return starts[0]; }
    return v; // left as typed: the preview shows it as a problem
  }
  if (f.t === 'ref' && f.c) { // typed name -> record: full label first, then a short name (e.g. the location's own name) if only one record has it
    const list = DB[f.c] || []; const r = list.find(x => x.id === v || norm(label(f.c, x.id)) === norm(v)); if (r) return r.id;
    const short = list.filter(x => [x.siteName, x.siteCode, x.name, x.code].some(s => s && norm(s) === norm(v))); return short.length === 1 ? short[0].id : v;
  }
  if (f.t === 'aref') { const a = (DB.assets || []).find(x => x.id === v || norm(x.assetTag) === norm(v)); return a ? a.id : v; } // asset tag -> asset
  if (f.v === 'mac') return v.toUpperCase().replace(/-/g, ':');
  return v;
}

/**
 * Builds the data to save for one sheet row.
 * existing: the record with the same key (updates fill only the cells that have a value)
 */
export function rowToData(mod, cells, map, existing) {
  const m = MODS[mod]; const blankDefault = m.importBlank || {}; const data = {};
  const fields = Object.fromEntries(importFields(mod).map(f => [f.k, f]));
  const words = m.importValues || {};
  Object.entries(map).forEach(([c, k]) => {
    const typed = String(cells[c] ?? '').trim(); if (!typed) return; const w = (words[k] || {})[norm(typed)];
    const v = w !== undefined ? w : cleanValue(fields[k], typed); if (v !== '') data[k] = v;
  });
  if (existing) return { ...existing, ...data };
  Object.values(fields).forEach(f => {
    if (data[f.k] !== undefined) return;
    if (blankDefault[f.k] !== undefined) data[f.k] = blankDefault[f.k];
    else if (f.def !== undefined) data[f.k] = typeof f.def === 'function' ? f.def() : f.def;
  });
  return data;
}
