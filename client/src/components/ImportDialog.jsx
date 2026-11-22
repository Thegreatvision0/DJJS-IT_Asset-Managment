/* Import records from an Excel sheet: read → match headings → preview with problems → save row by row.
   Every row goes through the normal server checks (same as typing it in by hand). */
import React, { useMemo, useState } from 'react';
import { MODS } from '@shared/modules.js';
import { normalize, validateFields } from '@shared/engine.js';
import { findHeader, rowToData, findExisting } from '@shared/importer.js';
import { api, useApp, Modal, downloadXLSX } from '../lib.jsx';

const MAX_ROWS = 2000;
const fieldLabel = (mod, k) => (MODS[mod].fields.find(f => f.k === k) || {}).l || k;

async function readSheet(file) {
  const { default: ExcelJS } = await import('exceljs/dist/exceljs.min.js');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets.find(w => w.actualRowCount > 0) || wb.worksheets[0]; if (!ws) return [];
  const rows = [];
  ws.eachRow({ includeEmpty: false }, row => {
    const cells = []; row.eachCell({ includeEmpty: true }, (cell, c) => { cells[c - 1] = String(cell.text ?? '').trim(); });
    const out = Array.from(cells, x => x || ''); out.excelRow = row.number; rows.push(out); // keep the real Excel row number for messages
  });
  return rows;
}

