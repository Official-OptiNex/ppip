import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, AudioWaveform, AlertTriangle } from 'lucide-react';
import type { Downtime, Equipment, Welder } from '../../../shared/types';
import { deleteDoc, newId, saveDoc, toast, toastError, useCanEdit, useStore } from '../lib/store';
import { fmtDate, fmtDuration, durationDays, navigate } from '../lib/util';
import { Combobox, Empty, Field, Modal, Tabs, confirmDialog } from '../components/ui';
import { EquipmentPage } from './Equipment';
import { DowntimeForm, DowntimePage, fmtMinutes, useMachineNames } from './Downtime';

type Tab = 'overview' | 'horns' | 'anvils' | 'glitches' | 'setup';
const DAY = 86_400_000;

export function WeldersPage({ tab: t, query }: { tab?: string; query: URLSearchParams }) {
  const tab = (['overview', 'horns', 'anvils', 'glitches', 'setup'].includes(t || '') ? t : 'overview') as Tab;
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Sonic Welders</h1>
          <div className="sub">Horns and anvils on each welder, when they went on and came off, and welder glitches.</div>
        </div>
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <Tabs value={tab} onChange={(v) => navigate(v === 'overview' ? '/welders' : `/welders/${v}`)}
          tabs={[{ id: 'overview', label: 'Welders' }, { id: 'horns', label: 'Horns' }, { id: 'anvils', label: 'Anvils' }, { id: 'glitches', label: 'Glitches' }, { id: 'setup', label: 'Set up welders' }]} />
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'horns' && <EquipmentPage key="horn" type="horn" query={query} embedded />}
      {tab === 'anvils' && <EquipmentPage key="anvil" type="anvil" query={query} embedded />}
      {tab === 'glitches' && <DowntimePage query={query} welderOnly />}
      {tab === 'setup' && <Setup />}
    </div>
  );
}

function Overview() {
  const welders = useStore((s) => s.docs.welders);
  const equipment = useStore((s) => s.docs.equipment);
  const downtime = useStore((s) => s.docs.downtime);
  const canEdit = useCanEdit();
  const [glitch, setGlitch] = useState<Partial<Downtime> | null>(null);
  const list = useMemo(() => Object.values(welders).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })), [welders]);
  const on = (w: Welder, type: 'horn' | 'anvil') => Object.values(equipment).filter((e) => e.type === type && e.status === 'installed' && e.machine === w.name);
  const since = Date.now() - 30 * DAY;

  if (!list.length) return (
    <div className="card"><Empty icon={<AudioWaveform size={48} />} title="No sonic welders set up yet">
      {canEdit && <button className="btn primary" onClick={() => navigate('/welders/setup')}><Plus />Add a welder</button>}
    </Empty></div>
  );
  const slot = (label: string, items: Equipment[], route: string) => (
    <div>
      <div className="small muted" style={{ fontWeight: 700 }}>{label}</div>
      {items.length ? items.map((e) => (
        <a key={e.id} href={`#/welders/${route}?open=${e.id}`} style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
          <b className="mono" style={{ fontSize: '1.15rem' }}>{e.tag}</b>
          <div className="small">{fmtDuration(durationDays(e.installedAt))} on · since {fmtDate(e.installedAt)}</div>
        </a>
      )) : <div className="muted">None on</div>}
    </div>
  );
  return (
    <>
      <div className="machine-grid">
        {list.map((w) => {
          const dt = Object.values(downtime).filter((d) => d.welder === w.name && d.startedAt >= since);
          const mins = dt.reduce((s, d) => s + (d.minutes || 0), 0);
          return (
            <div key={w.id} className="card" data-testid="welder-card">
              <div className="card-head"><h3>{w.name}</h3><span className="muted">{[w.machine, w.model].filter(Boolean).join(' · ')}</span></div>
              <div className="card-body stack">
                <div className="grid-2 keep" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  {slot('Horn', on(w, 'horn'), 'horns')}
                  {slot('Anvil', on(w, 'anvil'), 'anvils')}
                </div>
                <div className={dt.length ? '' : 'muted'}><AlertTriangle size={16} style={{ verticalAlign: -2 }} /> Last 30 days: <b>{dt.length} glitch{dt.length === 1 ? '' : 'es'}</b>{mins ? ` · ${fmtMinutes(mins)} down` : ''}</div>
                {canEdit && <button className="btn" onClick={() => setGlitch({ welder: w.name, machine: w.machine || '', category: 'Sonic welder', startedAt: Date.now() })}><Plus size={18} />Log glitch</button>}
              </div>
            </div>
          );
        })}
      </div>
      {glitch && <DowntimeForm preset={glitch} onClose={() => setGlitch(null)} />}
    </>
  );
}

