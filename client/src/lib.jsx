/* App-wide state: login, dataset cache from the API, modal and toast */
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { setDB, fmtD, daysTo, money } from '@shared/core.js';
import { canRole } from '@shared/modules.js';

const TOKEN_KEY = 'djjs_itam_token';
const getToken = () => { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
export const hasToken = () => !!getToken();
const putToken = t => { try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ } };

export class ApiError extends Error { constructor(status, body) { super(body.error || 'Request failed'); this.status = status; this.confirm = body.confirm; this.fields = body.fields; } }
let onUnauthorised = () => { };
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = {}; try { data = await res.json(); } catch { /* empty */ }
  if (res.status === 401 && !path.startsWith('/auth/login')) onUnauthorised();
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const db = useRef(null);
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [, setRev] = useState(0);
  const [modals, setModals] = useState([]);
  const [toastMsg, setToast] = useState(null);
  const tt = useRef();
  const bump = () => setRev(x => x + 1);

  const toast = useCallback((m, bad) => { setToast({ m, bad }); clearTimeout(tt.current); tt.current = setTimeout(() => setToast(null), 3500); }, []);
  const logout = useCallback(async (silent) => { if (!silent) { try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ } } putToken(''); setMe(null); setReady(false); setModals([]); }, []);
  onUnauthorised = () => { putToken(''); setMe(null); setReady(false); setModals([]); };

  const load = useCallback(async () => {
    const b = await api('/bootstrap');
    db.current = Object.assign({ masters: b.masters }, b.data); setDB(db.current);
    setMe(b.me); setReady(true); bump();
  }, []);
  const login = async (username, password) => { const r = await api('/auth/login', { method: 'POST', body: { username, password } }); putToken(r.token); await load(); };

  /** merge a server response (changed / deleted records, masters) into the cache */
  const apply = useCallback(resp => {
    const d = db.current; if (!d || !resp) return;
    Object.entries(resp.changed || {}).forEach(([col, docs]) => { d[col] = d[col] || []; docs.forEach(doc => { const i = d[col].findIndex(x => x.id === doc.id); if (i >= 0) d[col][i] = doc; else d[col].push(doc); }); });
    Object.entries(resp.deleted || {}).forEach(([col, ids]) => { d[col] = (d[col] || []).filter(x => !ids.includes(x.id)); });
    if (resp.masters) d.masters = resp.masters;
    setDB(d); bump();
    if ((resp.changed || {}).users && me) { const u = resp.changed.users.find(x => x.id === me.id); if (u) setMe(u); }
  }, [me]);

  /** call the API; if the server asks for confirmation, ask the user and retry */
  const mutate = useCallback(async (fn, { quiet } = {}) => {
    try { let r; try { r = await fn(false); } catch (e) { if (e.status === 409 && e.confirm && window.confirm(e.confirm)) r = await fn(true); else throw e; } apply(r); if (!quiet && r && r.notices && r.notices.length) toast(r.notices.join(' · ')); return r; }
    catch (e) { if (e.status !== 409) throw e; return null; }
  }, [apply, toast]);

  const can = (mod, act = 'v') => !!me && canRole((db.current || {}).roles, me, mod, act);
  const openModal = el => setModals(m => [...m, el]);
  const closeModal = () => setModals(m => m.slice(0, -1));
  const replaceModal = el => setModals(m => [...m.slice(0, -1), el]);
  const value = { db: db.current, me, ready, login, logout, load, apply, mutate, can, toast, openModal, closeModal, replaceModal, setMe, putToken };
  return <Ctx.Provider value={value}>{children}
    {modals.map((el, i) => <div key={i} className="ov show" onMouseDown={e => { if (e.target === e.currentTarget && i === modals.length - 1) closeModal(); }}>{el}</div>)}
    <div className={'toast' + (toastMsg ? ' show' : '') + (toastMsg && toastMsg.bad ? ' bad' : '')}>{toastMsg && toastMsg.m}</div>
  </Ctx.Provider>;
}

/* ---------- small display helpers ---------- */
export function Badge({ s }) {
  if (s === '' || s == null) return null; const S = String(s); let cl = 'grey';
  if (/overdue|lost|stolen|expired|critical|damage|beyond|rejected|failed|fail$|faulty|not working|blacklist|mismatch|cancel|^no$/i.test(S)) cl = 'bad';
  else if (/repair|vendor|awaiting|diagnosis|parts|pending|progress|requested|maintenance|quote|temporarily|open|high|ready|hold|follow|transit|reserved|warning|scheduled|planned|not tested/i.test(S)) cl = 'warn';
  else if (/returned|handed|closed|resolved|renewed|delivered|approved|active|in stock|commissioned|^yes$|received back|good|new|completed|pass|healthy|installed|in use|spare|excellent/i.test(S)) cl = 'ok';
  else if (/assigned|issued|sent|ordered/i.test(S)) cl = 'info';
  return <span className={'b ' + cl}>{S}</span>;
}
export function Expiry({ d }) {
  if (!d) return null; const n = daysTo(d); const txt = n < 0 ? `Expired ${-n}d ago` : n === 0 ? 'Due today' : `${n} days left`;
  return <>{fmtD(d)} <span className={'b ' + (n <= 30 ? 'bad' : n <= 90 ? 'warn' : 'ok')}>{txt}</span></>;
}
export function Modal({ title, wide, children, footer }) {
  const { closeModal } = useApp();
  return <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-label={title}>
    <div className="mh"><h2>{title}</h2><button className="btn sm" onClick={closeModal} aria-label="Close">✕</button></div>
    <div className="mb">{children}</div>
    {footer && <div className="mf">{footer}</div>}
  </div>;
}
export function SimpleTable({ head, rows, empty = 'None' }) {
  if (!rows.length) return <div className="muted">{empty}</div>;
  return <div className="tw"><table className="cards"><thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} data-label={typeof head[j] === 'string' ? head[j] : ''}>{c}</td>)}</tr>)}</tbody></table></div>;
}
export function downloadCSV(rows, name) {
  const csv = rows.map(r => r.map(c => { const s = String(c ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = name + '_' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
}
const escH = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function printSlip(title, no, rows, signs, by) {
  const w = window.open('', '_blank'); if (!w) return false;
  w.document.write(`<html><head><title>${escH(title)} ${escH(no)}</title><style>body{font-family:Segoe UI,Arial;padding:30px;color:#111}h1{font-size:18px;margin:0}h2{font-size:14px;color:#a3122a;margin:4px 0 18px}table{border-collapse:collapse;width:100%}td{border:1px solid #bbb;padding:7px 10px;font-size:13px}td:first-child{width:32%;background:#f3f5f9;font-weight:600}.s{display:flex;gap:20px;margin-top:60px}.s div{flex:1;border-top:1px solid #333;text-align:center;padding-top:6px;font-size:12px}</style></head><body>
  <h1>Divya Jyoti Jagrati Sansthan — IT Department</h1><h2>${escH(title)} · ${escH(no)}</h2>
  <table>${rows.map(([k, v]) => `<tr><td>${escH(k)}</td><td>${escH(v || '—')}</td></tr>`).join('')}</table>
  <div class="s">${signs.map(s => `<div>${escH(s)}</div>`).join('')}</div><p style="font-size:11px;color:#666;margin-top:30px">Printed ${new Date().toLocaleString('en-IN')} by ${escH(by)}</p></body></html>`);
  w.document.close(); w.focus(); w.print(); return true;
}
export { money };
