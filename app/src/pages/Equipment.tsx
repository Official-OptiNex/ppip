import { useEffect, useMemo, useState } from 'react';
import { Plus, Flame, CircleDot, Wrench, LogIn, LogOut, ArrowRightLeft, MoreVertical, Pencil, Trash2, History, LayoutGrid, List, Archive, CheckCircle2, Download } from 'lucide-react';
import type { Activity, Equipment, EquipmentType, Settings } from '../../../shared/types';
import { api } from '../lib/api';
import { applyUpsert, deleteDoc, newId, saveDoc, toast, toastError, useCanEdit, useStore } from '../lib/store';
import { fmtDate, fmtDuration, matches, pmState, setQuery, todayISO, uniqueSorted, fmtDateTime, download, toCSV, type PmState } from '../lib/util';
import { Combobox, Drawer, Empty, Field, Menu, Modal, NumberInput, SearchInput, Seg, confirmDialog, Spinner } from '../components/ui';

const STATUS_LABEL: Record<Equipment['status'], string> = { installed: 'On machine', spare: 'Spare', repair: 'Repair / rebuild', retired: 'Retired' };
const STATUS_CLS: Record<Equipment['status'], string> = { installed: 'ok', spare: 'info', repair: 'warn', retired: 'retired' };
const BAG: Record<string, string> = { small: 'Small bag', medium: 'Medium bag', large: 'Large bag', custom: 'Custom' };

export function describe(e: Equipment) {
  if (e.type === 'knife') {
    const tip = e.tipType === 'wide' ? 'Wide tip' : e.tipType === 'thin' ? 'Thin tip' : '';
    const bag = e.bagSize === 'custom' || (!e.bagSize && e.bagInches) ? (e.bagInches ? `${e.bagInches}" bag` : 'Custom bag') : e.bagSize ? BAG[e.bagSize] : '';
    return [tip, bag].filter(Boolean).join(' · ');
  }
  const cons = e.construction === 'segmented' ? 'Segmented' : e.construction === 'solid' ? 'Solid' : '';
  const kind = e.rollerType ? `${e.rollerType[0].toUpperCase()}${e.rollerType.slice(1)} roller` : 'Roller';
  const size = [e.diameter && `${e.diameter}" OD`, e.length && `${e.length}" long`].filter(Boolean).join(' × ');
  return [cons, kind, size].filter(Boolean).join(' · ');
}