export default function ImportDialog({ mod }) {
  const { apply, closeModal, toast, can } = useApp(); const m = MODS[mod];
  const [state, setState] = useState({ step: 'pick' }); const [update, setUpdate] = useState(true);
  const [prog, setProg] = useState(null); const [frozen, setFrozen] = useState(null);
  const canEdit = can(mod, 'e'); const keyL = fieldLabel(mod, m.importKey);

  const template = () => { // headings only: one row per record goes underneath
    const fs = m.fields.filter(f => f.k && !f.ro && f.t !== 'calc' && f.t !== 'sec' && f.t !== 'table' && f.t !== 'multiref');
    downloadXLSX([fs.map(f => f.l)], mod + '_import_template', m.title + ' — import template (one row per record)');
  };

  const pick = async e => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast('File is larger than 5 MB', 1);
    let rows;
    try { rows = await readSheet(file); } catch { return setState({ step: 'pick', err: 'This is not a valid Excel (.xlsx) file. Open it in Excel, choose Save As → Excel Workbook (.xlsx), and try again.' }); }
    const head = findHeader(mod, rows);
    if (!head) return setState({ step: 'pick', err: 'Could not find the heading row. The sheet needs headings such as ' + m.fields.filter(f => f.r && f.k).slice(0, 4).map(f => f.l).join(', ') + '.' });
    const body = rows.slice(head.index + 1).filter(r => r.some(c => c));
    if (body.length > MAX_ROWS) return setState({ step: 'pick', err: `The sheet has ${body.length} rows — import at most ${MAX_ROWS} at a time.` });
    const unused = rows[head.index].map((h, c) => (h && !head.map[c] ? h : '')).filter(Boolean);
    setFrozen(null); setState({ step: 'preview', file: file.name, head, body, unused });
  };

  // what will happen to each row; computed once per file / toggle, and frozen while saving
  const live = useMemo(() => {
    if (!state.body) return [];
    const seen = new Map();
    return state.body.map(cells => {
      const row = cells.excelRow;
      const probe = rowToData(mod, cells, state.head.map, null);
      const existing = findExisting(mod, probe);
      const key = String(probe[m.importKey] || '').trim().toLowerCase(); const by = m.importMatch || [];
      const sig = existing ? 'id:' + existing.id : key ? 'k:' + key : by.length && by.every(f => String(probe[f] || '').trim()) ? 'm:' + by.map(f => String(probe[f]).trim().toLowerCase()).join('|') : '';
      const dupOf = sig && seen.has(sig) ? seen.get(sig) : 0; if (sig && !dupOf) seen.set(sig, row);
      const action = existing ? (update && canEdit ? 'update' : 'skip') : 'add';
      const data = action === 'update' ? rowToData(mod, cells, state.head.map, existing) : probe;
      const errors = [], notes = [];
      if (dupOf) errors.push(`same record as row ${dupOf}`);
      if (action !== 'skip') { const clean = normalize(mod, data, existing || undefined); errors.push(...validateFields(mod, clean, existing || undefined).errors); }
      if (existing && update && !canEdit) notes.push('you cannot edit existing records');
      if (!existing && m.importKey && !String(probe[m.importKey] || '').trim()) notes.push(`no ${keyL} — added as a new record`);
      if (existing && !String(probe[m.importKey] || '').trim()) notes.push(`matched by ${(m.importMatch || []).map(k => fieldLabel(mod, k)).join(' + ')}`);
      return { row, data, existing, action, errors, notes };
    });
  }, [state.body, update]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = frozen || live;
  const ok = items.filter(x => x.action !== 'skip' && !x.errors.length);

  const run = async () => {
    const plan = live; setFrozen(plan); setState(s => ({ ...s, step: 'saving' }));
    const todo = plan.filter(x => x.action !== 'skip' && !x.errors.length); const failed = []; let added = 0, updated = 0;
    let batch = { changed: {} }; const flush = () => { if (Object.keys(batch.changed).length) apply(batch); batch = { changed: {} }; };
    for (let i = 0; i < todo.length; i++) {
      const it = todo[i];
      if (i % 10 === 0 || i === todo.length - 1) setProg({ n: i + 1, of: todo.length });
      try {
        const r = it.existing ? await api(`/${mod}/${it.existing.id}`, { method: 'PUT', body: { data: it.data, confirmed: true } }) : await api(`/${mod}`, { method: 'POST', body: { data: it.data, confirmed: true } });
        Object.entries(r.changed || {}).forEach(([col, docs]) => { batch.changed[col] = [...(batch.changed[col] || []), ...docs]; });
        it.existing ? updated++ : added++;
        if (i % 25 === 24) flush(); // refresh the list underneath now and then, not after every row
      } catch (e) { failed.push({ row: it.row, msg: e.message }); if (e.status === 401) break; }
    }
    flush(); setProg(null); setState(s => ({ ...s, step: 'done', result: { added, updated, failed } }));
    toast(`Import finished: ${added} added, ${updated} updated${failed.length ? `, ${failed.length} failed` : ''}`, failed.length > 0);
  };

  const footer = state.step === 'preview'
    ? <><button className="btn" onClick={closeModal}>Cancel</button><button className="btn pri" disabled={!ok.length} onClick={run}>Import {ok.length} row(s)</button></>
    : state.step === 'done' ? <button className="btn pri" onClick={closeModal}>Close</button> : null;
  const cols = (m.cols || []).filter(k => k !== m.numKey).slice(0, 7);
  const actionText = it => it.errors.length ? '—' : it.action === 'add' ? 'Add' : it.action === 'update' ? 'Update ' + (it.existing[m.numKey] || '') : 'Skip (exists)';

  return <Modal title={`Import ${m.title} from Excel`} wide footer={footer}>
    {state.step === 'pick' && <div className="imp">
      <p>Choose an Excel file (.xlsx). The first sheet is read; headings like <b>{m.fields.filter(f => f.k && f.r).slice(0, 5).map(f => f.l).join(', ')}</b> are matched automatically, in any order.</p>
      <p className="muted">{m.importKey && <>Rows whose {keyL} already exists update that record{m.importMatch ? <> (rows without a {keyL} are matched by {m.importMatch.map(k => fieldLabel(mod, k)).join(' + ')})</> : null}. </>}Nothing is saved until you check the preview and press Import.</p>
      <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={pick} />
      {state.err && <div className="err" style={{ display: 'block', marginTop: 10 }}>{state.err}</div>}
      <p style={{ marginTop: 14 }}><button className="btn sm" onClick={template}>Download blank template</button></p>
    </div>}

    {state.step !== 'pick' && <div className="imp">
      <div className="flow"><em>File:</em> <b>{state.file}</b> · {state.body.length} row(s) · columns matched: {Object.values(state.head.map).map(k => fieldLabel(mod, k)).join(', ')}
        {state.unused.length > 0 && <> · <span className="muted">ignored: {state.unused.join(', ')}</span></>}</div>
      <div className="chips" style={{ margin: '8px 0' }}>
        <span className="chip">To add <span className="n">{items.filter(x => x.action === 'add' && !x.errors.length).length}</span></span>
        <span className="chip">To update <span className="n">{items.filter(x => x.action === 'update' && !x.errors.length).length}</span></span>
        <span className="chip">Skipped <span className="n">{items.filter(x => x.action === 'skip').length}</span></span>
        <span className="chip">With problems <span className="n">{items.filter(x => x.errors.length).length}</span></span>
        {m.importKey && canEdit && <label className="chip" style={{ cursor: 'pointer' }}><input type="checkbox" checked={update} onChange={e => setUpdate(e.target.checked)} disabled={state.step !== 'preview'} /> Update existing records</label>}
      </div>
      {prog && <div className="flow">Saving {prog.n} of {prog.of}…</div>}
      {state.result && <div className={state.result.failed.length ? 'err' : 'drill'} style={{ display: 'block' }}>
        Done: {state.result.added} added, {state.result.updated} updated{state.result.failed.length ? `, ${state.result.failed.length} failed:` : '.'}
        {state.result.failed.map(f => <div key={f.row}>Excel row {f.row}: {f.msg}</div>)}</div>}
      <div className="tw" style={{ maxHeight: '50vh', overflow: 'auto' }}><table className="lst">
        <thead><tr><th>Excel row</th><th>Action</th>{cols.map(k => <th key={k}>{fieldLabel(mod, k)}</th>)}<th>Problems / notes</th></tr></thead>
        <tbody>{items.map(it => <tr key={it.row} className={it.errors.length ? 'imp-bad' : ''}>
          <td>{it.row}</td><td>{actionText(it)}</td>
          {cols.map(k => <td key={k}>{String(it.data[k] ?? '')}</td>)}
          <td className="imp-err">{it.errors.join(' · ')}{it.notes.length > 0 && <span className="muted">{it.errors.length ? ' · ' : ''}{it.notes.join(' · ')}</span>}</td></tr>)}</tbody></table></div>
    </div>}
  </Modal>;
}
