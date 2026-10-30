/* Generic add / edit / view form for any module. Fields, visibility and rules come from shared/. */
import React, { useEffect, useRef, useState } from 'react';
import { DB, fmtDT, catGroupOf, clone } from '@shared/core.js';
import { MODS } from '@shared/modules.js';
import { fieldVisible, fieldRequired, visibleSpecs, normalize, validateFields, FORM_CHANGE, refOf } from '@shared/engine.js';
import { api, useApp, Modal } from '../lib.jsx';
import Field from './Field.jsx';

const blank = f => (f.t === 'table' || f.t === 'multiref') ? [] : '';
function initialVals(mod, rec, preset, userName) {
  const v = {};
  MODS[mod].fields.forEach(f => { if (!f.k || f.listOnly) return; v[f.k] = rec ? (rec[f.k] ?? blank(f)) : preset && preset[f.k] !== undefined ? preset[f.k] : (typeof f.def === 'function' ? f.def({ userName }) : f.def ?? blank(f)); });
  if (mod === 'assets') v.specs = clone((rec && rec.specs) || (preset && preset.specs) || {});
  if (!rec && preset && FORM_CHANGE[mod]) Object.keys(preset).forEach(k => Object.assign(v, FORM_CHANGE[mod](k, v) || {}));
  return v;
}
const isEmpty = v => v === '' || v == null || (Array.isArray(v) && !v.length);