export function EquipmentPage({ type, query }: { type: EquipmentType; query: URLSearchParams }) {
  const all = useStore((s) => s.docs.equipment);
  const settings = useStore((s) => s.settings);
  const canEdit = useCanEdit();
  const [q, setQ] = useState('');
  const [view, setView] = useState<'list' | 'machines'>(() => (localStorage.getItem(`ppip.eqview.${type}`) as 'list' | 'machines') || 'list');
  const [editing, setEditing] = useState<Equipment | 'new' | null>(null);
  const [action, setAction] = useState<{ e: Equipment; kind: ActionKind } | null>(null);
  const status = query.get('status') || 'active';
  const pmFilter = query.get('pm') || '';
  const machineFilter = query.get('machine') || '';
  const sub = query.get('sub') || '';
  const openId = query.get('open');
  const label = type === 'knife' ? 'Hot Knives' : 'Rollers';
  const one = type === 'knife' ? 'hot knife' : 'roller';
  useEffect(() => { try { localStorage.setItem(`ppip.eqview.${type}`, view); } catch { /* ignore */ } }, [view, type]);

  const items = useMemo(() => Object.values(all).filter((e) => e.type === type), [all, type]);
  const withPm = useMemo(() => items.map((e) => ({ e, pm: pmState(e, settings) })), [items, settings]);
  const counts = useMemo(() => ({
    installed: items.filter((e) => e.status === 'installed').length, spare: items.filter((e) => e.status === 'spare').length,
    repair: items.filter((e) => e.status === 'repair').length, retired: items.filter((e) => e.status === 'retired').length,
    due: withPm.filter((x) => x.pm.state === 'due').length, soon: withPm.filter((x) => x.pm.state === 'soon').length,
  }), [items, withPm]);
  const machines = useMemo(() => uniqueSorted([...items.map((e) => e.machine)]), [items]);

  const filtered = useMemo(() => withPm.filter(({ e, pm }) => {
    if (status === 'active' && e.status === 'retired') return false;
    if (['installed', 'spare', 'repair', 'retired'].includes(status) && e.status !== status) return false;
    if (pmFilter === 'due' && pm.state !== 'due') return false;
    if (pmFilter === 'soon' && pm.state !== 'soon' && pm.state !== 'due') return false;
    if (machineFilter && e.machine !== machineFilter) return false;
    if (sub && e.tipType !== sub && e.construction !== sub && e.rollerType !== sub) return false;
    return matches(q, e.tag, e.machine, e.position, describe(e), e.notes, STATUS_LABEL[e.status]);
  }).sort((a, b) => {
    const order = { due: 0, soon: 1, ok: 2, na: 3 } as Record<PmState, number>;
    return order[a.pm.state] - order[b.pm.state] || b.pm.pct - a.pm.pct || a.e.tag.localeCompare(b.e.tag, undefined, { numeric: true });
  }), [withPm, status, pmFilter, machineFilter, sub, q]);

  const open = openId ? all[openId] : undefined;
  const subOptions = type === 'knife'
    ? [['', 'Any tip'], ['thin', 'Thin tip'], ['wide', 'Wide tip']]
    : [['', 'Any type'], ['nip', 'Nip'], ['draw', 'Draw'], ['segmented', 'Segmented'], ['solid', 'Solid']];

  const exportCsv = () => download(`${type === 'knife' ? 'hot-knives' : 'rollers'}-${todayISO()}.csv`, toCSV(items.map((e) => {
    const pm = pmState(e, settings);
    return { tag: e.tag, status: STATUS_LABEL[e.status], machine: e.machine, position: e.position, details: describe(e), installed: e.installedAt ? fmtDate(e.installedAt) : '', daysOnMachine: e.status === 'installed' ? pm.days : '', pmIntervalDays: pm.interval, notes: e.notes };
  })), 'text/csv');

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{label}</h1>
          <div className="sub">{counts.installed} on machines · {counts.spare} spare · {counts.repair} in repair{counts.due ? <> · <b style={{ color: 'var(--danger)' }}>{counts.due} PM due</b></> : ''}</div>
        </div>
        <div className="btn-group">
          <Seg value={view} onChange={setView} options={[{ id: 'list', label: <><List size={17} style={{ verticalAlign: -3 }} /> List</> }, { id: 'machines', label: <><LayoutGrid size={17} style={{ verticalAlign: -3 }} /> By machine</> }]} />
          <button className="btn" onClick={exportCsv} title="Export CSV"><Download size={19} /></button>
          {canEdit && <button className="btn primary lg" onClick={() => setEditing('new')}><Plus />Add {one}</button>}
        </div>
      </div>

      <div className="tiles" style={{ marginBottom: '1rem' }} data-tour="eq-add">
                <button className="tile warn" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setQuery({ status: 'repair' })}><span className="t-label">In repair</span><span className="t-value">{counts.repair}</span><span className="t-sub">out for rebuild</span></button>
        <button className="tile" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setQuery({ status: 'retired' })}><span className="t-label">Retired</span><span className="t-value">{counts.retired}</span><span className="t-sub">scrapped</span></button>
        <button className="tile info" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setQuery({ status: 'installed' })}><span className="t-label">On machines</span><span className="t-value">{counts.installed}</span><span className="t-sub">in service now</span></button>
        <button className="tile" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setQuery({ status: 'spare' })}><span className="t-label">Spares ready</span><span className="t-value">{counts.spare}</span><span className="t-sub">ready to install</span></button>
      </div>

      <div className="row wrap" style={{ marginBottom: '1rem' }}>
        <SearchInput value={q} onChange={setQ} placeholder={`Search ${label.toLowerCase()} by tag, machine, size…`} />
        <select className="input" style={{ width: 'auto', minHeight: '3rem' }} value={status} onChange={(e) => setQuery({ status: e.target.value === 'active' ? null : e.target.value })}>
          <option value="active">All (not retired)</option><option value="installed">On machine</option><option value="spare">Spares</option><option value="repair">In repair</option><option value="retired">Retired</option><option value="all">Everything</option>
        </select>
        <select className="input" style={{ width: 'auto', minHeight: '3rem' }} value={machineFilter} onChange={(e) => setQuery({ machine: e.target.value })}>
          <option value="">All machines</option>{machines.map((m) => <option key={m}>{m}</option>)}
        </select>
        <select className="input" style={{ width: 'auto', minHeight: '3rem' }} value={sub} onChange={(e) => setQuery({ sub: e.target.value })}>
          {subOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card"><Empty icon={type === 'knife' ? <Flame size={48} /> : <CircleDot size={48} />} title={items.length ? 'Nothing matches' : `No ${label.toLowerCase()} yet`}>
          {!items.length && canEdit && <button className="btn primary" onClick={() => setEditing('new')}><Plus />Add the first {one}</button>}
        </Empty></div>
      ) : view === 'list' ? (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Tag / ID</th><th>Details</th><th>Machine</th><th>Installed</th><th style={{ minWidth: 200 }}>Time on machine</th><th>Status</th><th className="right">Actions</th></tr></thead>
            <tbody>
              {filtered.map(({ e, pm }) => (
                <tr key={e.id} className={`clickable ${pm.state === 'due' ? 'st-out' : pm.state === 'soon' ? 'st-low' : e.status === 'installed' ? 'st-ok' : e.status === 'retired' ? 'st-retired' : ''}`} onClick={() => setQuery({ open: e.id })}>
                  <td><b className="mono" style={{ fontSize: '1.05rem' }}>{e.tag}</b></td>
                  <td>{describe(e) || '—'}</td>
                  <td>{e.machine ? <><b>{e.machine}</b>{e.position && <div className="small muted">{e.position}</div>}</> : <span className="muted">—</span>}</td>
                  <td>{e.status === 'installed' ? fmtDate(e.installedAt) : '—'}</td>
                  <td><PmBar pm={pm} /></td>
                  <td><span className={`pill ${STATUS_CLS[e.status]}`}>{STATUS_LABEL[e.status]}</span></td>
                  <td onClick={(ev) => ev.stopPropagation()}><Actions e={e} canEdit={canEdit} onAction={(kind) => setAction({ e, kind })} onEdit={() => setEditing(e)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <MachineView list={filtered.map((x) => x.e)} settings={settings} onOpen={(id) => setQuery({ open: id })} />
      )}

      {open && <EquipmentDrawer e={open} onClose={() => setQuery({ open: null })} onAction={(kind) => setAction({ e: open, kind })} onEdit={() => setEditing(open)} />}
      {editing && <EquipmentForm type={type} item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {action && <ActionDialog e={action.e} kind={action.kind} onClose={() => setAction(null)} />}
    </div>
  );
}

function PmBar({ pm }: { pm: ReturnType<typeof pmState> }) {
  if (pm.state === 'na') return <span className="muted">—</span>;
  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
        <b>{fmtDuration(pm.days)}</b>
        {pm.interval > 0 && <span className={`small ${pm.state === 'due' ? '' : 'muted'}`} style={pm.state === 'due' ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>{pm.state === 'due' ? `${pm.days - pm.interval}d overdue` : `${pm.interval - pm.days}d left`}</span>}
      </div>
      {pm.interval > 0 && <div className={`progress ${pm.state === 'due' ? 'danger' : pm.state === 'soon' ? 'warn' : ''}`} style={{ marginTop: 4 }}><div style={{ width: `${Math.min(100, pm.pct * 100)}%` }} /></div>}
    </div>
  );
}

type ActionKind = 'install' | 'move' | 'remove' | 'service' | 'retire' | 'spare';

/** Permanently delete a knife / roller (asks first). Returns true when deleted. */
async function deleteForever(e: Equipment) {
  const what = e.type === 'knife' ? 'hot knife' : 'roller';
  if (!(await confirmDialog({ title: `Permanently delete ${what} ${e.tag}?`, body: <>It is removed completely and can't be brought back from this screen (only from a backup). Its history stays in the activity log.<br /><br />To keep it on record instead, use <b>Retire / scrap</b>.</>, confirm: 'Delete permanently', danger: true }))) return false;
  try { await deleteDoc('equipment', e.id); toast(`${e.tag} deleted`); return true; } catch (err) { toastError(err); return false; }
}
function Actions({ e, canEdit, onAction, onEdit }: { e: Equipment; canEdit: boolean; onAction: (k: ActionKind) => void; onEdit: () => void }) {
  if (!canEdit) return null;
  return (
    <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
      {e.status === 'installed' ? <>
        <button className="btn sm" onClick={() => onAction('remove')}><LogOut size={17} />Remove</button>
      </> : e.status !== 'retired' ? <button className="btn sm" onClick={() => onAction('install')}><LogIn size={17} />Install</button> : null}
      <Menu trigger={(t) => <button className="btn sm icon" onClick={t} aria-label="More"><MoreVertical size={18} /></button>}>
        {(close) => <>
          {e.status === 'installed' && <button onClick={() => { close(); onAction('move'); }}><ArrowRightLeft size={18} />Move to another machine</button>}
          {e.status === 'repair' && <button onClick={() => { close(); onAction('spare'); }}><CheckCircle2 size={18} />Back from repair (spare)</button>}
          <button onClick={() => { close(); onEdit(); }}><Pencil size={18} />Edit details</button>
          {e.status !== 'retired' && <button onClick={() => { close(); onAction('retire'); }}><Archive size={18} />Retire / scrap</button>}
          <hr />
          <button className="danger" onClick={() => { close(); deleteForever(e); }}><Trash2 size={18} />Delete permanently</button>
        </>}
      </Menu>
    </div>
  );
}

function MachineView({ list, settings, onOpen }: { list: Equipment[]; settings: Settings; onOpen: (id: string) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, Equipment[]>();
    for (const e of list) { const k = e.status === 'installed' ? e.machine || '(no machine)' : e.status === 'spare' ? '— Spares —' : e.status === 'repair' ? '— In repair —' : '— Retired —'; m.set(k, [...(m.get(k) || []), e]); }
    return [...m.entries()].sort((a, b) => (a[0].startsWith('—') ? 1 : 0) - (b[0].startsWith('—') ? 1 : 0) || a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [list]);
  return (
    <div className="machine-grid">
      {groups.map(([machine, items]) => (
        <div key={machine} className="card">
          <div className="card-head"><h3>{machine}</h3><span className="muted">{items.length}</span></div>
          <div className="card-body col" style={{ gap: '0.5rem' }}>
            {items.map((e) => {
              const pm = pmState(e, settings);
              return (
                <div key={e.id} className="eq-slot" onClick={() => onOpen(e.id)} role="button" tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter') onOpen(e.id); }}>
                  <span className={`dot ${pm.state === 'due' ? 'out' : pm.state === 'soon' ? 'low' : e.status === 'installed' ? 'ok' : 'retired'}`} />
                  <div className="grow">
                    <b className="mono">{e.tag}</b>{e.position && <span className="muted"> · {e.position}</span>}
                    <div className="small muted">{describe(e)}</div>
                  </div>
                  {e.status === 'installed' && <span className="small" style={{ fontWeight: 700, color: pm.state === 'due' ? 'var(--danger)' : pm.state === 'soon' ? 'var(--warn)' : undefined }}>{fmtDuration(pm.days)}</span>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function EquipmentDrawer({ e, onClose, onAction, onEdit }: { e: Equipment; onClose: () => void; onAction: (k: ActionKind) => void; onEdit: () => void }) {
  const settings = useStore((s) => s.settings);
  const canEdit = useCanEdit();
  const [hist, setHist] = useState<Activity[] | null>(null);
  const pm = pmState(e, settings);
  useEffect(() => {
    let alive = true;
    api<Activity[]>(`/activity?refId=${encodeURIComponent(e.id)}&limit=200`).then((r) => { if (alive) setHist(r); }).catch(() => { if (alive) setHist([]); });
    return () => { alive = false; };
  }, [e.id, e.updatedAt]);
  const remove = async () => { if (await deleteForever(e)) onClose(); };
  return (
    <Drawer onClose={onClose} head={<div className="row"><span className={`pill ${STATUS_CLS[e.status]}`}>{STATUS_LABEL[e.status]}</span>{pm.state === 'due' && <span className="pill danger">PM due</span>}{pm.state === 'soon' && <span className="pill warn">PM soon</span>}</div>}>
      <div className="stack">
        <div>
          <div className="muted" style={{ fontWeight: 700 }}>{e.type === 'knife' ? 'Hot knife' : 'Roller'}</div>
          <h2 className="mono" style={{ fontSize: '1.8rem' }}>{e.tag}</h2>
          <div style={{ fontSize: '1.1rem' }}>{describe(e)}</div>
        </div>
        {e.status === 'installed' && (
          <div className="card card-pad">
            <div className="muted">On <b style={{ color: 'var(--text)' }}>{e.machine}</b>{e.position ? ` · ${e.position}` : ''} since {fmtDate(e.installedAt)}</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: 4 }}>{fmtDuration(pm.days)}</div>
            <PmBar pm={pm} />
            {e.lastServiceAt && <div className="small muted" style={{ marginTop: 6 }}>Last serviced {fmtDate(e.lastServiceAt)}</div>}
          </div>
        )}
        {canEdit && (
          <div className="btn-group">
            {e.status === 'installed' ? <>
              <button className="btn lg" onClick={() => onAction('move')}><ArrowRightLeft />Move</button>
              <button className="btn lg" onClick={() => onAction('remove')}><LogOut />Remove</button>
            </> : e.status !== 'retired' && <button className="btn primary lg" onClick={() => onAction('install')}><LogIn />Install on machine</button>}
            {e.status === 'repair' && <button className="btn lg" onClick={() => onAction('spare')}><CheckCircle2 />Back from repair</button>}
            <button className="btn lg" onClick={onEdit}><Pencil />Edit</button>
            {e.status !== 'retired' && <button className="btn lg" onClick={() => onAction('retire')}><Archive />Retire</button>}
            <button className="btn lg danger-ghost" onClick={remove}><Trash2 />Delete</button>
          </div>
        )}
        <div className="card card-pad">
          <dl className="kv" style={{ margin: 0 }}>
            {e.type === 'knife' ? <>
              <dt>Tip type</dt><dd>{e.tipType === 'wide' ? 'Wide tip' : e.tipType === 'thin' ? 'Thin tip' : '—'}</dd>
              <dt>Bag type</dt><dd>{e.bagSize ? BAG[e.bagSize] : '—'}{e.bagInches ? ` · ${e.bagInches}"` : ''}</dd>
            </> : <>
              <dt>Construction</dt><dd style={{ textTransform: 'capitalize' }}>{e.construction || '—'}</dd>
              <dt>Roller type</dt><dd style={{ textTransform: 'capitalize' }}>{e.rollerType || '—'}</dd>
              <dt>Outer diameter</dt><dd>{e.diameter ? `${e.diameter}"` : '—'}</dd>
              <dt>Roller length</dt><dd>{e.length ? `${e.length}"` : '—'}</dd>
            </>}
          </dl>
          {e.notes && <><hr className="divider" /><div style={{ whiteSpace: 'pre-wrap' }}>{e.notes}</div></>}
        </div>
        <div>
          <h3 style={{ marginBottom: '0.6rem' }}><History size={18} style={{ verticalAlign: -3 }} /> History</h3>
          <div className="card">
            {!hist ? <div className="card-pad center"><Spinner /></div> : hist.length === 0 ? <div className="empty small">No history yet.</div> : (
              <div className="list">{hist.map((h) => <div key={h.id} className="list-item"><div className="grow"><div>{h.summary}</div><div className="small muted">{fmtDateTime(h.at)} · {h.userName}</div></div></div>)}</div>
            )}
          </div>
        </div>
      </div>
    </Drawer>
  );
}

function ActionDialog({ e, kind, onClose }: { e: Equipment; kind: ActionKind; onClose: () => void }) {
  const machinesDocs = useStore((s) => s.docs.machines);
  const all = useStore((s) => s.docs.equipment);
  const machines = useMemo(() => uniqueSorted([...Object.values(machinesDocs).map((m) => m.name), ...Object.values(all).map((x) => x.machine)]), [machinesDocs, all]);
  const [machine, setMachine] = useState(kind === 'move' ? '' : e.machine || '');
  const [position, setPosition] = useState(e.position || '');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [to, setTo] = useState<'spare' | 'repair'>('spare');
  const [busy, setBusy] = useState(false);
  const one = e.type === 'knife' ? 'hot knife' : 'roller';
  const needsMachine = kind === 'install' || kind === 'move';
  const occupying = needsMachine && machine ? Object.values(all).filter((x) => x.id !== e.id && x.type === e.type && x.status === 'installed' && x.machine === machine && (!position || !x.position || x.position === position)) : [];
  const titles: Record<ActionKind, string> = { install: `Install ${e.tag}`, move: `Move ${e.tag}`, remove: `Remove ${e.tag}`, service: `Log service for ${e.tag}`, retire: `Retire ${e.tag}`, spare: `${e.tag} back from repair` };

  const submit = async () => {
    if (needsMachine && !machine.trim()) { toast('Choose a machine', 'danger'); return; }
    setBusy(true);
    try {
      const at = new Date(date + 'T' + new Date().toTimeString().slice(0, 8)).getTime();
      const res = await api<Equipment>(`/equipment/${e.id}/action`, { body: { action: kind, machine, position: e.type === 'knife' ? '' : position, note, to, at: date === todayISO() ? Date.now() : at } });
      applyUpsert('equipment', res);
      toast(titles[kind].replace(/^\w+/, (w) => ({ Install: 'Installed', Move: 'Moved', Remove: 'Removed', Log: 'Logged', Retire: 'Retired' } as Record<string, string>)[w] || w));
      onClose();
    } catch (err) { toastError(err); } finally { setBusy(false); }
  };
  return (
    <Modal title={titles[kind]} onClose={onClose} footer={<><button className="btn lg" onClick={onClose}>Cancel</button><button className={`btn lg ${kind === 'retire' ? 'danger' : 'primary'}`} onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Confirm'}</button></>}>
      <form className="stack" onSubmit={(ev) => { ev.preventDefault(); submit(); }}>
        <div className="muted">{describe(e)}{e.machine ? ` · currently on ${e.machine}` : ''}</div>
        {needsMachine && <>
          <Field label="Machine" required><Combobox value={machine} onChange={setMachine} options={machines} placeholder="e.g. Bag Machine 2" autoFocus /></Field>
          {e.type === 'roller' && <Field label="Position (optional)" hint="Front / rear, upper / lower, station #…"><input className="input" value={position} onChange={(ev) => setPosition(ev.target.value)} /></Field>}
          {occupying.length > 0 && <div className="banner warn">Already on {machine}: {occupying.map((x) => `${x.tag}${x.position ? ` (${x.position})` : ''}`).join(', ')}. Remove it first if this {one} replaces it.</div>}
        </>}
        {kind === 'remove' && (
          <Field label="Where is it going?">
            <Seg value={to} onChange={setTo} options={[{ id: 'spare', label: 'Back to spares' }, { id: 'repair', label: 'Repair / rebuild' }]} />
          </Field>
        )}
        {kind !== 'retire' && kind !== 'spare' && <Field label="Date"><input className="input" type="date" value={date} max={todayISO()} onChange={(ev) => setDate(ev.target.value)} /></Field>}
        <Field label="Note (optional)"><input className="input" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder={kind === 'remove' ? 'e.g. tip worn, uneven seal' : kind === 'service' ? 'e.g. cleaned & re-tensioned' : ''} /></Field>
      </form>
    </Modal>
  );
}

function EquipmentForm({ type, item, onClose }: { type: EquipmentType; item?: Equipment; onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const machinesDocs = useStore((s) => s.docs.machines);
  const all = useStore((s) => s.docs.equipment);
  const machines = useMemo(() => uniqueSorted([...Object.values(machinesDocs).map((m) => m.name), ...Object.values(all).map((x) => x.machine)]), [machinesDocs, all]);
  const [d, setD] = useState<Partial<Equipment>>(() => item ? { ...item } : { type, status: 'spare', ...(type === 'knife' ? { tipType: 'thin', bagSize: 'medium' } : { construction: 'solid', rollerType: 'nip' }) });
  const [installDate, setInstallDate] = useState(item?.installedAt ? new Date(item.installedAt).toISOString().slice(0, 10) : todayISO());
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Equipment>(k: K, v: Equipment[K] | null | undefined) => setD((x) => ({ ...x, [k]: v ?? undefined }));
    const dupTag = d.tag && Object.values(all).some((x) => x.id !== item?.id && x.type === type && x.tag.toLowerCase() === d.tag!.trim().toLowerCase());

  const save = async () => {
    if (!d.tag?.trim()) { toast('Enter a tag / ID', 'danger'); return; }
    if (d.status === 'installed' && !d.machine) { toast('Choose the machine it is on', 'danger'); return; }
    setBusy(true);
    try {
      const patch: Partial<Equipment> = { ...d, type, pmDays: undefined, ...(type === 'knife' ? { position: '' } : {}) };
      if (d.status === 'installed') patch.installedAt = new Date(installDate + 'T12:00:00').getTime();
      else { patch.machine = ''; patch.position = ''; patch.installedAt = null; }
      await saveDoc('equipment', item?.id || newId(), patch, `Save ${d.tag}`);
      toast(item ? 'Saved' : `Added ${d.tag}`);
      onClose();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };

  return (
    <Modal title={item ? `Edit ${item.tag}` : `Add ${type === 'knife' ? 'hot knife' : 'roller'}`} onClose={onClose} size="wide"
      footer={<><button className="btn lg" onClick={onClose}>Cancel</button><button className="btn primary lg" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="grid-form">
          <Field label="Tag / ID number" required hint="What's stamped or written on it"><input className="input mono" value={d.tag || ''} onChange={(e) => set('tag', e.target.value)} autoFocus placeholder={type === 'knife' ? 'e.g. HK-114' : 'e.g. RL-207'} /></Field>
          {type === 'knife' ? <>
            <Field label="Tip type"><Seg value={d.tipType || 'thin'} onChange={(v) => set('tipType', v)} options={[{ id: 'thin', label: 'Thin tip' }, { id: 'wide', label: 'Wide tip' }]} /></Field>
            <Field label="Bag type it's meant for">
              <select className="input" value={d.bagSize || ''} onChange={(e) => set('bagSize', (e.target.value || undefined) as Equipment['bagSize'])}>
                <option value="">—</option><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option><option value="custom">Custom (inches)</option>
              </select>
            </Field>
            <Field label="Bag size in inches (optional)"><NumberInput value={d.bagInches} onChange={(v) => set('bagInches', v)} placeholder='e.g. 14.5' /></Field>
          </> : <>
            <Field label="Construction"><Seg value={d.construction || 'solid'} onChange={(v) => set('construction', v)} options={[{ id: 'solid', label: 'Solid' }, { id: 'segmented', label: 'Segmented' }]} /></Field>
            <Field label="Roller type">
              <select className="input" value={d.rollerType || ''} onChange={(e) => set('rollerType', (e.target.value || undefined) as Equipment['rollerType'])}>
                <option value="nip">Nip roller</option><option value="draw">Draw roller</option><option value="idler">Idler</option><option value="other">Other</option>
              </select>
            </Field>
            <Field label="Outer diameter (in, optional)"><NumberInput value={d.diameter} onChange={(v) => set('diameter', v)} min={0} placeholder='e.g. 4.5' /></Field>
            <Field label="Roller length (in)"><NumberInput value={d.length} onChange={(v) => set('length', v)} min={0} placeholder='e.g. 36' /></Field>
          </>}
        </div>
        {dupTag && <div className="banner warn" style={{ marginTop: '1rem' }}>Another {type === 'knife' ? 'knife' : 'roller'} already uses this tag.</div>}
        <div className="form-section">
          <h3>Where is it now?</h3>
          <Seg value={d.status || 'spare'} onChange={(v) => set('status', v)} options={[{ id: 'installed', label: 'On a machine' }, { id: 'spare', label: 'Spare' }, { id: 'repair', label: 'In repair' }, { id: 'retired', label: 'Retired' }]} />
          {d.status === 'installed' && (
            <div className="grid-form" style={{ marginTop: '1rem' }}>
              <Field label="Machine" required><Combobox value={d.machine || ''} onChange={(v) => set('machine', v)} options={machines} placeholder="e.g. Bag Machine 1" /></Field>
              {type === 'roller' && <Field label="Position"><input className="input" value={d.position || ''} onChange={(e) => set('position', e.target.value)} placeholder="Front / rear / station" /></Field>}
              <Field label="Installed on" hint="Used to count days on machine"><input className="input" type="date" value={installDate} max={todayISO()} onChange={(e) => setInstallDate(e.target.value)} /></Field>
            </div>
          )}
        </div>
        <div className="form-section">
          <Field label="Notes"><textarea className="input" value={d.notes || ''} onChange={(e) => set('notes', e.target.value)} placeholder="Temperature setpoint, wear notes, vendor, rebuild count…" /></Field>
        </div>
      </form>
    </Modal>
  );
}
