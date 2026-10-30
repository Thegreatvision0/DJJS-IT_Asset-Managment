import React, { useState } from 'react';
import { DB, num, label, live, getA, specsFor, catGroupOf, rackDevices, rackUsed, rackCheck, GROUP_COLOR } from '@shared/core.js';
import { api, useApp, SimpleTable, Modal } from '../lib.jsx';
import Field from '../components/Field.jsx';
import { AssetDetail, assetLink } from '../components/Details.jsx';

const uLabel = d => { const s = num(d.specs.uStart), h = parseInt(d.specs.uHeight) || 1; return h > 1 ? `U${s}–${s + h - 1}` : 'U' + s; };
export default function Racks({ params }) {
  const { can, openModal, mutate, toast } = useApp();
  const racks = DB.assets.filter(a => a.categoryId === 'Rack' && live(a));
  const [rid, setRid] = useState(params.rack && getA(params.rack) ? params.rack : (racks[0] || {}).id);
  if (!racks.length) return <div className="card empty">No racks registered. Add a Rack under Asset Inventory › Network & Rack.</div>;
  const r = getA(rid) || racks[0]; const size = parseInt((r.specs || {}).rackSize) || 42; const devs = rackDevices(r.id); const used = rackUsed(r.id);
  const occ = {}; devs.forEach(d => { const s = num(d.specs.uStart), h = parseInt(d.specs.uHeight) || 1; for (let u = s; u < s + h; u++) occ[u] = d; });
  const el = []; for (let u = size; u >= 1;) { const d = occ[u]; if (d) { const s = num(d.specs.uStart), h = parseInt(d.specs.uHeight) || 1;
    el.push(<div className="ru" key={u} style={{ height: h * 24 }}><span className="n">{uLabel(d)}</span><div className="dev" style={{ background: GROUP_COLOR[catGroupOf(d.categoryId)] || '#475467' }} onClick={() => openModal(<AssetDetail id={d.id} />)} title={d.name}><span>{d.assetTag} · {d.name}</span><span style={{ opacity: .75 }}>{d.categoryId}</span></div></div>); u = s - 1; }
    else { el.push(<div className="ru" key={u}><span className="n">U{u}</span><div className="s" /></div>); u--; } }
  const mountable = DB.assets.filter(a => live(a) && specsFor(a.categoryId).some(f => f.k === 'uStart') && !(a.specs || {}).rackId);
  const ed = can('racks', 'e') && can('assets', 'e');
  const mount = () => {
    const fields = [{ k: 'assetId', l: 'Device', t: 'ref', c: 'assets', r: 1, filter: a => live(a) && specsFor(a.categoryId).some(f => f.k === 'uStart') && !(a.specs || {}).rackId }, { k: 'uStart', l: 'Start U (bottom)', t: 'number', r: 1 }, { k: 'uHeight', l: 'Height (U)', t: 'select', o: ['1', '2', '3', '4', '5', '6', '7', '8', '10', '12'], r: 1, def: '1' }];
    openModal(<MountForm rack={r} fields={fields} />);
  };
  const unmount = async d => { if (!window.confirm(`Unmount ${d.assetTag} from the rack?`)) return; try { await mutate(() => api(`/assets/${d.id}/action/unmount`, { method: 'POST', body: { input: {} } }), { quiet: true }); toast('Unmounted'); } catch (e) { toast(e.message, 1); } };
  return <>
    <div className="toolbar"><select value={r.id} onChange={e => setRid(e.target.value)}>{racks.map(x => <option key={x.id} value={x.id}>{x.assetTag} — {x.name} ({label('locations', x.locationId).split(' › ').pop()})</option>)}</select><span className="sp" />
      {ed && <button className="btn pri" onClick={mount}>+ Mount Device</button>}<button className="btn" onClick={() => window.print()}>Print</button></div>
    <div className="rackwrap"><div className="rack">{el}</div><div style={{ flex: 1, minWidth: 280 }}>
      <div className="card"><h3>{r.assetTag} — {r.name}</h3><div className="kv"><div><span>Location</span>{label('locations', r.locationId)}</div><div><span>Size / Type</span>{r.specs.rackSize} · {r.specs.rackType || ''}</div>
        <div><span>Used</span>{used}U</div><div><span>Free</span>{size - used}U</div><div><span>Utilisation</span>{Math.round(used / size * 100)}%</div><div><span>Devices</span>{devs.length}</div><div><span>PDUs</span>{r.specs.pduCount || DB.assets.filter(a => a.categoryId === 'Rack PDU' && (a.specs || {}).rackId === r.id).length || '—'}</div><div><span>Lock / Key</span>{r.specs.lockKey || '—'}</div></div>
        <div className="bars"><div className="row"><span className="lab">U utilisation</span><span className="trk"><span className="fil" style={{ width: Math.min(100, used / size * 100) + '%', background: used / size > .9 ? '#b42318' : '#1f4468' }} /></span><span className="num">{used}/{size}</span></div></div></div>
      <div className="card"><h3>Mounted Devices</h3><SimpleTable head={['U', 'Device', 'Category', '']} rows={devs.sort((x, y) => num(y.specs.uStart) - num(x.specs.uStart)).map(d => [uLabel(d), assetLink(d.id), d.categoryId, ed ? <button className="btn sm red" onClick={() => unmount(d)}>Unmount</button> : ''])} /></div>
      <div className="card"><h3>Rack-mountable Devices Not Yet Mounted ({mountable.length})</h3><SimpleTable head={['Device', 'Category', 'Location']} rows={mountable.slice(0, 30).map(d => [assetLink(d.id), d.categoryId, label('locations', d.locationId).split(' › ').pop()])} /></div>
    </div></div>
  </>;
}
function MountForm({ rack, fields }) {
  const { mutate, closeModal, toast } = useApp();
  const [v, setV] = useState({ assetId: '', uStart: '', uHeight: '1' }); const [err, setErr] = useState('');
  const save = async () => {
    if (!v.assetId || !v.uStart) return setErr('Select the device and the Start U');
    const e = rackCheck(rack.id, v.uStart, v.uHeight, v.assetId); if (e) return setErr(e);
    try { await mutate(() => api(`/assets/${v.assetId}/action/mount`, { method: 'POST', body: { input: { rackId: rack.id, uStart: v.uStart, uHeight: v.uHeight } } }), { quiet: true }); closeModal(); toast(getA(v.assetId).assetTag + ' mounted at U' + v.uStart); }
    catch (x) { setErr(x.message); }
  };
  return <Modal title={'Mount Device in ' + rack.assetTag} footer={<><button className="btn" onClick={closeModal}>Cancel</button><button className="btn pri" id="miniSave" onClick={save}>Save</button></>}>
    {err && <div className="err" style={{ display: 'block' }}>{err}</div>}
    <div className="fg">{fields.map(f => <Field key={f.k} f={f} value={v[f.k]} onChange={x => setV(p => ({ ...p, [f.k]: x }))} required />)}</div></Modal>;
}
