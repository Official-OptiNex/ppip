import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Download, Timer, AlertTriangle } from 'lucide-react';
import { DOWNTIME_CATEGORIES, type Downtime } from '../../../shared/types';
import { deleteDoc, newId, saveDoc, toast, toastError, useCanEdit, useStore } from '../lib/store';
import { download, fmtDateTime, matches, setQuery, toCSV, todayISO, uniqueSorted } from '../lib/util';
import { HBarList } from '../components/Charts';
import { Combobox, Empty, Field, Modal, NumberInput, SearchInput, confirmDialog, Person } from '../components/ui';
import { plural, t } from '../lib/i18n';
import { PhotoAttach, PhotoThumb } from '../components/PhotoAttach';

const DAY = 86_400_000;
export const PERIODS: [string, string][] = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last 12 months'], ['all', 'All time']];

/** "1 h 25 min" style. */
export function fmtMinutes(m?: number | null) {
  const n = Math.round(m || 0);
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60), r = n % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
/** <input type="datetime-local"> value for a timestamp, in local time. */
export function toLocalInput(t: number) {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fromLocalInput(s: string) { const t = new Date(s).getTime(); return Number.isFinite(t) ? t : Date.now(); }
export function startOfWeek(now = new Date()) { const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
export function startOfMonth(now = new Date()) { return new Date(now.getFullYear(), now.getMonth(), 1).getTime(); }
export function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }

export function useMachineNames() {
  const machines = useStore((s) => s.docs.machines);
  return useMemo(() => uniqueSorted(Object.values(machines).map((m) => m.name)), [machines]);
}
export function usePeopleNames() {
  const mechanics = useStore((s) => s.docs.mechanics);
  return useMemo(() => uniqueSorted(Object.values(mechanics).filter((m) => !m.inactive).map((m) => m.name)), [mechanics]);
}

/** Downtime / glitch log. With `welderOnly` it shows just sonic-welder glitches (used inside the Sonic Welders page). */
export function DowntimePage({ query, welderOnly }: { query: URLSearchParams; welderOnly?: boolean }) {
  const all = useStore((s) => s.docs.downtime);
  const canEdit = useCanEdit();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Downtime | 'new' | null>(null);
  const period = query.get('period') || '30';
  const machine = query.get('machine') || '';
  const category = query.get('cat') || '';

  // deep link: #/downtime?log=Bag%20Machine%201
  useEffect(() => { const m = query.get('log'); if (m != null && canEdit) { setEditing({ id: '', machine: m, problem: '', startedAt: Date.now() } as Downtime); setQuery({ log: null }); } }, [query, canEdit]);

  const items = useMemo(() => Object.values(all).filter((d) => !welderOnly || d.welder || d.category === 'Sonic welder').sort((a, b) => b.startedAt - a.startedAt), [all, welderOnly]);
  const from = period === 'all' ? 0 : Date.now() - Number(period) * DAY;
  const inPeriod = useMemo(() => items.filter((d) => d.startedAt >= from), [items, from]);
  const filtered = useMemo(() => inPeriod.filter((d) =>
    (!machine || d.machine === machine || d.welder === machine) && (!category || d.category === category)
    && matches(q, d.machine, d.welder, d.category, d.problem, d.fix, d.reportedBy)), [inPeriod, machine, category, q]);
  const machines = useMemo(() => uniqueSorted(items.flatMap((d) => (welderOnly ? [d.welder] : [d.machine]))), [items, welderOnly]);

  const sum = (list: Downtime[]) => list.reduce((s, d) => s + (d.minutes || 0), 0);
  const week = items.filter((d) => d.startedAt >= startOfWeek());
  const month = items.filter((d) => d.startedAt >= startOfMonth());
  const byMachine = useMemo(() => {
    const m = new Map<string, { min: number; n: number }>();
    for (const d of filtered) { const k = (welderOnly ? d.welder : d.machine) || '(none)'; const x = m.get(k) || { min: 0, n: 0 }; x.min += d.minutes || 0; x.n++; m.set(k, x); }
    return [...m.entries()].map(([k, v]) => ({ key: k, label: k, value: v.min, sub: plural(v.n, '{n} stop', '{n} stops') })).sort((a, b) => b.value - a.value);
  }, [filtered, welderOnly]);
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of filtered) m.set(d.category || 'Other', (m.get(d.category || 'Other') || 0) + (d.minutes || 0));
    return [...m.entries()].map(([k, v]) => ({ key: k, label: t(k), value: v })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const exportCsv = () => download(`${welderOnly ? 'welder-glitches' : 'downtime'}-${todayISO()}.csv`, '﻿' + toCSV(filtered.map((d) => ({
    started: fmtDateTime(d.startedAt), machine: d.machine, welder: d.welder || '', minutes: d.minutes ?? '', category: d.category || '', whatHappened: d.problem, fix: d.fix || '', bagsPerMinute: d.bpm ?? '', reportedBy: d.reportedBy || '',
  }))), 'text/csv');
  const remove = async (d: Downtime) => {
    if (!(await confirmDialog({ title: t('Delete this downtime entry?'), body: `${d.machine} · ${fmtDateTime(d.startedAt)} · ${d.problem}`, confirm: t('Delete'), danger: true }))) return;
    try { await deleteDoc('downtime', d.id); toast(t('Deleted')); } catch (e) { toastError(e); }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          {welderOnly ? <h2>{t('Welder glitches')}</h2> : <h1>{t('Downtime & Glitches')}</h1>}
          <div className="sub">{t('Every stop: which machine, how long, what happened and what fixed it.')}</div>
        </div>
        <div className="btn-group">
          <button className="btn" onClick={exportCsv} title={t('Export CSV')} aria-label={t('Export CSV')}><Download size={19} /></button>
          {canEdit && <button className="btn primary lg" onClick={() => setEditing('new')} data-tour="downtime-add"><Plus />{t(welderOnly ? 'Log welder glitch' : 'Log downtime')}</button>}
        </div>
      </div>

      <div className="tiles" style={{ marginBottom: '1rem' }}>
        <div className="tile warn"><span className="t-label">{t('This week')}</span><span className="t-value">{fmtMinutes(sum(week))}</span><span className="t-sub">{plural(week.length, '{n} stop', '{n} stops')}</span></div>
        <div className="tile"><span className="t-label">{t('This month')}</span><span className="t-value">{fmtMinutes(sum(month))}</span><span className="t-sub">{plural(month.length, '{n} stop', '{n} stops')}</span></div>
        <div className="tile danger"><span className="t-label">{t('Most downtime')}</span><span className="t-value" style={{ fontSize: '1.35rem' }}>{byMachine[0]?.label || '—'}</span><span className="t-sub">{byMachine[0] ? `${fmtMinutes(byMachine[0].value)} · ${t(PERIODS.find((p) => p[0] === period)?.[1] || '').toLowerCase()}` : t('nothing logged')}</span></div>
      </div>

      <div className="row wrap" style={{ marginBottom: '1rem' }}>
        <SearchInput value={q} onChange={setQ} placeholder="Search what happened, fix, who…" />
        <select className="input" style={{ width: 'auto', minHeight: '3rem' }} value={period} onChange={(e) => setQuery({ period: e.target.value === '30' ? null : e.target.value })} aria-label={t('Period')}>
          {PERIODS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
        </select>
        <select className="input" style={{ width: 'auto', minHeight: '3rem' }} value={machine} onChange={(e) => setQuery({ machine: e.target.value })} aria-label={t(welderOnly ? 'Welder' : 'Machine')}>
          <option value="">{t(welderOnly ? 'All welders' : 'All machines')}</option>{machines.map((m) => <option key={m}>{m}</option>)}
        </select>
        {!welderOnly && <select className="input" style={{ width: 'auto', minHeight: '3rem' }} value={category} onChange={(e) => setQuery({ cat: e.target.value })} aria-label={t('Category')}>
          <option value="">{t('All kinds')}</option>{DOWNTIME_CATEGORIES.map((c) => <option key={c} value={c}>{t(c)}</option>)}
        </select>}
      </div>

      {filtered.length === 0 ? (
        <div className="card"><Empty icon={<Timer size={48} />} title={items.length ? 'Nothing in this period' : 'No downtime logged yet'}>
          {canEdit && <button className="btn primary" onClick={() => setEditing('new')}><Plus />{t(welderOnly ? 'Log welder glitch' : 'Log downtime')}</button>}
        </Empty></div>
      ) : (
        <>
          <div className="table-wrap" style={{ marginBottom: '1rem' }}>
            <table className="tbl" data-testid="downtime-table">
              <thead><tr><th>{t('When')}</th><th>{t(welderOnly ? 'Welder' : 'Machine')}</th><th>{t('What happened')}</th><th className="num">{t('Down')}</th>{welderOnly && <th className="num">{t('Speed')}</th>}<th>{t('Reported by')}</th>{canEdit && <th />}</tr></thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className={canEdit ? 'clickable' : ''} onClick={canEdit ? () => setEditing(d) : undefined}>
                    <td className="nowrap">{fmtDateTime(d.startedAt)}</td>
                    <td><b>{welderOnly ? d.welder || d.machine : d.machine}</b>{!welderOnly && d.welder && <div className="small muted">{d.welder}</div>}{welderOnly && d.welder && <div className="small muted">{d.machine}</div>}</td>
                    <td>{d.category && <span className="pill neutral" style={{ marginRight: 6 }}>{t(d.category)}</span>}{d.problem}{d.fix && <div className="small muted">{t('Fix:')} {d.fix}</div>}{!welderOnly && d.bpm ? <div className="small muted">{t('{n} bags/min', { n: d.bpm })}</div> : null}{d.imageId && <div style={{ marginTop: 6 }}><PhotoThumb id={d.imageId} size={52} /></div>}</td>
                    <td className="num nowrap"><b>{d.minutes != null ? fmtMinutes(d.minutes) : '—'}</b></td>
                    {welderOnly && <td className="num nowrap">{d.bpm ? `${d.bpm} bpm` : '—'}</td>}
                    <td>{d.reportedBy ? <Person name={d.reportedBy} /> : <span className="muted">—</span>}</td>
                    {canEdit && <td onClick={(ev) => ev.stopPropagation()}><div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                      <button className="btn sm icon" onClick={() => setEditing(d)} aria-label={t('Edit')} title={t('Edit')}><Pencil size={17} /></button>
                      <button className="btn sm icon danger-ghost" onClick={() => remove(d)} aria-label={t('Delete')} title={t('Delete')}><Trash2 size={17} /></button>
                    </div></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid-2">
            <div className="card"><div className="card-head"><h3>{t(welderOnly ? 'Downtime by welder' : 'Downtime by machine')}</h3><span className="muted">{t('{d} total', { d: fmtMinutes(sum(filtered)) })}</span></div><div className="card-body"><HBarList rows={byMachine} format={fmtMinutes} /></div></div>
            {!welderOnly && <div className="card"><div className="card-head"><h3>{t('By kind of problem')}</h3></div><div className="card-body"><HBarList rows={byCategory} format={fmtMinutes} /></div></div>}
          </div>
        </>
      )}

      {editing && <DowntimeForm item={editing === 'new' ? undefined : editing.id ? editing : undefined} preset={editing !== 'new' && !editing.id ? editing : welderOnly ? { category: 'Sonic welder' } : undefined} onClose={() => setEditing(null)} />}
    </div>
  );
}

const QUICK_MIN = [5, 10, 15, 30, 45, 60, 120];

/** Log / edit one stop. `preset` pre-fills a new entry (e.g. from a welder card). */
export function DowntimeForm({ item, preset, onClose }: { item?: Downtime; preset?: Partial<Downtime>; onClose: () => void }) {
  const machines = useMachineNames();
  const welders = useStore((s) => s.docs.welders);
  const me = useStore((s) => s.me);
  const people = usePeopleNames();
  const welderNames = useMemo(() => uniqueSorted(Object.values(welders).map((w) => w.name)), [welders]);
  const [d, setD] = useState<Partial<Downtime>>(() => item ? { ...item } : { startedAt: Date.now(), reportedBy: me?.name || '', ...preset });
  const [when, setWhen] = useState(toLocalInput(d.startedAt || Date.now()));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Downtime>(k: K, v: Downtime[K] | undefined) => setD((x) => ({ ...x, [k]: v }));
  const isWelder = d.category === 'Sonic welder' || !!d.welder;

  // picking a welder fills in the machine it sits on
  const pickWelder = (name: string) => {
    const w = Object.values(welders).find((x) => x.name === name);
    setD((x) => ({ ...x, welder: name, ...(w?.machine && !x.machine ? { machine: w.machine } : {}), ...(name && !x.category ? { category: 'Sonic welder' } : {}) }));
  };

  const save = async (again = false) => {
    if (!d.machine?.trim()) { toast(t('Choose the machine'), 'danger'); return; }
    if (!d.problem?.trim()) { toast(t('Say what happened'), 'danger'); return; }
    setBusy(true);
    try {
      await saveDoc('downtime', item?.id || newId(), { ...d, machine: d.machine.trim(), problem: d.problem.trim(), startedAt: fromLocalInput(when) }, 'Log downtime');
      toast(item ? t('Saved') : t('Downtime logged on {where}', { where: d.machine }) + (d.minutes != null ? ` · ${fmtMinutes(d.minutes)}` : ''));
      if (again) { setD({ startedAt: Date.now(), reportedBy: d.reportedBy, machine: d.machine, welder: d.welder, category: d.category }); setWhen(toLocalInput(Date.now())); }
      else onClose();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };

  return (
    <Modal title={item ? t('Edit downtime') : isWelder ? t('Log welder glitch') : t('Log downtime / glitch')} icon={<AlertTriangle />} onClose={onClose} size="wide"
      footer={<><button className="btn lg" onClick={onClose}>{t('Cancel')}</button>{!item && <button className="btn lg" onClick={() => save(true)} disabled={busy}>{t('Save & log another')}</button>}<button className="btn primary lg" onClick={() => save()} disabled={busy}>{busy ? t('Saving…') : t('Save')}</button></>}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="grid-form">
          <Field label="Machine" required><Combobox value={d.machine || ''} onChange={(v) => set('machine', v)} options={machines} placeholder={t('e.g. Bag Machine 2')} autoFocus={!d.machine} /></Field>
          {(welderNames.length > 0 || d.welder) && <Field label="Sonic welder (optional)"><Combobox value={d.welder || ''} onChange={pickWelder} options={welderNames} placeholder={t('Only if the welder caused it')} /></Field>}
          <Field label="When did it stop?"><input className="input" type="datetime-local" value={when} max={toLocalInput(Date.now() + 60_000)} onChange={(e) => setWhen(e.target.value)} /></Field>
        </div>
        <Field label="How long was it down? (minutes)">
          <div className="row wrap" style={{ gap: 6 }}>
            <NumberInput value={d.minutes} onChange={(v) => set('minutes', v ?? undefined)} min={0} placeholder="min" className="w-sm" />
            {QUICK_MIN.map((m) => <button key={m} type="button" className={`btn sm ${d.minutes === m ? 'primary' : ''}`} onClick={() => set('minutes', m)}>{fmtMinutes(m)}</button>)}
          </div>
        </Field>
        <Field label="Kind of problem">
          <div className="row wrap" style={{ gap: 6 }} role="group" aria-label={t('Kind of problem')}>
            {DOWNTIME_CATEGORIES.map((c) => <button key={c} type="button" className={`btn sm ${d.category === c ? 'primary' : ''}`} aria-pressed={d.category === c} onClick={() => set('category', d.category === c ? undefined : c)}>{t(c)}</button>)}
          </div>
        </Field>
        <Field label="What happened?" required><textarea className="input" value={d.problem || ''} onChange={(e) => set('problem', e.target.value)} placeholder={t('e.g. Seal not holding on the left side, bags opening')} rows={2} /></Field>
        <Field label="What fixed it? (optional)"><textarea className="input" value={d.fix || ''} onChange={(e) => set('fix', e.target.value)} placeholder={t('e.g. Cleaned anvil, raised amplitude to 80%')} rows={2} /></Field>
        <Field label="Photo (optional)"><div><PhotoAttach value={d.imageId} onChange={(id) => set('imageId', id)} label={d.machine} /></div></Field>
        <div className="grid-form">
          <Field label="Speed when it happened (bags / min, optional)"><NumberInput value={d.bpm} onChange={(v) => set('bpm', v ?? undefined)} min={0} placeholder="e.g. 120" /></Field>
          <Field label="Reported by (optional)"><Combobox value={d.reportedBy || ''} onChange={(v) => set('reportedBy', v)} options={uniqueSorted([...people, me?.name])} placeholder={t('Name')} /></Field>
        </div>
      </form>
    </Modal>
  );
}