export default function RecordForm({ mod, id, preset, view, onSaved }) {
  const { me, mutate, closeModal, replaceModal, toast, can } = useApp();
  const m = MODS[mod]; const rec = id ? DB[mod].find(r => r.id === id) : null;
  const [vals, setVals] = useState(() => initialVals(mod, rec, preset, me.name));
  const [err, setErr] = useState(''); const [bad, setBad] = useState([]); const [busy, setBusy] = useState(false);
  const formRef = useRef();
  useEffect(() => { if (!view && formRef.current) { const el = formRef.current.querySelector('select:not([disabled]), input:not([disabled])'); if (el) el.focus(); } }, []);

  const set = (k, v) => setVals(prev => {
    const nv = { ...prev, [k]: v };
    if (mod === 'assets' && k === 'categoryId') { if (!prev.name || prev.name === prev.categoryId) nv.name = v; }
    const patch = FORM_CHANGE[mod] && FORM_CHANGE[mod](k, nv); if (patch) Object.assign(nv, patch);
    return nv;
  });
  const setSpec = (k, v) => setVals(prev => ({ ...prev, specs: { ...prev.specs, [k]: v } }));
  const opt = { rec, view };

  const fields = m.fields.filter(f => !f.listOnly);
  const shown = f => {
    if (!f.k) return true; if (!fieldVisible(mod, f, vals, opt)) return false;
    if (rec && f.ro && !view && isEmpty(rec[f.k])) return false;
    if (view && f.t !== 'calc' && isEmpty(vals[f.k]) && !f.r) return false;
    return true;
  };
  // drop section headers that have nothing visible under them
  const items = []; let sec = null, cnt = 0;
  fields.forEach(f => { if (f.t === 'sec') { if (sec && cnt) items.push(...sec); sec = [f]; cnt = 0; return; } const s = f.t === 'specs' ? mod === 'assets' : shown(f); if (!s) return; if (sec) { sec.push(f); cnt++; } else items.push(f); });
  if (sec && cnt) items.push(...sec);

  const submit = async () => {
    const data = normalize(mod, vals, rec); const v = validateFields(mod, data, rec);
    setBad(v.bad); if (v.errors.length) { setErr(v.errors.slice(0, 6).join(' · ') + (v.errors.length > 6 ? ` (+${v.errors.length - 6} more)` : '')); scrollToBad(v.bad[0]); return; }
    setBusy(true); setErr('');
    try {
      const r = await mutate(confirmed => api(rec ? `/${mod}/${rec.id}` : `/${mod}`, { method: rec ? 'PUT' : 'POST', body: { data: vals, confirmed } }), { quiet: true });
      if (!r) { setBusy(false); return; }
      closeModal(); toast([m.one + (m.numKey && r.record[m.numKey] ? ' ' + r.record[m.numKey] : '') + ' saved', ...(r.notices || [])].join(' · '));
      if (onSaved) onSaved(r.record);
    } catch (e) { setErr(e.message); if (e.fields) { setBad(e.fields); scrollToBad(e.fields[0]); } setBusy(false); }
  };
  const scrollToBad = k => setTimeout(() => { const w = document.getElementById('w_fld_' + k); if (w) w.scrollIntoView({ block: 'center' }); }, 0);
  const onKey = e => {
    if (e.key !== 'Enter' || view) return; const t = e.target; if (t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON' || t.type === 'checkbox') return;
    e.preventDefault(); const all = [...formRef.current.querySelectorAll('input:not([disabled]), select:not([disabled]), textarea:not([disabled])')].filter(x => x.offsetParent !== null);
    const i = all.indexOf(t); if (i >= 0 && i < all.length - 1) all[i + 1].focus(); else submit();
  };

  const title = view ? m.one + ' — ' + (refOf(mod, rec) || '') : (rec ? 'Edit ' : 'New ') + (mod === 'assets' && vals.categoryId ? vals.categoryId : m.one);
  const specFields = mod === 'assets' && vals.categoryId ? visibleSpecs(vals.categoryId, vals.specs) : [];
  const footer = view ? <>
    {mod === 'assets' && <button className="btn" onClick={() => replaceModal(<AssetDetailLazy id={id} />)}>Full History</button>}
    {can(mod, 'e') && <button className="btn" onClick={() => replaceModal(<RecordForm mod={mod} id={id} />)}>Edit</button>}
    <button className="btn pri" onClick={closeModal}>Close</button></>
    : <><button className="btn" onClick={closeModal}>Cancel</button><button className="btn pri" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Save'}</button></>;

  return <Modal title={title} wide footer={footer}>
    {err && <div className="err" style={{ display: 'block' }}>{err}</div>}
    <div className="fg" ref={formRef} onKeyDown={onKey}>
      {items.map((f, i) => {
        if (f.t === 'sec') return <div className="sec" key={'s' + i}>{f.l}</div>;
        if (f.t === 'specs') return <div className="full2" id="specBox" key="specs">
          {!vals.categoryId ? <><div className="sec">Specifications</div><p className="muted" style={{ margin: '8px 0 0', fontSize: 12.5 }}>Select the item type first — the form shows only the fields that item needs.</p></>
            : <><div className="sec">{vals.categoryId} Specifications <small>· {catGroupOf(vals.categoryId)}</small></div>
              {specFields.length ? <div className="fg" style={{ marginTop: 10 }}>{specFields.map(sf => <Field key={sf.k} f={sf} idPrefix="fld_sp_" mod={mod} rec={rec} view={view} ctxVals={vals.specs}
                value={sf.t === 'calc' ? sf.calc(vals.specs, rec) : vals.specs[sf.k]} onChange={v => setSpec(sf.k, v)} required={!!sf.r && sf.t !== 'calc'} bad={bad.includes('sp_' + sf.k)} />)}</div>
                : <p className="muted" style={{ margin: '8px 0 0', fontSize: 12.5 }}>No specification fields for this item type. Add them in Settings › Asset Categories.</p>}</>}
        </div>;
        return <Field key={f.k} f={f} mod={mod} rec={rec} view={view} ctxVals={vals} value={f.t === 'calc' ? (view ? vals[f.k] : f.calc(vals, rec)) : vals[f.k]} onChange={v => set(f.k, v)} required={fieldRequired(mod, f, vals)} bad={bad.includes(f.k)} />;
      })}
    </div>
    {view && rec && <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>Created {fmtDT(rec.createdAt)}{rec.createdBy ? ' by ' + rec.createdBy : ''} · Updated {fmtDT(rec.updatedAt)}{rec.updatedBy ? ' by ' + rec.updatedBy : ''}</p>}
  </Modal>;
}

/* Action form (Return, Handover, Receive Back, Quote …) — the action runs on the server */
export function ActionForm({ mod, rec, action, extraFields, input: fixedInput, title, onDone }) {
  const { me, mutate, closeModal, toast, can } = useApp();
  const fs = extraFields || action.fields(rec, { can });
  const [vals, setVals] = useState(() => { const v = {}; fs.forEach(f => { v[f.k] = typeof f.def === 'function' ? f.def({ userName: me.name }) : f.def ?? (f.t === 'table' ? [] : ''); }); return v; });
  const [err, setErr] = useState(''); const [bad, setBad] = useState([]); const [busy, setBusy] = useState(false);
  const submit = async () => {
    const b = fs.filter(f => f.r && isEmpty(vals[f.k])).map(f => f.k); setBad(b);
    if (b.length) return setErr(fs.filter(f => b.includes(f.k)).map(f => f.l + ' is required').join(' · '));
    setBusy(true); setErr('');
    try { const r = await mutate(confirmed => api(`/${mod}/${rec.id}/action/${action.id}`, { method: 'POST', body: { input: { ...vals, ...(fixedInput || {}) }, confirmed } }), { quiet: true }); if (!r) { setBusy(false); return; } closeModal(); toast((r.notices || []).join(' · ') || 'Saved'); if (onDone) onDone(r); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return <Modal title={title || `${action.l} — ${refOf(mod, rec)}`} wide={action.wide} footer={<><button className="btn" onClick={closeModal}>Cancel</button><button className="btn pri" id="miniSave" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Save'}</button></>}>
    {err && <div className="err" style={{ display: 'block' }}>{err}</div>}
    <div className="fg">{fs.map(f => <Field key={f.k} f={f} value={vals[f.k]} ctxVals={vals} onChange={v => setVals(p => ({ ...p, [f.k]: v }))} required={!!f.r} bad={bad.includes(f.k)} />)}</div>
  </Modal>;
}

/* lazy import to avoid a circular dependency */
let AssetDetailComp = null;
export function registerAssetDetail(c) { AssetDetailComp = c; }
function AssetDetailLazy(props) { return AssetDetailComp ? <AssetDetailComp {...props} /> : null; }
