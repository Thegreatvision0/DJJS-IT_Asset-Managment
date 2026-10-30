/* One form field of any type defined in shared/modules.js */
import React from 'react';
import { DB, M, comboList, optLabel, live, portOpts, fmtDT, money, tagOf, label } from '@shared/core.js';
import { api, useApp } from '../lib.jsx';

export const normOpts = opts => (opts || []).map(o => o && typeof o === 'object' && !Array.isArray(o) ? o : Array.isArray(o) ? { v: o[0], l: o[1] } : { v: o, l: o });
export function Select({ id, opts, value, onChange, disabled, extraNew, placeholder = '— Select —' }) {
  const n = normOpts(opts); const cur = value == null ? '' : String(value); const has = n.some(o => String(o.v) === cur);
  return <select id={id} value={cur} disabled={disabled} onChange={e => onChange(e.target.value)}>
    <option value="">{placeholder}</option>
    {n.map(o => <option key={String(o.v)} value={String(o.v)} disabled={!!o.dis && String(o.v) !== cur}>{o.l}</option>)}
    {cur && !has && <option value={cur}>{cur}</option>}
    {extraNew && <option value="__new">+ Add new…</option>}
  </select>;
}
export function CategorySelect({ id, value, onChange, disabled }) {
  const groups = DB.masters.catGroups || {}; const flat = M('categories');
  return <select id={id} value={value || ''} disabled={disabled} onChange={e => onChange(e.target.value)}>
    <option value="">— Select item type —</option>
    {Object.entries(groups).map(([g, l]) => <optgroup key={g} label={g}>{l.map(c => <option key={c} value={c}>{c}</option>)}</optgroup>)}
    {value && !flat.includes(value) && <option value={value}>{value}</option>}
  </select>;
}
export const calcText = (f, v) => v === '' || v == null ? '' : /cost|amount|Cost|Amount/.test(f.k) && !isNaN(v) ? money(v) : String(v);

