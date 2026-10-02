import { useMemo, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, Download, Cylinder } from 'lucide-react';
import type { CrushedCore } from '../../../shared/types';
import { deleteDoc, newId, saveDoc, toast, toastError, useCanEdit, useStore } from '../lib/store';
import { download, fmtDateTime, matches, setQuery, toCSV, todayISO, uniqueSorted } from '../lib/util';
import { HBarList } from '../components/Charts';
import { Combobox, Empty, Field, Modal, SearchInput, confirmDialog } from '../components/ui';
import { t } from '../lib/i18n';
import { PERIODS, fromLocalInput, startOfMonth, startOfToday, startOfWeek, toLocalInput, useMachineNames } from './Downtime';

const DAY = 86_400_000;

export function CoresPage({ query }: { query: URLSearchParams }) {
  const all = useStore((s) => s.docs.cores);
  const canEdit = useCanEdit();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<CrushedCore | 'new' | null>(null);
  const period = query.get('period') || '30';
  const machine = query.get('machine') || '';

  const items = useMemo(() => Object.values(all).sort((a, b) => b.at - a.at), [all]);
  const from = period === 'all' ? 0 : Date.now() - Number(period) * DAY;
  const filtered = useMemo(() => items.filter((c) => c.at >= from && (!machine || c.machine === machine) && matches(q, c.tag, c.machine, c.notes, c.reportedBy)), [items, from, machine, q]);
  const machines = useMemo(() => uniqueSorted(items.map((c) => c.machine)), [items]);
  const count = (t: number) => items.filter((c) => c.at >= t).length;
  const byMachine = useMemo(() => {
    const m = new Map<string, number>();
    const none = t('(not given)');
    for (const c of filtered) m.set(c.machine || none, (m.get(c.machine || none) || 0) + 1);
    return [...m.entries()].map(([k, v]) => ({ key: k, label: k, value: v })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const exportCsv = () => download(`crushed-cores-${todayISO()}.csv`, '﻿' + toCSV(filtered.map((c) => ({ date: fmtDateTime(c.at), tag: c.tag, machine: c.machine || '', notes: c.notes || '', loggedBy: c.reportedBy || '' }))), 'text/csv');
  const remove = async (c: CrushedCore) => {
    if (!(await confirmDialog({ title: t('Delete crushed core {tag}?', { tag: c.tag }), body: fmtDateTime(c.at), confirm: t('Delete'), danger: true }))) return;
    try { await deleteDoc('cores', c.id); toast(t('Deleted')); } catch (e) { toastError(e); }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t('Crushed Cores')}</h1>
          <div className="sub">{t('Log every crushed core with its tag number, date and time.')}</div>
        </div>
        <div className="btn-group">
          <button className="btn" onClick={exportCsv} title={t('Export CSV')} aria-label={t('Export CSV')}><Download size={19} /></button>
          {canEdit && <button className="btn primary lg" onClick={() => setEditing('new')} data-tour="cores-add"><Plus />{t('Add crushed core')}</button>}
        </div>
      </div>

      <div className="tiles" style={{ marginBottom: '1rem' }}>
        <div className="tile warn"><span className="t-label">{t('Today')}</span><span className="t-value">{count(startOfToday())}</span></div>
        <div className="tile"><span className="t-label">{t('This week')}</span><span className="t-value">{count(startOfWeek())}</span></div>
        <div className="tile"><span className="t-label">{t('This month')}</span><span className="t-value">{count(startOfMonth())}</span></div>
      </div>

      <div className="row wrap" style={{ marginBottom: '1rem' }}>
        <SearchInput value={q} onChange={setQ} placeholder="Search tag number, machine, notes…" />
        <select className="input" style={{ width: 'auto', minHeight: '3rem' }} value={period} onChange={(e) => setQuery({ period: e.target.value === '30' ? null : e.target.value })} aria-label={t('Period')}>
          {PERIODS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
        </select>
        {machines.length > 0 && <select className="input" style={{ width: 'auto', minHeight: '3rem' }} value={machine} onChange={(e) => setQuery({ machine: e.target.value })} aria-label={t('Machine')}>
          <option value="">{t('All machines')}</option>{machines.map((m) => <option key={m}>{m}</option>)}
        </select>}
      </div>

      {filtered.length === 0 ? (
        <div className="card"><Empty icon={<Cylinder size={48} />} title={items.length ? 'Nothing in this period' : 'No crushed cores logged yet'}>
          {canEdit && <button className="btn primary" onClick={() => setEditing('new')}><Plus />{t('Add crushed core')}</button>}
        </Empty></div>
      ) : (
        <div className="grid-2" style={{ gridTemplateColumns: byMachine.length > 1 ? undefined : '1fr' }}>
          <div className="table-wrap">
            <table className="tbl" data-testid="cores-table">
              <thead><tr><th>{t('Date & time')}</th><th>{t('Tag #')}</th><th>{t('Machine')}</th><th>{t('Notes')}</th>{canEdit && <th />}</tr></thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className={canEdit ? 'clickable' : ''} onClick={canEdit ? () => setEditing(c) : undefined}>
                    <td className="nowrap">{fmtDateTime(c.at)}</td>
                    <td><b className="mono" style={{ fontSize: '1.05rem' }}>{c.tag}</b></td>
                    <td>{c.machine || <span className="muted">—</span>}</td>
                    <td>{c.notes || <span className="muted">—</span>}{c.reportedBy && <div className="small muted">{c.reportedBy}</div>}</td>
                    {canEdit && <td onClick={(ev) => ev.stopPropagation()}><div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                      <button className="btn sm icon" onClick={() => setEditing(c)} aria-label={t('Edit')} title={t('Edit')}><Pencil size={17} /></button>
                      <button className="btn sm icon danger-ghost" onClick={() => remove(c)} aria-label={t('Delete')} title={t('Delete')}><Trash2 size={17} /></button>
                    </div></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {byMachine.length > 1 && <div className="card" style={{ alignSelf: 'start' }}><div className="card-head"><h3>{t('By machine')}</h3><span className="muted">{t('{d} total', { d: filtered.length })}</span></div><div className="card-body"><HBarList rows={byMachine} /></div></div>}
        </div>
      )}

      {editing && <CoreForm item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Tag box is focused first, so a scanner (or typing + Enter) saves straight away. */
export function CoreForm({ item, onClose }: { item?: CrushedCore; onClose: () => void }) {
  const machines = useMachineNames();
  const all = useStore((s) => s.docs.cores);
  const me = useStore((s) => s.me);
  const [tag, setTag] = useState(item?.tag || '');
  const [when, setWhen] = useState(toLocalInput(item?.at || Date.now()));
  const [machine, setMachine] = useState(item?.machine || '');
  const [notes, setNotes] = useState(item?.notes || '');
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(0);
  const tagRef = useRef<HTMLInputElement>(null);
  const dup = tag.trim() && Object.values(all).find((c) => c.id !== item?.id && c.tag.toLowerCase() === tag.trim().toLowerCase());

  const save = async (again: boolean) => {
    if (!tag.trim()) { toast(t('Enter the tag number'), 'danger'); tagRef.current?.focus(); return; }
    setBusy(true);
    try {
      await saveDoc('cores', item?.id || newId(), { tag: tag.trim(), at: fromLocalInput(when), machine: machine.trim(), notes: notes.trim(), reportedBy: item?.reportedBy || me?.name || '' }, 'Add crushed core');
      toast(item ? t('Saved') : t('Crushed core {tag} added', { tag: tag.trim() }));
      if (again) { setTag(''); setNotes(''); setWhen(toLocalInput(Date.now())); setAdded((n) => n + 1); tagRef.current?.focus(); }
      else onClose();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };

  return (
    <Modal title={item ? t('Edit crushed core {tag}', { tag: item.tag }) : t('Add crushed core')} icon={<Cylinder />} onClose={onClose}
      footer={<><button className="btn lg" onClick={onClose}>{added ? t('Done') : t('Cancel')}</button>{!item && <button className="btn lg" onClick={() => save(true)} disabled={busy}>{t('Save & add another')}</button>}<button className="btn primary lg" onClick={() => save(false)} disabled={busy}>{busy ? t('Saving…') : t('Save')}</button></>}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(!item); }}>
        {added > 0 && <div className="banner ok">{t('{n} added. Scan or type the next tag.', { n: added })}</div>}
        <Field label="Tag number" required hint="Scan the tag or type it, then press Enter"><input ref={tagRef} className="input mono lg" value={tag} onChange={(e) => setTag(e.target.value)} autoFocus placeholder="e.g. 448172" style={{ fontSize: '1.4rem' }} /></Field>
        {dup && <div className="banner warn">{t('Tag {tag} was already logged on {date}.', { tag: dup.tag, date: fmtDateTime(dup.at) })}</div>}
        <div className="grid-form">
          <Field label="Date & time"><input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
          <Field label="Machine (optional)"><Combobox value={machine} onChange={setMachine} options={machines} placeholder={t('e.g. Bag Machine 2')} /></Field>
        </div>
        <Field label="Notes (optional)"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('e.g. forklift damage, crushed in storage')} /></Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
