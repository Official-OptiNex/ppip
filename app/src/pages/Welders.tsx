import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, AudioWaveform, AlertTriangle, Replace, History } from 'lucide-react';
import type { Downtime, Equipment, Stint, Welder } from '../../../shared/types';
import { api } from '../lib/api';
import { applyUpsert, deleteDoc, newId, saveDoc, toast, toastError, useCanEdit, useStore } from '../lib/store';
import { fmtDate, fmtDuration, durationDays, navigate, todayISO } from '../lib/util';
import { Combobox, Empty, Field, Modal, Tabs, confirmDialog } from '../components/ui';
import { EquipmentPage, ReasonPicker, stintDays } from './Equipment';
import { plural, t } from '../lib/i18n';
import { DowntimeForm, DowntimePage, fmtMinutes, useMachineNames } from './Downtime';

type Tab = 'overview' | 'horns' | 'anvils' | 'glitches' | 'setup';
const DAY = 86_400_000;

export function WeldersPage({ tab: tabArg, query }: { tab?: string; query: URLSearchParams }) {
  const tab = (['overview', 'horns', 'anvils', 'glitches', 'setup'].includes(tabArg || '') ? tabArg : 'overview') as Tab;
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t('Sonic Welders')}</h1>
          <div className="sub">{t('Each welder has one horn and one anvil. See when they went on and came off, and log welder glitches.')}</div>
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
  const [change, setChange] = useState<{ w: Welder; type: 'horn' | 'anvil' } | null>(null);
  const [hist, setHist] = useState<Welder | null>(null);
  const list = useMemo(() => Object.values(welders).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })), [welders]);
  const on = (w: Welder, type: 'horn' | 'anvil') => Object.values(equipment).filter((e) => e.type === type && e.status === 'installed' && e.machine === w.name);
  const since = Date.now() - 30 * DAY;

  if (!list.length) return (
    <div className="card"><Empty icon={<AudioWaveform size={48} />} title="No sonic welders set up yet">
      {canEdit && <button className="btn primary" onClick={() => navigate('/welders/setup')}><Plus />{t('Add a welder')}</button>}
    </Empty></div>
  );
  // one horn and one anvil per welder
  const slot = (w: Welder, type: 'horn' | 'anvil') => {
    const e = on(w, type)[0];
    const label = t(type === 'horn' ? 'Horn' : 'Anvil');
    return (
      <div className="stack" style={{ gap: '0.4rem' }} data-testid={`${type}-slot`}>
        <div className="small muted" style={{ fontWeight: 700 }}>{label}</div>
        {e ? (
          <a href={`#/welders/${type}s?open=${e.id}`} style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
            <b className="mono" style={{ fontSize: '1.15rem' }}>{e.tag}</b>
            <div className="small">{t('{d} on', { d: fmtDuration(durationDays(e.installedAt)) })} · {t('since {date}', { date: fmtDate(e.installedAt) })}</div>
          </a>
        ) : <div className="muted">{t(type === 'horn' ? 'No horn on' : 'No anvil on')}</div>}
        {canEdit && <button className="btn sm" onClick={() => setChange({ w, type })}><Replace size={16} />{t(e ? (type === 'horn' ? 'Change horn' : 'Change anvil') : (type === 'horn' ? 'Put horn on' : 'Put anvil on'))}</button>}
      </div>
    );
  };
  return (
    <>
      <div className="machine-grid" data-tour="welders">
        {list.map((w) => {
          const dt = Object.values(downtime).filter((d) => d.welder === w.name && d.startedAt >= since);
          const mins = dt.reduce((s, d) => s + (d.minutes || 0), 0);
          return (
            <div key={w.id} className="card" data-testid="welder-card">
              <div className="card-head"><h3>{w.name}</h3><span className="muted">{[w.machine, w.model].filter(Boolean).join(' · ')}</span></div>
              <div className="card-body stack">
                <div className="grid-2 keep" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  {slot(w, 'horn')}
                  {slot(w, 'anvil')}
                </div>
                <div className={dt.length ? '' : 'muted'}><AlertTriangle size={16} style={{ verticalAlign: -2 }} /> {t('Last 30 days:')} <b>{plural(dt.length, '{n} glitch', '{n} glitches')}</b>{mins ? ` · ${t('{d} down', { d: fmtMinutes(mins) })}` : ''}</div>
                <div className="btn-group">
                  {canEdit && <button className="btn" onClick={() => setGlitch({ welder: w.name, machine: w.machine || '', category: 'Sonic welder', startedAt: Date.now() })}><Plus size={18} />{t('Log glitch')}</button>}
                  <button className="btn" onClick={() => setHist(w)}><History size={18} />{t('Horn & anvil history')}</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {glitch && <DowntimeForm preset={glitch} onClose={() => setGlitch(null)} />}
      {change && <ChangeDialog w={change.w} type={change.type} onClose={() => setChange(null)} />}
      {hist && <WelderHistory w={hist} onClose={() => setHist(null)} />}
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
    if (!(await confirmDialog({ title: t('Delete welder {name}?', { name: w.name }), body: used ? t('{n} horn/anvil still shows as on it. Their history is kept.', { n: used }) : t('Horn / anvil history and glitches that name it are kept.'), confirm: t('Delete'), danger: true }))) return;
    try { await deleteDoc('welders', w.id); toast(t('Deleted')); } catch (e) { toastError(e); }
  };
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <p className="muted" style={{ margin: 0 }}>{t('Renaming a welder updates its horns, anvils and glitch log.')}</p>
        {canEdit && <button className="btn primary lg" onClick={() => setEditing('new')}><Plus />{t('Add welder')}</button>}
      </div>
      {!list.length ? <div className="card"><Empty icon={<AudioWaveform size={48} />} title="No welders yet" /></div> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>{t('Welder')}</th><th>{t('On machine')}</th><th>{t('Model')}</th><th>{t('Notes')}</th>{canEdit && <th />}</tr></thead>
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
    if (!d.name?.trim()) { toast(t('Enter a name'), 'danger'); return; }
    if (dup) { toast(t('Another welder already has that name'), 'danger'); return; }
    setBusy(true);
    try { await saveDoc('welders', item?.id || newId(), { ...d, name: d.name.trim() }, 'Save welder'); toast(item ? t('Saved') : t('Added “{name}”', { name: d.name.trim() })); onClose(); }
    catch (e) { toastError(e); } finally { setBusy(false); }
  };
  return (
    <Modal title={item ? t('Edit {tag}', { tag: item.name }) : t('Add sonic welder')} onClose={onClose}
      footer={<><button className="btn lg" onClick={onClose}>{t('Cancel')}</button><button className="btn primary lg" onClick={save} disabled={busy}>{busy ? t('Saving…') : t('Save')}</button></>}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Welder name" required><input className="input" value={d.name || ''} onChange={(e) => setD({ ...d, name: e.target.value })} autoFocus placeholder={t('e.g. Welder 1')} /></Field>
        {dup && <div className="banner warn">{t('Another welder already has that name')}</div>}
        <Field label="On machine (optional)"><Combobox value={d.machine || ''} onChange={(v) => setD({ ...d, machine: v })} options={machines} placeholder={t('e.g. Bag Machine 2')} /></Field>
        <Field label="Model (optional)"><input className="input" value={d.model || ''} onChange={(e) => setD({ ...d, model: e.target.value })} placeholder="e.g. Branson 2000X 20 kHz" /></Field>
        <Field label="Notes (optional)"><textarea className="input" value={d.notes || ''} onChange={(e) => setD({ ...d, notes: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}

/** Swap the horn (or anvil) on a welder: the old one comes off with an optional reason, the new one goes on. */
function ChangeDialog({ w, type, onClose }: { w: Welder; type: 'horn' | 'anvil'; onClose: () => void }) {
  const equipment = useStore((s) => s.docs.equipment);
  const current = Object.values(equipment).find((e) => e.type === type && e.status === 'installed' && e.machine === w.name);
  const spares = useMemo(() => Object.values(equipment).filter((e) => e.type === type && e.status === 'spare').sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true })), [equipment, type]);
  const [pick, setPick] = useState(spares[0]?.id || 'new');
  const [newTag, setNewTag] = useState('');
  const [date, setDate] = useState(todayISO());
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const word = t(type === 'horn' ? 'horn' : 'anvil');
  const days = current ? durationDays(current.installedAt) : 0;

  const submit = async () => {
    let id = pick;
    if (pick === 'new') {
      const tag = newTag.trim();
      if (!tag) { toast(t('Enter the tag of the new one'), 'danger'); return; }
      const dup = Object.values(equipment).find((e) => e.type === type && e.tag.toLowerCase() === tag.toLowerCase());
      if (dup) { toast(t('{tag} already exists — pick it from the list', { tag: dup.tag }), 'danger'); return; }
    }
    setBusy(true);
    try {
      if (pick === 'new') { id = newId(); await saveDoc('equipment', id, { type, tag: newTag.trim(), status: 'spare' }, `Add ${type}`); }
      const at = date === todayISO() ? Date.now() : new Date(date + 'T12:00:00').getTime();
      const res = await api<Equipment>(`/equipment/${id}/action`, { body: { action: 'install', machine: w.name, reason, note, at } });
      applyUpsert('equipment', res);
      toast(t('{tag} is on {where}', { tag: res.tag, where: w.name }) + (current ? ` · ${t('{tag} back in spares', { tag: current.tag })}` : ''));
      onClose();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  return (
    <Modal title={`${t(current ? (type === 'horn' ? 'Change horn' : 'Change anvil') : (type === 'horn' ? 'Put horn on' : 'Put anvil on'))} · ${w.name}`} icon={<Replace />} onClose={onClose}
      footer={<><button className="btn lg" onClick={onClose}>{t('Cancel')}</button><button className="btn primary lg" onClick={submit} disabled={busy}>{busy ? t('Saving…') : t('Confirm')}</button></>}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {current
          ? <div className="banner"><div>{t('Coming off:')} <b className="mono">{current.tag}</b>, {t('on since {date}', { date: fmtDate(current.installedAt) })} ({plural(days, '{n} day', '{n} days')}). {t('It goes back to spares.')}</div></div>
          : <div className="muted">{t('{welder} has no {what} on right now.', { welder: w.name, what: word })}</div>}
        <Field label={t(type === 'horn' ? 'New horn' : 'New anvil')} required>
          <select className="input" value={pick} onChange={(e) => setPick(e.target.value)} aria-label={t(type === 'horn' ? 'New horn' : 'New anvil')}>
            {spares.map((e) => <option key={e.id} value={e.id}>{e.tag}{e.partNumber ? ` · ${e.partNumber}` : ''} ({t('spare')})</option>)}
            <option value="new">{t('A new one (type its tag)…')}</option>
          </select>
        </Field>
        {pick === 'new' && <Field label="Tag of the new one" required><input className="input mono" value={newTag} onChange={(e) => setNewTag(e.target.value)} autoFocus placeholder={type === 'horn' ? 'e.g. H-31' : 'e.g. A-31'} /></Field>}
        {current && <Field label={t('Why is {tag} coming off? (optional)', { tag: current.tag })}><ReasonPicker value={reason} onChange={setReason} /></Field>}
        <Field label="Date"><input className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Note (optional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('e.g. weld face worn, poor seals')} /></Field>
      </form>
    </Modal>
  );
}

/** Every horn and anvil that has been on this welder, newest first. */
function WelderHistory({ w, onClose }: { w: Welder; onClose: () => void }) {
  const equipment = useStore((s) => s.docs.equipment);
  const rows = useMemo(() => Object.values(equipment).filter((e) => e.type === 'horn' || e.type === 'anvil')
    .flatMap((e) => (e.history || []).filter((h) => h.machine === w.name).map((h) => ({ e, h })))
    .sort((a, b) => b.h.installedAt - a.h.installedAt), [equipment, w.name]);
  const avg = (type: string) => { const d = rows.filter((r) => r.e.type === type && r.h.removedAt).map((r) => stintDays(r.h)); return d.length ? Math.round(d.reduce((a, b) => a + b, 0) / d.length) : null; };
  const table = (type: 'horn' | 'anvil') => {
    const list = rows.filter((r) => r.e.type === type);
    const a = avg(type);
    return (
      <div>
        <h3 style={{ marginBottom: 6 }}>{t(type === 'horn' ? 'Horns' : 'Anvils')}{a !== null && <span className="small muted" style={{ fontWeight: 600 }}> · {t('last {n} days on average', { n: a })}</span>}</h3>
        {!list.length ? <div className="muted">{t('None on record.')}</div> : (
          <div className="table-wrap">
            <table className="tbl" data-testid={`welder-${type}-history`}>
              <thead><tr><th>{t('Tag')}</th><th>{t('Put on')}</th><th>{t('Taken off')}</th><th className="num">{t('Days')}</th><th>{t('Reason')}</th></tr></thead>
              <tbody>{list.map(({ e, h }: { e: Equipment; h: Stint }, i) => (
                <tr key={e.id + i}>
                  <td><b className="mono">{e.tag}</b></td>
                  <td className="nowrap">{fmtDate(h.installedAt)}</td>
                  <td className="nowrap">{h.removedAt ? fmtDate(h.removedAt) : <span className="pill ok">{t('On now')}</span>}</td>
                  <td className="num"><b>{stintDays(h)}</b></td>
                  <td>{h.reason ? t(h.reason) : <span className="muted">—</span>}{h.note && <div className="small muted">{h.note}</div>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    );
  };
  return (
    <Modal title={`${w.name} · ${t('Horn & anvil history')}`} icon={<History />} onClose={onClose} size="wide" footer={<button className="btn lg" onClick={onClose}>{t('Close')}</button>}>
      <div className="stack">{table('horn')}{table('anvil')}</div>
    </Modal>
  );
}