function Setup() {
  const welders = useStore((s) => s.docs.welders);
  const equipment = useStore((s) => s.docs.equipment);
  const canEdit = useCanEdit();
  const [editing, setEditing] = useState<Welder | 'new' | null>(null);
  const list = useMemo(() => Object.values(welders).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })), [welders]);
  const remove = async (w: Welder) => {
    const used = Object.values(equipment).filter((e) => e.status === 'installed' && e.machine === w.name).length;
    if (!(await confirmDialog({ title: `Delete welder ${w.name}?`, body: used ? `${used} horn/anvil still shows as on it. Their history is kept.` : 'Horn / anvil history and glitches that name it are kept.', confirm: 'Delete', danger: true }))) return;
    try { await deleteDoc('welders', w.id); toast('Deleted'); } catch (e) { toastError(e); }
  };
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <p className="muted" style={{ margin: 0 }}>Renaming a welder updates its horns, anvils and glitch log.</p>
        {canEdit && <button className="btn primary lg" onClick={() => setEditing('new')}><Plus />Add welder</button>}
      </div>
      {!list.length ? <div className="card"><Empty icon={<AudioWaveform size={48} />} title="No welders yet" /></div> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Welder</th><th>On machine</th><th>Model</th><th>Notes</th>{canEdit && <th />}</tr></thead>
            <tbody>
              {list.map((w) => (
                <tr key={w.id}>
                  <td><b>{w.name}</b></td><td>{w.machine || '—'}</td><td>{w.model || '—'}</td><td className="small">{w.notes || ''}</td>
                  {canEdit && <td><div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                    <button className="btn sm icon" onClick={() => setEditing(w)} aria-label={`Edit ${w.name}`}><Pencil size={17} /></button>
                    <button className="btn sm icon danger-ghost" onClick={() => remove(w)} aria-label={`Delete ${w.name}`}><Trash2 size={17} /></button>
                  </div></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <WelderForm item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function WelderForm({ item, onClose }: { item?: Welder; onClose: () => void }) {
  const machines = useMachineNames();
  const welders = useStore((s) => s.docs.welders);
  const [d, setD] = useState<Partial<Welder>>(() => item ? { ...item } : {});
  const [busy, setBusy] = useState(false);
  const dup = d.name?.trim() && Object.values(welders).some((w) => w.id !== item?.id && w.name.toLowerCase() === d.name!.trim().toLowerCase());
  const save = async () => {
    if (!d.name?.trim()) { toast('Enter a name', 'danger'); return; }
    if (dup) { toast('Another welder already has that name', 'danger'); return; }
    setBusy(true);
    try { await saveDoc('welders', item?.id || newId(), { ...d, name: d.name.trim() }, 'Save welder'); toast(item ? 'Saved' : `Added ${d.name.trim()}`); onClose(); }
    catch (e) { toastError(e); } finally { setBusy(false); }
  };
  return (
    <Modal title={item ? `Edit ${item.name}` : 'Add sonic welder'} onClose={onClose}
      footer={<><button className="btn lg" onClick={onClose}>Cancel</button><button className="btn primary lg" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Welder name" required><input className="input" value={d.name || ''} onChange={(e) => setD({ ...d, name: e.target.value })} autoFocus placeholder="e.g. Welder 1" /></Field>
        {dup && <div className="banner warn">Another welder already has that name.</div>}
        <Field label="On machine (optional)"><Combobox value={d.machine || ''} onChange={(v) => setD({ ...d, machine: v })} options={machines} placeholder="e.g. Bag Machine 2" /></Field>
        <Field label="Model (optional)"><input className="input" value={d.model || ''} onChange={(e) => setD({ ...d, model: e.target.value })} placeholder="e.g. Branson 2000X 20 kHz" /></Field>
        <Field label="Notes (optional)"><textarea className="input" value={d.notes || ''} onChange={(e) => setD({ ...d, notes: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}