export default function Field({ f, value, onChange, ctxVals = {}, rec, mod, view, required, bad, idPrefix = 'fld_' }) {
  const { apply, toast } = useApp();
  const id = idPrefix + f.k; const dis = !!(view || f.ro || f.t === 'calc');
  let inp;
  switch (f.t) {
    case 'select': inp = f.o === 'categories' ? <CategorySelect id={id} value={value} onChange={onChange} disabled={dis} /> : <Select id={id} opts={Array.isArray(f.o) ? f.o : M(f.o)} value={value} onChange={onChange} disabled={dis} />; break;
    case 'combo': {
      const pick = async v => {
        if (v !== '__new') return onChange(v);
        const lab = f.l; const nv = (window.prompt('Add new — ' + lab) || '').trim(); if (!nv) return;
        try { const r = await api('/settings/combo', { method: 'POST', body: { key: f.o, value: nv } }); apply({ masters: r.masters }); onChange(r.value); toast(`“${r.value}” added — it will be in the list from now on`); }
        catch (e) { toast(e.message, 1); }
      };
      inp = <Select id={id} opts={comboList(f.o)} value={value} onChange={pick} disabled={dis} extraNew={!dis} />; break;
    }
    case 'ref': { let list = DB[f.c] || []; if (f.filter && !view) list = list.filter(r => r.id === value || f.filter(r)); inp = <Select id={id} opts={list.map(r => [r.id, optLabel(f.c, r)])} value={value} onChange={onChange} disabled={dis} />; break; }
    case 'aref': {
      let list = (DB.assets || []).filter(a => (!f.cats || f.cats.includes(a.categoryId)) && (a.id === value || live(a)));
      if (mod === 'assets' && rec) list = list.filter(a => a.id !== rec.id);
      if (f.notSame && ctxVals[f.notSame]) list = list.filter(a => a.id !== ctxVals[f.notSame] || a.id === value);
      inp = <Select id={id} opts={list.map(a => [a.id, `${a.assetTag} — ${a.name}`])} value={value} onChange={onChange} disabled={dis} />; break;
    }
    case 'dyn': inp = <Select id={id} opts={f.opts(ctxVals, rec)} value={value} onChange={onChange} disabled={dis} />; break;
    case 'portsel': {
      const devId = ctxVals[f.dev]; const opts = portOpts(devId, value, rec ? rec.id : null);
      inp = opts ? <Select id={id} opts={opts} value={value} onChange={onChange} disabled={dis} /> : <input id={id} value={value ?? ''} disabled={dis} placeholder={devId ? 'Port / channel' : 'Select the device first'} onChange={e => onChange(e.target.value)} />; break;
    }
    case 'multiref': {
      const opts = normOpts(f.opts(ctxVals)); const cur = Array.isArray(value) ? value : [];
      const extra = cur.filter(x => !opts.some(o => o.v === x)).map(x => ({ v: x, l: label('assets', x) }));
      inp = <div className="chk" id={id}>{[...opts, ...extra].map(o => <label key={o.v}><input type="checkbox" checked={cur.includes(o.v)} disabled={dis} onChange={e => onChange(e.target.checked ? [...cur, o.v] : cur.filter(x => x !== o.v))} /> {o.l}</label>)}{!opts.length && !extra.length && <span className="muted">Nothing to select</span>}</div>; break;
    }
    case 'table': inp = <TableField id={id} f={f} rows={Array.isArray(value) ? value : []} onChange={onChange} disabled={dis} />; break;
    case 'textarea': inp = <textarea id={id} value={value ?? ''} disabled={dis} onChange={e => onChange(e.target.value)} />; break;
    case 'password': inp = <input id={id} type="password" autoComplete="new-password" value={value ?? ''} disabled={dis} onChange={e => onChange(e.target.value)} />; break;
    case 'tel': inp = <input id={id} type="tel" inputMode="numeric" maxLength={f.v === 'pin' ? 6 : 12} value={value ?? ''} disabled={dis} onChange={e => onChange(e.target.value.replace(/\D/g, ''))} />; break;
    case 'calc': inp = <input id={id} value={calcText(f, value)} disabled style={f.k === 'lossResult' ? { color: value === 'Fail' ? '#b42318' : value === 'Pass' ? '#0f7a4f' : undefined } : undefined} />; break;
    case 'datetime': inp = <input id={id} value={fmtDT(value)} disabled />; break;
    default: inp = <input id={id} type={['number', 'date', 'time', 'email'].includes(f.t) ? f.t : 'text'} value={value ?? ''} disabled={dis} min={f.t === 'number' ? 0 : undefined} step={f.t === 'number' ? 'any' : undefined} onChange={e => onChange(e.target.value)} />;
  }
  const full = f.full || f.t === 'table' || f.t === 'multiref';
  return <div className={`f ${full ? 'full' : ''} ${f.t === 'calc' ? 'calc' : ''} ${bad ? 'bad' : ''}`} id={'w_' + id}>
    <label htmlFor={id}>{f.l}{required && !view ? <i> *</i> : null}</label>{inp}{f.hint && !view && <span className="hint">{f.hint}</span>}
  </div>;
}

export function TableField({ id, f, rows, onChange, disabled }) {
  const set = (i, k, v) => onChange(rows.map((r, j) => j === i ? { ...r, [k]: v } : r));
  return <div className="tblf" id={id}><table><thead><tr>{f.cols.map(c => <th key={c.k}>{c.l}</th>)}{!disabled && <th />}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i}>{f.cols.map(c => <td key={c.k} style={c.w ? { minWidth: c.w } : undefined}>
      {c.t === 'select' ? <Select opts={Array.isArray(c.o) ? c.o : M(c.o)} value={r[c.k]} onChange={v => set(i, c.k, v)} disabled={disabled} />
        : <input data-c={c.k} type={c.t === 'number' ? 'number' : 'text'} min={c.t === 'number' ? 0 : undefined} step="any" value={r[c.k] ?? ''} disabled={disabled} onChange={e => set(i, c.k, e.target.value)} />}</td>)}
      {!disabled && <td><button type="button" className="btn sm red" onClick={() => onChange(rows.filter((_, j) => j !== i))}>✕</button></td>}</tr>)}</tbody></table>
    <div className="tfoot">{disabled ? <span /> : <button type="button" className="btn sm" onClick={() => onChange([...rows, { qty: 1 }])}>+ Add row</button>}<span className="muted">{rows.length ? '' : 'No rows'}</span></div></div>;
}
export { tagOf };
