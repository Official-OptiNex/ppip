import { useEffect, useMemo, useState } from 'react';
import { Plus, Wrench, CalendarClock, CalendarCheck, AlertTriangle, XCircle, Pencil, Trash2, History, Settings2, Wand2, Download } from 'lucide-react';
import type { Machine, PmLog, PmType } from '../../../shared/types';
import { addDays, machinePmState, parseDay, suggestNextDue, DEFAULT_MONTHLY_MONTHS, DEFAULT_WEEKLY_DAYS, type MachinePmState, type PmStatus } from '../../../shared/pm';
import { deleteDoc, getState, newId, saveDoc, toast, toastError, useCanEdit, useStore } from '../lib/store';
import { pmDueCount, usePmStates, useToday } from '../lib/pmhooks';
import { useShifts } from './Mechanics';
import type { Mechanic } from '../../../shared/types';
import { download, matches, navigate, setQuery, toCSV, uniqueSorted } from '../lib/util';
import { Combobox, Empty, Field, Modal, NumberInput, SearchInput, Seg, Tabs, confirmDialog } from '../components/ui';

type Tab = 'schedule' | 'history' | 'setup';
const TYPE_LABEL: Record<PmType, string> = { weekly: 'Weekly', monthly: 'Monthly' };

export function fmtDayLong(s?: string) {
  if (!s) return '—';
  return parseDay(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
function dueText(st: MachinePmState) {
  if (st.status === 'never') return 'No PM logged yet';
  const d = st.daysLeft ?? 0;
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} overdue`;
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  return `In ${d} days`;
}
export const PM_STATUS_CLS: Record<PmStatus, string> = { overdue: 'danger', today: 'warn', soon: 'warn', ok: 'ok', never: 'neutral' };

export function PmsPage({ tab: t, query }: { tab?: string; query: URLSearchParams }) {
  const tab = (['schedule', 'history', 'setup'].includes(t || '') ? t : 'schedule') as Tab;
  const canEdit = useCanEdit();
  const states = usePmStates();
  const pms = useStore((s) => s.docs.pms);
  const today = useToday();
  const [log, setLog] = useState<{ machine?: string; entry?: PmLog; type?: PmType } | null>(null);

  // deep link: #/pms?log=Machine%201
  useEffect(() => { const m = query.get('log'); if (m != null && canEdit) { setLog({ machine: m }); setQuery({ log: null }); } }, [query, canEdit]);

  const weekAgo = addDays(today, -6);
  const counts = {
    overdue: states.filter((s) => s.status === 'overdue').length,
    today: states.filter((s) => s.status === 'today' || s.status === 'never').length,
    week: states.filter((s) => s.daysLeft != null && s.daysLeft > 0 && s.daysLeft <= 7).length,
    done: Object.values(pms).filter((l) => l.date >= weekAgo && l.date <= today).length,
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>PMs</h1>
          <div className="sub">Machine preventive maintenance. Next PM is due {DEFAULT_WEEKLY_DAYS} days after the last PM of any type; a monthly PM is required once a month.</div>
        </div>
        {canEdit ? <button className="btn primary lg" data-tour="log-pm" onClick={() => setLog({})}><Plus />Log a PM</button> : <span data-tour="log-pm" />}
      </div>

      <div className="tiles" style={{ marginBottom: '1rem' }}>
        <div className={`tile ${counts.overdue ? 'danger' : 'ok'}`}><span className="t-label"><XCircle size={18} />Overdue</span><span className="t-value">{counts.overdue}</span><span className="t-sub">machines past due</span></div>
        <div className={`tile ${counts.today ? 'warn' : ''}`}><span className="t-label"><AlertTriangle size={18} />Due today</span><span className="t-value">{counts.today}</span><span className="t-sub">incl. never done</span></div>
        <div className="tile info"><span className="t-label"><CalendarClock size={18} />Due next 7 days</span><span className="t-value">{counts.week}</span><span className="t-sub">coming up</span></div>
        <div className="tile ok"><span className="t-label"><CalendarCheck size={18} />Done this week</span><span className="t-value">{counts.done}</span><span className="t-sub">PMs logged (7 days)</span></div>
      </div>

      <Tabs value={tab} onChange={(v) => navigate(`/pms/${v}`, true)} tabs={[
        { id: 'schedule', label: <><CalendarClock size={17} style={{ verticalAlign: -3 }} /> Schedule</> },
        { id: 'history', label: <><History size={17} style={{ verticalAlign: -3 }} /> History</> },
        { id: 'setup', label: <><Settings2 size={17} style={{ verticalAlign: -3 }} /> Machines & settings</> },
      ]} />
      {tab === 'schedule' && <Schedule states={states} canEdit={canEdit} onLog={(machine, type) => setLog({ machine, type })} />}
      {tab === 'history' && <HistoryTab canEdit={canEdit} onEdit={(entry) => setLog({ entry })} />}
      {tab === 'setup' && <Setup canEdit={canEdit} />}
      {log && <LogPmDialog machine={log.machine} entry={log.entry} type={log.type} onClose={() => setLog(null)} />}
    </div>
  );
}

function Schedule({ states, canEdit, onLog }: { states: MachinePmState[]; canEdit: boolean; onLog: (machine: string, type: PmType) => void }) {
  const machines = useStore((s) => s.docs.machines);
  const mechanics = useStore((s) => s.docs.mechanics);
  if (!states.length) {
    return <div className="card"><Empty icon={<Wrench size={48} />} title="No machines set up for PMs yet">
      {canEdit && <p>Go to <a href="#/pms/setup">Machines & settings</a> to add machines or turn PM tracking on.</p>}
    </Empty></div>;
  }
  const area = (name: string) => Object.values(machines).find((m) => m.name === name)?.area;
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead><tr><th>Machine</th><th>Next PM due</th><th>Last PM</th><th>Monthly PM</th><th className="right">Actions</th></tr></thead>
        <tbody>
          {states.map((st) => (
            <tr key={st.machine} className={st.status === 'overdue' ? 'st-out' : st.status === 'today' || st.status === 'soon' ? 'st-low' : st.status === 'ok' ? 'st-ok' : ''}>
              <td><b style={{ fontSize: '1.05rem' }}>{st.machine}</b>{area(st.machine) && <div className="small muted">{area(st.machine)}</div>}</td>
              <td>
                {st.status === 'never' ? <span className="pill neutral">Never done — due now</span> : <>
                  <div className="row" style={{ gap: 8 }}>
                    <b style={{ fontSize: '1.05rem' }}>{fmtDayLong(st.nextDue)}</b>
                    <span className={`pill ${st.nextType === 'monthly' ? 'info' : 'neutral'}`}>{TYPE_LABEL[st.nextType]}</span>
                  </div>
                  <span className={`pill ${PM_STATUS_CLS[st.status]}`} style={{ marginTop: 4 }}>{dueText(st)}</span>
                </>}
              </td>
              <td>{st.lastAny ? <>{fmtDayLong(st.lastAny.date)}<div className="small muted">{TYPE_LABEL[st.lastAny.type]}{st.lastAny.doneBy ? ` · ${st.lastAny.doneBy}${shiftShort(mechanics, st.lastAny.doneBy)}` : ''}</div></> : <span className="muted">—</span>}</td>
              <td>
                {st.lastMonthly ? <>Last: {fmtDayLong(st.lastMonthly.date)}</> : <span className="muted">No monthly yet</span>}
                <div className="small muted">Next monthly: {st.lastMonthly ? fmtDayLong(st.nextMonthly) : 'due now'}</div>
              </td>
              <td>
                <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                  {canEdit && <button className={`btn sm ${st.status === 'overdue' || st.status === 'today' || st.status === 'never' ? 'primary' : ''}`} onClick={() => onLog(st.machine, st.nextType)}><Wrench size={16} />Log PM</button>}
                  <a className="btn sm" href={`#/pms/history?machine=${encodeURIComponent(st.machine)}`}><History size={16} /><span className="hide-md">History</span></a>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryTab({ canEdit, onEdit }: { canEdit: boolean; onEdit: (e: PmLog) => void }) {
  const pms = useStore((s) => s.docs.pms);
  const mechanics = useStore((s) => s.docs.mechanics);
  const shifts = useShifts();
  const [shift, setShift] = useState('');
  const route = new URLSearchParams(location.hash.split('?')[1] || '');
  const [q, setQ] = useState('');
  const [machine, setMachine] = useState(route.get('machine') || '');
  const [type, setType] = useState<'' | PmType>('');
  const all = useMemo(() => Object.values(pms), [pms]);
  const machines = useMemo(() => uniqueSorted(all.map((l) => l.machine)), [all]);
  const list = useMemo(() => all
    .filter((l) => (!machine || l.machine === machine) && (!type || l.type === type) && (!shift || mechShift(mechanics, l.doneBy) === shift) && matches(q, l.machine, l.doneBy, l.notes, l.type))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0)), [all, machine, type, q]);

  const remove = async (l: PmLog) => {
    if (!(await confirmDialog({ title: 'Delete this PM entry?', body: `${TYPE_LABEL[l.type]} PM on ${l.machine}, ${fmtDayLong(l.date)}. The schedule recalculates from the remaining entries.`, confirm: 'Delete', danger: true }))) return;
    try { await deleteDoc('pms', l.id); toast('PM entry deleted'); } catch (e) { toastError(e); }
  };
  const exportCsv = () => download(`pm-history-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + toCSV(list.map((l) => ({ date: l.date, machine: l.machine, type: TYPE_LABEL[l.type], doneBy: l.doneBy || '', shift: mechShift(mechanics, l.doneBy), nextDue: l.nextDue || '', notes: l.notes || '', loggedBy: l.updatedBy || '' }))), 'text/csv');

  return (
    <div>
      <div className="row wrap" style={{ marginBottom: '1rem' }}>
        <SearchInput value={q} onChange={setQ} placeholder="Search by machine, person, notes…" />
        <select className="input" style={{ width: 'auto', minHeight: '3rem' }} value={machine} onChange={(e) => setMachine(e.target.value)}><option value="">All machines</option>{machines.map((m) => <option key={m}>{m}</option>)}</select>
        <select className="input" style={{ width: 'auto', minHeight: '3rem' }} value={type} onChange={(e) => setType(e.target.value as '' | PmType)}><option value="">Weekly & monthly</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select>
        <select className="input" style={{ width: 'auto', minHeight: '3rem' }} value={shift} onChange={(e) => setShift(e.target.value)} aria-label="Shift"><option value="">All shifts</option>{shifts.map((sh) => <option key={sh}>{sh}</option>)}</select>
        <button className="btn" onClick={exportCsv} title="Export CSV" style={{ minHeight: '3rem' }}><Download size={18} /></button>
      </div>
      {list.length === 0 ? <div className="card"><Empty icon={<History size={48} />} title="No PMs logged yet" /></div> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Date done</th><th>Machine</th><th>Type</th><th>Done by</th><th>Next due</th><th>Notes</th>{canEdit && <th />}</tr></thead>
            <tbody>
              {list.map((l) => (
                <tr key={l.id}>
                  <td className="nowrap"><b>{fmtDayLong(l.date)}</b></td>
                  <td>{l.machine}</td>
                  <td><span className={`pill ${l.type === 'monthly' ? 'info' : 'neutral'}`}>{TYPE_LABEL[l.type]}</span></td>
                  <td>{l.doneBy || <span className="muted">—</span>}{l.doneBy && mechShift(mechanics, l.doneBy) && <div className="small muted">{mechShift(mechanics, l.doneBy)}</div>}</td>
                  <td className="nowrap">{l.nextDue ? fmtDayLong(l.nextDue) : '—'}</td>
                  <td className="small" style={{ maxWidth: 320 }}>{l.notes}</td>
                  {canEdit && <td><div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                    <button className="btn sm" onClick={() => onEdit(l)}><Pencil size={16} />Edit</button>
                    <button className="btn sm icon ghost" onClick={() => remove(l)} aria-label="Delete"><Trash2 size={17} /></button>
                  </div></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Setup({ canEdit }: { canEdit: boolean }) {
  const machines = useStore((s) => s.docs.machines);
  const pms = useStore((s) => s.docs.pms);
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const list = useMemo(() => Object.values(machines).sort((a, b) => Number(!!b.pmTracked) - Number(!!a.pmTracked) || a.name.localeCompare(b.name, undefined, { numeric: true })), [machines]);
  const logCount = (n: string) => Object.values(pms).filter((l) => l.machine === n).length;

  const save = (m: Machine, patch: Partial<Machine>) => saveDoc('machines', m.id, patch).catch(toastError);
  const add = async () => {
    const n = name.trim();
    if (!n) return;
    const existing = Object.values(getState().docs.machines).find((m) => m.name.toLowerCase() === n.toLowerCase());
    try {
      if (existing) await saveDoc('machines', existing.id, { pmTracked: true });
      else await saveDoc('machines', newId(), { name: n, area: area.trim() || undefined, pmTracked: true });
      toast(`${n} added to PMs`); setName(''); setArea('');
    } catch (e) { toastError(e); }
  };
  const untrack = async (m: Machine) => {
    if (!(await confirmDialog({ title: `Remove ${m.name} from PMs?`, body: 'It disappears from the PM schedule. Its PM history is kept, and you can turn it back on any time.', confirm: 'Remove from PMs' }))) return;
    save(m, { pmTracked: false });
  };
  const deleteMachine = async (m: Machine) => {
    if (!(await confirmDialog({ title: `Delete machine “${m.name}”?`, body: `The machine is removed everywhere (parts' "used on" lists keep the name as text). ${logCount(m.name)} PM entries stay in history.`, confirm: 'Delete machine', danger: true }))) return;
    try { await deleteDoc('machines', m.id); toast('Machine deleted'); } catch (e) { toastError(e); }
  };

  return (
    <div className="stack">
      {canEdit && (
        <form className="card card-pad row wrap" style={{ alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); add(); }}>
          <Field label="Add a machine to PMs" className="grow"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bag Machine 5" /></Field>
          <Field label="Area / line (optional)"><input className="input" value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Converting" /></Field>
          <button className="btn primary lg" disabled={!name.trim()}><Plus />Add</button>
        </form>
      )}
      <p className="muted" style={{ margin: 0 }}>
        Tick <b>Track PMs</b> for each machine that needs PMs. You can change the rules per machine: by default the next PM is due <b>{DEFAULT_WEEKLY_DAYS} days</b> after the last PM of any type, and a monthly PM is required every <b>{DEFAULT_MONTHLY_MONTHS} month</b>.
      </p>
      {list.length === 0 ? <div className="card"><Empty title="No machines yet" /></div> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Track PMs</th><th>Machine</th><th>Next PM every … days</th><th>Monthly PM every … months</th><th className="num">PMs logged</th>{canEdit && <th />}</tr></thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id} className={m.pmTracked ? '' : 'st-retired'}>
                  <td><label className="check" style={{ minHeight: 0 }}><input type="checkbox" checked={!!m.pmTracked} disabled={!canEdit} onChange={(e) => (e.target.checked ? save(m, { pmTracked: true }) : untrack(m))} />{m.pmTracked ? 'On' : 'Off'}</label></td>
                  <td><b>{m.name}</b>{m.area && <div className="small muted">{m.area}</div>}</td>
                  <td style={{ maxWidth: 140 }}><IntervalInput disabled={!canEdit || !m.pmTracked} value={m.pmWeeklyDays} placeholder={DEFAULT_WEEKLY_DAYS} onSave={(v) => save(m, { pmWeeklyDays: v ?? undefined })} /></td>
                  <td style={{ maxWidth: 140 }}><IntervalInput disabled={!canEdit || !m.pmTracked} value={m.pmMonthlyMonths} placeholder={DEFAULT_MONTHLY_MONTHS} onSave={(v) => save(m, { pmMonthlyMonths: v ?? undefined })} /></td>
                  <td className="num">{logCount(m.name)}</td>
                  {canEdit && <td><div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                    {m.pmTracked && <button className="btn sm" onClick={() => untrack(m)}>Remove from PMs</button>}
                    <button className="btn sm icon ghost" onClick={() => deleteMachine(m)} aria-label="Delete machine"><Trash2 size={17} /></button>
                  </div></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function IntervalInput({ value, placeholder, onSave, disabled }: { value?: number; placeholder: number; onSave: (v: number | null) => void; disabled?: boolean }) {
  const [v, setV] = useState<number | null>(value ?? null);
  useEffect(() => setV(value ?? null), [value]);
  const commit = () => { const n = v != null && v > 0 ? Math.round(v) : null; if ((n ?? undefined) !== value) onSave(n); };
  return (
    <div onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}>
      {disabled ? <span className="muted">{value ?? placeholder}</span> : <NumberInput value={v} onChange={setV} min={1} step={1} placeholder={`${placeholder} (default)`} />}
    </div>
  );
}

export function LogPmDialog({ machine: initialMachine, entry, type: initialType, onClose }: { machine?: string; entry?: PmLog; type?: PmType; onClose: () => void }) {
  const machines = useStore((s) => s.docs.machines);
  const pms = useStore((s) => s.docs.pms);
  const users = useStore((s) => s.users);
  const mechanicDocs = useStore((s) => s.docs.mechanics);
  const me = useStore((s) => s.me);
  const today = useToday();
  const tracked = useMemo(() => Object.values(machines).filter((m) => m.pmTracked).map((m) => m.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [machines]);
  const [d, setD] = useState<Partial<PmLog>>(() => entry ? { ...entry } : { machine: initialMachine || (tracked.length === 1 ? tracked[0] : ''), date: today, type: initialType || 'weekly', doneBy: '' });
  const [autoNext, setAutoNext] = useState(!entry?.nextDue);
  const [busy, setBusy] = useState(false);
  const logs = useMemo(() => Object.values(pms), [pms]);
  const mDoc = Object.values(machines).find((m) => m.name.toLowerCase() === (d.machine || '').trim().toLowerCase());
  const suggested = d.machine && d.date && d.type ? suggestNextDue(mDoc || { name: d.machine }, logs, { date: d.date, type: d.type, id: entry?.id || '' }) : '';
  const nextDue = autoNext ? suggested : d.nextDue || '';
  const set = <K extends keyof PmLog>(k: K, v: PmLog[K]) => setD((x) => ({ ...x, [k]: v }));

  // pre-select the type that is actually due next when the machine changes (new entries only)
  useEffect(() => {
    if (entry || !d.machine || initialType) return;
    const m = Object.values(getState().docs.machines).find((x) => x.name === d.machine);
    if (m) set('type', machinePmState(m, logs, today).nextType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.machine]);

  const save = async () => {
    const name = (d.machine || '').trim();
    if (!name) { toast('Choose the machine', 'danger'); return; }
    if (!d.date) { toast('Enter the date the PM was done', 'danger'); return; }
    if (d.date > today) { toast('The date can’t be in the future', 'danger'); return; }
    setBusy(true);
    try {
      // new machine typed in -> create it with PM tracking on; existing untracked -> turn tracking on
      if (!mDoc) await saveDoc('machines', newId(), { name, pmTracked: true });
      else if (!mDoc.pmTracked) await saveDoc('machines', mDoc.id, { pmTracked: true });
      await saveDoc('pms', entry?.id || newId(), { machine: mDoc?.name || name, date: d.date, type: d.type, doneBy: (d.doneBy || '').trim(), nextDue: nextDue || undefined, notes: d.notes || '' }, `PM on ${name}`);
      toast(entry ? 'PM entry updated' : `${TYPE_LABEL[d.type as PmType]} PM logged for ${name}`, 'success', nextDue ? `Next PM due ${fmtDayLong(nextDue)}` : undefined);
      onClose();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };

  // "Who did it" = the mechanics list (admins manage it); falls back to user names until mechanics are added
  const crew = Object.values(mechanicDocs).filter((m) => !m.inactive).sort((a, b) => (a.shift || '').localeCompare(b.shift || '') || a.name.localeCompare(b.name));
  const people = crew.length ? crew.map((m) => m.name) : uniqueSorted([...users.filter((u) => u.active !== false).map((u) => u.name), ...logs.map((l) => l.doneBy)]);
  const shiftOf = (n: string) => crew.find((m) => m.name === n)?.shift || '';
  const meIsMechanic = !crew.length || crew.some((m) => m.name === me?.name);
  return (
    <Modal title={entry ? 'Edit PM entry' : 'Log a PM'} icon={<Wrench color="var(--primary)" />} onClose={onClose}
      footer={<><button className="btn lg" onClick={onClose}>Cancel</button><button className="btn primary lg" onClick={save} disabled={busy}><CalendarCheck />{busy ? 'Saving…' : entry ? 'Save' : 'Log PM'}</button></>}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Machine" required hint={tracked.length ? undefined : 'Type a machine name — it will be added to PMs.'}>
          <Combobox value={d.machine || ''} onChange={(v) => set('machine', v)} options={tracked} placeholder="Pick or type a machine" autoFocus={!d.machine} />
        </Field>
        <div className="grid-2">
          <Field label="Date done" required><input className="input" type="date" value={d.date || ''} max={today} onChange={(e) => set('date', e.target.value)} /></Field>
          <Field label="PM type">
            <Seg value={(d.type || 'weekly') as PmType} onChange={(v) => set('type', v)} options={[{ id: 'weekly', label: 'Weekly' }, { id: 'monthly', label: 'Monthly' }]} />
          </Field>
        </div>
        <Field label="Who did it (optional)" hint={crew.length ? undefined : 'Tip: an admin can add the mechanics and their shifts under Admin → Mechanics & shifts.'}>
          <div className="row">
            <div className="grow"><Combobox value={d.doneBy || ''} onChange={(v) => set('doneBy', v)} options={people} placeholder={crew.length ? 'Pick a mechanic' : 'Name'} renderSub={crew.length ? shiftOf : undefined} /></div>
            {me && meIsMechanic && d.doneBy !== me.name && <button type="button" className="btn" onClick={() => set('doneBy', me.name)}>Me</button>}
          </div>
        </Field>
        <Field label="Next PM due" hint={autoNext ? 'Filled in automatically from the PM rules. Change it if needed.' : 'Set by hand.'}>
          <div className="row">
            <input className="input grow" type="date" value={nextDue} onChange={(e) => { setAutoNext(false); set('nextDue', e.target.value); }} />
            {!autoNext && <button type="button" className="btn" onClick={() => setAutoNext(true)}><Wand2 size={18} />Auto</button>}
          </div>
        </Field>
        <Field label="Notes (optional)"><textarea className="input" value={d.notes || ''} onChange={(e) => set('notes', e.target.value)} placeholder="What was done, parts replaced, issues found…" /></Field>
      </form>
    </Modal>
  );
}

function mechShift(mechanics: Record<string, Mechanic>, name?: string) {
  if (!name) return '';
  return Object.values(mechanics).find((m) => m.name === name)?.shift || '';
}
function shiftShort(mechanics: Record<string, Mechanic>, name?: string) {
  const sh = mechShift(mechanics, name);
  return sh ? ` (${sh.replace(/\s*\(.*\)$/, '')})` : '';
}
