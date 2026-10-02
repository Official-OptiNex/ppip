import { useEffect, useMemo, useState } from 'react';
import { Plus, Flame, CircleDot, LogIn, LogOut, ArrowRightLeft, MoreVertical, Pencil, Trash2, History, LayoutGrid, List, Archive, CheckCircle2, Download, Hourglass, AudioWaveform, Tag } from 'lucide-react';
import { EQUIPMENT_LABEL, REMOVAL_REASONS, type Activity, type Equipment, type EquipmentType, type Settings, type Stint } from '../../../shared/types';
import { api } from '../lib/api';
import { applyUpsert, deleteDoc, newId, saveDoc, toast, toastError, useCanEdit, useStore } from '../lib/store';
import { fmtDate, fmtDuration, matches, pmState, setQuery, todayISO, uniqueSorted, fmtDateTime, download, toCSV, type PmState } from '../lib/util';
import { Combobox, Drawer, Empty, Field, Menu, Modal, NumberInput, SearchInput, Seg, confirmDialog, Spinner } from '../components/ui';
import { HBarList } from '../components/Charts';
import { plural, t } from '../lib/i18n';
import { rich } from '../components/ui';
import { tmap } from '../lib/util';

const STATUS_LABEL: Record<Equipment['status'], string> = tmap({ installed: 'On machine', spare: 'Spare', repair: 'Repair / rebuild', retired: 'Retired' });
const STATUS_CLS: Record<Equipment['status'], string> = { installed: 'ok', spare: 'info', repair: 'warn', retired: 'retired' };
const statusLabel = (e: Equipment) => (e.status === 'installed' && (e.type === 'horn' || e.type === 'anvil') ? t('On welder') : STATUS_LABEL[e.status]);
const BAG: Record<string, string> = tmap({ small: 'Small bag', medium: 'Medium bag', large: 'Large bag', custom: 'Custom' });

const isWeld = (ty: EquipmentType) => ty === 'horn' || ty === 'anvil';
/** What a horn / anvil is "installed on" is a sonic welder; everything else goes on a machine. */
export const hostWord = (ty: EquipmentType) => (isWeld(ty) ? 'welder' : 'machine');
/** Pick the machine- or welder-flavoured text, translated: hw(type, 'On machines', 'On welders'). */
const hw = (ty: EquipmentType, machine: string, welder: string, vars?: Record<string, string | number>) => t(isWeld(ty) ? welder : machine, vars);
/** "Hot knife" → translated, lower-case for use inside sentences. */
export const oneName = (ty: EquipmentType) => t(EQUIPMENT_LABEL[ty].one).toLowerCase();
export const manyName = (ty: EquipmentType) => t(EQUIPMENT_LABEL[ty].many);
const DAY_MS = 86_400_000;
export { isWeld };
export const stintDays = (h: Stint, now = Date.now()) => Math.max(0, Math.round(((h.removedAt || now) - h.installedAt) / DAY_MS));
const toISO = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fromISO = (iso: string) => new Date(iso + 'T12:00:00').getTime();

/** Names the "machine" box offers: machines for knives / rollers, sonic welders for horns / anvils. */
function useHosts(type: EquipmentType) {
  const machinesDocs = useStore((s) => s.docs.machines);
  const welders = useStore((s) => s.docs.welders);
  const all = useStore((s) => s.docs.equipment);
  return useMemo(() => isWeld(type)
    ? uniqueSorted([...Object.values(welders).map((w) => w.name), ...Object.values(all).filter((x) => isWeld(x.type)).map((x) => x.machine)])
    : uniqueSorted([...Object.values(machinesDocs).map((m) => m.name), ...Object.values(all).filter((x) => !isWeld(x.type)).map((x) => x.machine)]), [type, machinesDocs, welders, all]);
}

export function describe(e: Equipment) {
  if (isWeld(e.type)) return e.partNumber ? `${t('Part #')} ${e.partNumber}` : '';
  if (e.type === 'knife') {
    const tip = e.tipType === 'wide' ? t('Wide tip') : e.tipType === 'thin' ? t('Thin tip') : '';
    const bag = e.bagSize === 'custom' || (!e.bagSize && e.bagInches) ? (e.bagInches ? t('{n}" bag', { n: e.bagInches }) : t('Custom bag')) : e.bagSize ? BAG[e.bagSize] : '';
    return [tip, bag].filter(Boolean).join(' · ');
  }
  const cons = e.construction === 'segmented' ? t('Segmented') : e.construction === 'solid' ? t('Solid') : '';
  const kind = e.rollerType ? t(`${e.rollerType[0].toUpperCase()}${e.rollerType.slice(1)} roller`) : t('Roller');
  const size = [e.diameter && t('{n}" OD', { n: e.diameter }), e.length && t('{n}" long', { n: e.length })].filter(Boolean).join(' × ');
  return [cons, kind, size].filter(Boolean).join(' · ');
}

export function EquipmentPage({ type, query, embedded }: { type: EquipmentType; query: URLSearchParams; embedded?: boolean }) {
  const all = useStore((s) => s.docs.equipment);
  const settings = useStore((s) => s.settings);
  const canEdit = useCanEdit();
  const [q, setQ] = useState('');
  const [view, setView] = useState<'list' | 'machines' | 'life'>(() => { try { return (localStorage.getItem(`ppip.eqview.${type}`) as 'list' | 'machines' | 'life') || 'list'; } catch { return 'list'; } });
  const [editing, setEditing] = useState<Equipment | 'new' | null>(null);
  const [action, setAction] = useState<{ e: Equipment; kind: ActionKind } | null>(null);
  const status = query.get('status') || 'active';
  const pmFilter = query.get('pm') || '';
  const machineFilter = query.get('machine') || '';
  const sub = query.get('sub') || '';
  const openId = query.get('open');
  const label = manyName(type);
  const one = oneName(type);
  const host = hostWord(type);
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

  // "How long they last" counts every one, retired included (that's where most of the history is)
  const lifeList = useMemo(() => items.filter((e) => (!machineFilter || e.machine === machineFilter)
    && (!sub || e.tipType === sub || e.construction === sub || e.rollerType === sub)
    && matches(q, e.tag, e.machine, e.position, describe(e), e.notes)), [items, machineFilter, sub, q]);

  const open = openId ? all[openId] : undefined;
  const subOptions = type === 'knife'
    ? [['', 'Any tip'], ['thin', 'Thin tip'], ['wide', 'Wide tip']] as [string, string][]
    : type === 'roller' ? [['', 'Any type'], ['nip', 'Nip'], ['draw', 'Draw'], ['segmented', 'Segmented'], ['solid', 'Solid']] : null;

  // one row per install → pull, so the sheet answers "which machine, when, how long, why"
  const exportCsv = () => download(`${label.toLowerCase().replace(/\s+/g, '-')}-history-${todayISO()}.csv`, '\ufeff' + toCSV(items.flatMap((e): Record<string, unknown>[] => {
    const base = { tag: e.tag, details: describe(e), status: STATUS_LABEL[e.status] };
    const h = e.history || [];
    if (!h.length) return [{ ...base, [host]: '', installed: '', pulled: '', days: '', reason: '', note: e.notes || '' }];
    return h.map((x) => ({ ...base, [host]: x.machine + (x.position ? ` (${x.position})` : ''), installed: fmtDate(x.installedAt), pulled: x.removedAt ? fmtDate(x.removedAt) : 'still on', days: stintDays(x), reason: x.reason || '', note: x.note || '' }));
  })), 'text/csv');

  return (
    <div>
      <div className="page-head">
        <div>
          {embedded ? <h2>{label}</h2> : <h1>{label}</h1>}
          <div className="sub">{hw(type, '{n} on machines', '{n} on welders', { n: counts.installed })} · {t('{n} spare', { n: counts.spare })} · {t('{n} in repair', { n: counts.repair })}</div>
        </div>
        <div className="btn-group">
          <Seg value={view} onChange={setView} options={[{ id: 'list', label: <><List size={17} style={{ verticalAlign: -3 }} /> {t('List')}</> }, { id: 'machines', label: <><LayoutGrid size={17} style={{ verticalAlign: -3 }} /> {hw(type, 'By machine', 'By welder')}</> }, { id: 'life', label: <><Hourglass size={17} style={{ verticalAlign: -3 }} /> {t('How long they last')}</> }]} />
          <button className="btn" onClick={exportCsv} title={t('Export install / pull history (CSV)')} aria-label={t('Export install / pull history (CSV)')}><Download size={19} /></button>
          {canEdit && <button className="btn primary lg" onClick={() => setEditing('new')}><Plus />{t('Add {what}', { what: one })}</button>}
        </div>
      </div>

      <div className="tiles" style={{ marginBottom: '1rem' }} data-tour="eq-add">
                <button className="tile warn" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setQuery({ status: 'repair' })}><span className="t-label">{t('In repair')}</span><span className="t-value">{counts.repair}</span><span className="t-sub">{t('out for rebuild')}</span></button>
        <button className="tile" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setQuery({ status: 'retired' })}><span className="t-label">{t('Retired')}</span><span className="t-value">{counts.retired}</span><span className="t-sub">{t('scrapped')}</span></button>
        <button className="tile info" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setQuery({ status: 'installed' })}><span className="t-label">{hw(type, 'On machines', 'On welders')}</span><span className="t-value">{counts.installed}</span><span className="t-sub">{t('in service now')}</span></button>
        <button className="tile" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setQuery({ status: 'spare' })}><span className="t-label">{t('Spares ready')}</span><span className="t-value">{counts.spare}</span><span className="t-sub">{t('ready to install')}</span></button>
      </div>

      <div className="row wrap" style={{ marginBottom: '1rem' }}>
        <SearchInput value={q} onChange={setQ} placeholder={hw(type, 'Search by tag, machine, size…', 'Search by tag, welder…')} />
        {view !== 'life' && <select className="input" style={{ width: 'auto', minHeight: '3rem' }} value={status} onChange={(e) => setQuery({ status: e.target.value === 'active' ? null : e.target.value })}>
          <option value="active">{t('All (not retired)')}</option><option value="installed">{hw(type, 'On machine', 'On welder')}</option><option value="spare">{t('Spares')}</option><option value="repair">{t('In repair')}</option><option value="retired">{t('Retired')}</option><option value="all">{t('Everything')}</option>
        </select>}
        <select className="input" style={{ width: 'auto', minHeight: '3rem' }} value={machineFilter} onChange={(e) => setQuery({ machine: e.target.value })}>
          <option value="">{hw(type, 'All machines', 'All welders')}</option>{machines.map((m) => <option key={m}>{m}</option>)}
        </select>
        {subOptions && <select className="input" style={{ width: 'auto', minHeight: '3rem' }} value={sub} onChange={(e) => setQuery({ sub: e.target.value })}>
          {subOptions.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
        </select>}
      </div>

      {view === 'life' ? (
        <Lifespan type={type} list={lifeList} onOpen={(id) => setQuery({ open: id })} />
      ) : filtered.length === 0 ? (
        <div className="card"><Empty icon={type === 'knife' ? <Flame size={48} /> : type === 'roller' ? <CircleDot size={48} /> : <AudioWaveform size={48} />} title={items.length ? t('Nothing matches') : t('Nothing here yet.')}>
          {!items.length && canEdit && <button className="btn primary" onClick={() => setEditing('new')}><Plus />{t('Add {what}', { what: one })}</button>}
        </Empty></div>
      ) : view === 'list' ? (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>{t('Tag / ID')}</th><th>{t('Details')}</th><th>{hw(type, 'Machine', 'Welder')}</th><th>{t('Installed')}</th><th style={{ minWidth: 200 }}>{hw(type, 'Time on machine', 'Time on welder')}</th><th>{t('Status')}</th><th className="right">{t('Actions')}</th></tr></thead>
            <tbody>
              {filtered.map(({ e, pm }) => (
                <tr key={e.id} className={`clickable ${pm.state === 'due' ? 'st-out' : pm.state === 'soon' ? 'st-low' : e.status === 'installed' ? 'st-ok' : e.status === 'retired' ? 'st-retired' : ''}`} onClick={() => setQuery({ open: e.id })}>
                  <td><b className="mono" style={{ fontSize: '1.05rem' }}>{e.tag}</b></td>
                  <td>{describe(e) || '—'}</td>
                  <td>{e.machine ? <><b>{e.machine}</b>{e.position && <div className="small muted">{e.position}</div>}</> : <span className="muted">—</span>}</td>
                  <td>{e.status === 'installed' ? fmtDate(e.installedAt) : '—'}</td>
                  <td><PmBar pm={pm} /></td>
                  <td><span className={`pill ${STATUS_CLS[e.status]}`}>{statusLabel(e)}</span></td>
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
        {pm.interval > 0 && <span className={`small ${pm.state === 'due' ? '' : 'muted'}`} style={pm.state === 'due' ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>{pm.state === 'due' ? t('{n}d overdue', { n: pm.days - pm.interval }) : t('{n}d left', { n: pm.interval - pm.days })}</span>}
      </div>
      {pm.interval > 0 && <div className={`progress ${pm.state === 'due' ? 'danger' : pm.state === 'soon' ? 'warn' : ''}`} style={{ marginTop: 4 }}><div style={{ width: `${Math.min(100, pm.pct * 100)}%` }} /></div>}
    </div>
  );
}

type ActionKind = 'install' | 'move' | 'remove' | 'service' | 'retire' | 'spare';

/** Permanently delete a knife / roller (asks first). Returns true when deleted. */
async function deleteForever(e: Equipment) {
  if (!(await confirmDialog({ title: t('Permanently delete {what} {tag}?', { what: oneName(e.type), tag: e.tag }), body: <>{t("It is removed completely and can't be brought back from this screen (only from a backup). Its history stays in the activity log.")}<br /><br />{rich('To keep it on record instead, use **Retire / scrap**.')}</>, confirm: t('Delete permanently'), danger: true }))) return false;
  try { await deleteDoc('equipment', e.id); toast(t('{tag} deleted', { tag: e.tag })); return true; } catch (err) { toastError(err); return false; }
}
function Actions({ e, canEdit, onAction, onEdit }: { e: Equipment; canEdit: boolean; onAction: (k: ActionKind) => void; onEdit: () => void }) {
  if (!canEdit) return null;
  return (
    <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
      {e.status === 'installed' ? <>
        <button className="btn sm" onClick={() => onAction('remove')}><LogOut size={17} />{t('Remove')}</button>
      </> : e.status !== 'retired' ? <button className="btn sm" onClick={() => onAction('install')}><LogIn size={17} />{t('Install')}</button> : null}
      <Menu trigger={(tg) => <button className="btn sm icon" onClick={tg} aria-label={t('More')}><MoreVertical size={18} /></button>}>
        {(close) => <>
          {e.status === 'installed' && <button onClick={() => { close(); onAction('move'); }}><ArrowRightLeft size={18} />{hw(e.type, 'Move to another machine', 'Move to another welder')}</button>}
          {e.status === 'repair' && <button onClick={() => { close(); onAction('spare'); }}><CheckCircle2 size={18} />{t('Back from repair (spare)')}</button>}
          <button onClick={() => { close(); onEdit(); }}><Pencil size={18} />{t('Edit details')}</button>
          {e.status !== 'retired' && <button onClick={() => { close(); onAction('retire'); }}><Archive size={18} />{t('Retire / scrap')}</button>}
          <hr />
          <button className="danger" onClick={() => { close(); deleteForever(e); }}><Trash2 size={18} />{t('Delete permanently')}</button>
        </>}
      </Menu>
    </div>
  );
}

function MachineView({ list, settings, onOpen }: { list: Equipment[]; settings: Settings; onOpen: (id: string) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, Equipment[]>();
    for (const e of list) { const k = e.status === 'installed' ? e.machine || `(${hw(e.type, 'no machine', 'no welder')})` : `— ${t(e.status === 'spare' ? 'Spares' : e.status === 'repair' ? 'In repair' : 'Retired')} —`; m.set(k, [...(m.get(k) || []), e]); }
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

/** Pulls (finished stints), optionally only those with one removal reason. */
function pulls(e: Equipment, reason = '') {
  return (e.history || []).filter((h) => h.removedAt && (!reason || (h.reason || 'No reason given') === reason));
}
function lifeStats(list: Stint[]) {
  if (!list.length) return null;
  const d = list.map((h) => stintDays(h));
  return { n: d.length, avg: Math.round(d.reduce((a, b) => a + b, 0) / d.length), max: Math.max(...d), min: Math.min(...d) };
}
const NO_REASON = 'No reason given';
const days = (n: number) => plural(n, '{n} day', '{n} days');

/** "How long did they last": every pull, averaged per item, per kind, per machine and per reason. */
function Lifespan({ type, list, onOpen }: { type: EquipmentType; list: Equipment[]; onOpen: (id: string) => void }) {
  const [reason, setReason] = useState('');
  const all = useMemo(() => list.flatMap((e) => pulls(e).map((h) => ({ e, h }))), [list]);
  const reasons = useMemo(() => uniqueSorted(all.map((x) => x.h.reason || 'No reason given')), [all]);
  const shown = useMemo(() => all.filter((x) => !reason || (x.h.reason || 'No reason given') === reason), [all, reason]);
  const total = lifeStats(shown.map((x) => x.h));
  const rows = useMemo(() => list.map((e) => ({ e, s: lifeStats(pulls(e, reason)), last: pulls(e, reason).slice(-1)[0], open: (e.history || []).find((h) => !h.removedAt) }))
    .sort((a, b) => (b.s ? 1 : 0) - (a.s ? 1 : 0) || (b.s?.avg || 0) - (a.s?.avg || 0) || a.e.tag.localeCompare(b.e.tag, undefined, { numeric: true })), [list, reason]);
  const group = (keyOf: (e: Equipment, h: Stint) => string) => {
    const m = new Map<string, Stint[]>();
    for (const { e, h } of shown) { const k = keyOf(e, h); if (k) m.set(k, [...(m.get(k) || []), h]); }
    return [...m.entries()].map(([k, hs]) => { const s = lifeStats(hs)!; return { key: k, label: k, value: s.avg, sub: plural(s.n, '{n} pull', '{n} pulls') }; }).sort((a, b) => b.value - a.value);
  };
  const byKind = type === 'knife' ? group((e) => (e.tipType === 'wide' ? t('Wide tip') : e.tipType === 'thin' ? t('Thin tip') : ''))
    : type === 'roller' ? group((e) => (e.rollerType ? t(`${e.rollerType[0].toUpperCase()}${e.rollerType.slice(1)} roller`) : '')) : [];
  const byHost = group((_e, h) => h.machine);
  const byReason = useMemo(() => {
    const m = new Map<string, number>();
    for (const { h } of all) m.set(h.reason || 'No reason given', (m.get(h.reason || 'No reason given') || 0) + 1);
    return [...m.entries()].map(([k, v]) => ({ key: k, label: t(k), value: v })).sort((a, b) => b.value - a.value);
  }, [all]);

  if (!all.length) return <div className="card"><Empty icon={<Hourglass size={48} />} title="Nothing pulled yet">{hw(type, 'When one is removed from a machine, how long it lasted shows up here.', 'When one is removed from a welder, how long it lasted shows up here.')}</Empty></div>;
  return (
    <div className="stack" data-testid="lifespan">
      <div className="row wrap">
        <b>{t('Removal reason:')}</b>
        <select className="input" style={{ width: 'auto', minHeight: '3rem' }} value={reason} onChange={(ev) => setReason(ev.target.value)} aria-label={t('Filter by removal reason')}>
          <option value="">{t('All reasons')}</option>{reasons.map((r) => <option key={r} value={r}>{t(r)}</option>)}
        </select>
      </div>
      {total && (
        <div className="tiles">
          <div className="tile info"><span className="t-label">{t('Average life')}</span><span className="t-value">{days(total.avg)}</span><span className="t-sub">{plural(total.n, 'over {n} pull', 'over {n} pulls')}</span></div>
          <div className="tile"><span className="t-label">{t('Longest')}</span><span className="t-value">{days(total.max)}</span></div>
          <div className="tile warn"><span className="t-label">{t('Shortest')}</span><span className="t-value">{days(total.min)}</span></div>
        </div>
      )}
      <div className="grid-2">
        {byKind.length > 0 && <div className="card"><div className="card-head"><h3>{t('Average days by type')}</h3></div><div className="card-body"><HBarList rows={byKind} format={days} /></div></div>}
        <div className="card"><div className="card-head"><h3>{hw(type, 'Average days by machine', 'Average days by welder')}</h3></div><div className="card-body"><HBarList rows={byHost} format={days} /></div></div>
        <div className="card"><div className="card-head"><h3>{t('Why they were pulled')}</h3></div><div className="card-body"><HBarList rows={byReason} format={(n) => `${n}×`} /></div></div>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>{t('Tag / ID')}</th><th>{t('Details')}</th><th className="num">{t('Times pulled')}</th><th className="num">{t('Average')}</th><th className="num">{t('Longest')}</th><th className="num">{t('Shortest')}</th><th>{t('Last pulled')}</th><th>{t('On now')}</th></tr></thead>
          <tbody>
            {rows.map(({ e, s, last, open }) => (
              <tr key={e.id} className="clickable" onClick={() => onOpen(e.id)}>
                <td><b className="mono">{e.tag}</b></td>
                <td className="small">{describe(e) || '—'}</td>
                <td className="num">{s?.n || 0}</td>
                <td className="num"><b>{s ? days(s.avg) : '—'}</b></td>
                <td className="num">{s ? days(s.max) : '—'}</td>
                <td className="num">{s ? days(s.min) : '—'}</td>
                <td>{last ? <>{fmtDate(last.removedAt)}<div className="small muted">{last.machine}{last.reason ? ` · ${t(last.reason)}` : ''}</div></> : '—'}</td>
                <td>{open ? <>{open.machine}<div className="small muted">{t('{d} so far', { d: days(stintDays(open)) })}</div></> : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Install → pull list for one item: which machine, when it went on, when it came off, how long, why. */
function InstallHistory({ e }: { e: Equipment }) {
  const canEdit = useCanEdit();
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const hist = e.history || [];
  const rows = hist.map((h, i) => ({ h, i })).reverse();
  const s = lifeStats(pulls(e));
  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.6rem' }}>
        <h3 style={{ margin: 0 }}><LogIn size={18} style={{ verticalAlign: -3 }} /> {t('Install & pull dates')}</h3>
        {canEdit && <button className="btn sm" onClick={() => setEditing('new')}><Plus size={17} />{t('Add past install')}</button>}
      </div>
      {s && <div className="small muted" style={{ marginBottom: 6 }}>{plural(s.n, 'Pulled {n} time', 'Pulled {n} times')} · {t('lasted {avg} days on average (longest {max}, shortest {min})', { avg: s.avg, max: s.max, min: s.min })}</div>}
      {!hist.length ? <div className="card"><div className="empty small">{rich('No installs on record yet. Use **Install** or **Add past install**.')}</div></div> : (
        <div className="table-wrap">
          <table className="tbl" data-testid="install-history">
            <thead><tr><th>{hw(e.type, 'Machine', 'Welder')}</th><th>{t('Installed')}</th><th>{t('Pulled')}</th><th className="num">{t('Days')}</th><th>{t('Reason')}</th></tr></thead>
            <tbody>
              {rows.map(({ h, i }) => (
                <tr key={i} className={canEdit ? 'clickable' : ''} onClick={canEdit ? () => setEditing(i) : undefined} title={canEdit ? t('Click to fix dates or reason') : undefined}>
                  <td><b>{h.machine}</b>{h.position && <div className="small muted">{h.position}</div>}</td>
                  <td className="nowrap">{fmtDate(h.installedAt)}</td>
                  <td className="nowrap">{h.removedAt ? fmtDate(h.removedAt) : <span className="pill ok">{t('On now')}</span>}</td>
                  <td className="num"><b>{stintDays(h)}</b></td>
                  <td>{h.reason ? t(h.reason) : <span className="muted">—</span>}{h.note && <div className="small muted">{h.note}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing !== null && <StintDialog e={e} index={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function ReasonPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="row wrap" style={{ gap: 6 }} role="group" aria-label={t('Removal reason')}>
      {REMOVAL_REASONS.map((r) => (
        <button key={r} type="button" className={`btn sm ${value === r ? 'primary' : ''}`} aria-pressed={value === r} onClick={() => onChange(value === r ? '' : r)}>{t(r)}</button>
      ))}
    </div>
  );
}

function StintDialog({ e, index, onClose }: { e: Equipment; index: number | null; onClose: () => void }) {
  const hosts = useHosts(e.type);
  const orig = index === null ? null : (e.history || [])[index];
  const isOpen = !!orig && !orig.removedAt;
  const [machine, setMachine] = useState(orig?.machine || '');
  const [inDate, setInDate] = useState(orig ? toISO(orig.installedAt) : '');
  const [outDate, setOutDate] = useState(orig?.removedAt ? toISO(orig.removedAt) : '');
  const [reason, setReason] = useState(orig?.reason || '');
  const [note, setNote] = useState(orig?.note || '');
  const [busy, setBusy] = useState(false);

  const write = async (history: Stint[], extra: Partial<Equipment> = {}) => {
    setBusy(true);
    try {
      await saveDoc('equipment', e.id, { history: [...history].sort((a, b) => a.installedAt - b.installedAt), ...extra }, `Update history of ${e.tag}`);
      toast(t('History updated')); onClose();
    } catch (err) { toastError(err); } finally { setBusy(false); }
  };
  const save = () => {
    if (!machine.trim()) { toast(hw(e.type, 'Choose the machine', 'Choose the welder'), 'danger'); return; }
    if (!inDate) { toast(t('Enter the install date'), 'danger'); return; }
    if (!isOpen && !outDate) { toast(t('Enter the date it was pulled'), 'danger'); return; }
    const installedAt = fromISO(inDate);
    const removedAt = isOpen ? null : fromISO(outDate);
    if (removedAt && removedAt < installedAt) { toast(t('Pulled date is before the install date'), 'danger'); return; }
    const row: Stint = { machine: machine.trim(), position: orig?.position || '', installedAt, removedAt, reason, note: note.trim() };
    const history = [...(e.history || [])];
    if (index === null) history.push(row); else history[index] = row;
    // the "on now" row drives what the item card shows, so keep both in step
    write(history, isOpen ? { machine: row.machine, installedAt } : {});
  };
  const remove = async () => {
    if (index === null) return;
    if (isOpen) { toast(t("It's on there now — use Remove instead"), 'danger'); return; }
    if (!(await confirmDialog({ title: t('Delete this line from the history?'), body: `${orig!.machine}: ${fmtDate(orig!.installedAt)} → ${fmtDate(orig!.removedAt)}`, confirm: t('Delete line'), danger: true }))) return;
    write((e.history || []).filter((_, i) => i !== index));
  };
  return (
    <Modal title={`${index === null ? t('Add past install') : t('Fix history')} · ${e.tag}`} onClose={onClose}
      footer={<>{index !== null && !isOpen && <button className="btn lg danger-ghost" onClick={remove} disabled={busy} style={{ marginRight: 'auto' }}><Trash2 />{t('Delete line')}</button>}<button className="btn lg" onClick={onClose}>{t('Cancel')}</button><button className="btn primary lg" onClick={save} disabled={busy}>{busy ? t('Saving…') : t('Save')}</button></>}>
      <form className="stack" onSubmit={(ev) => { ev.preventDefault(); save(); }}>
        <Field label={hw(e.type, 'Machine', 'Welder')} required><Combobox value={machine} onChange={setMachine} options={hosts} placeholder={hw(e.type, 'e.g. Bag Machine 2', 'e.g. Welder 1')} autoFocus={index === null} /></Field>
        <div className="grid-form">
          <Field label="Installed on" required><input className="input" type="date" value={inDate} max={todayISO()} onChange={(ev) => setInDate(ev.target.value)} /></Field>
          {isOpen ? <Field label="Pulled on" hint="Still on — use Remove to pull it"><input className="input" value={t('On now')} disabled /></Field>
            : <Field label="Pulled on" required><input className="input" type="date" value={outDate} max={todayISO()} min={inDate || undefined} onChange={(ev) => setOutDate(ev.target.value)} /></Field>}
        </div>
        {!isOpen && <Field label="Why was it pulled? (optional)"><ReasonPicker value={reason} onChange={setReason} /></Field>}
        <Field label="Note (optional)"><input className="input" value={note} onChange={(ev) => setNote(ev.target.value)} /></Field>
      </form>
    </Modal>
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
    <Drawer onClose={onClose} head={<div className="row"><span className={`pill ${STATUS_CLS[e.status]}`}>{statusLabel(e)}</span></div>}>
      <div className="stack">
        <div>
          <div className="muted" style={{ fontWeight: 700 }}>{t(EQUIPMENT_LABEL[e.type].one)}</div>
          <h2 className="mono" style={{ fontSize: '1.8rem' }}>{e.tag}</h2>
          <div style={{ fontSize: '1.1rem' }}>{describe(e)}</div>
        </div>
        {e.status === 'installed' && (
          <div className="card card-pad">
            <div className="muted">{hw(e.type, 'On machine:', 'On welder:')} <b style={{ color: 'var(--text)' }}>{e.machine}</b>{e.position ? ` · ${e.position}` : ''} · {t('since {date}', { date: fmtDate(e.installedAt) })}</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: 4 }}>{fmtDuration(pm.days)}</div>
            {e.lastServiceAt && <div className="small muted" style={{ marginTop: 6 }}>{t('Last serviced {date}', { date: fmtDate(e.lastServiceAt) })}</div>}
          </div>
        )}
        {canEdit && (
          <div className="btn-group">
            {e.status === 'installed' ? <>
              <button className="btn lg" onClick={() => onAction('move')}><ArrowRightLeft />{t('Move')}</button>
              <button className="btn lg" onClick={() => onAction('remove')}><LogOut />{t('Remove')}</button>
            </> : e.status !== 'retired' && <button className="btn primary lg" onClick={() => onAction('install')}><LogIn />{hw(e.type, 'Install on machine', 'Install on welder')}</button>}
            {e.status === 'repair' && <button className="btn lg" onClick={() => onAction('spare')}><CheckCircle2 />{t('Back from repair')}</button>}
            <button className="btn lg" onClick={onEdit}><Pencil />{t('Edit')}</button>
            <a className="btn lg" href={`#/labels?eq=${e.id}`}><Tag />{t('Label')}</a>
            {e.status !== 'retired' && <button className="btn lg" onClick={() => onAction('retire')}><Archive />{t('Retire')}</button>}
            <button className="btn lg danger-ghost" onClick={remove}><Trash2 />{t('Delete')}</button>
          </div>
        )}
        <div className="card card-pad">
          <dl className="kv" style={{ margin: 0 }}>
            {e.type === 'knife' ? <>
              <dt>{t('Tip type')}</dt><dd>{e.tipType === 'wide' ? t('Wide tip') : e.tipType === 'thin' ? t('Thin tip') : '—'}</dd>
              <dt>{t('Bag type')}</dt><dd>{e.bagSize ? BAG[e.bagSize] : '—'}{e.bagInches ? ` · ${e.bagInches}"` : ''}</dd>
            </> : e.type === 'roller' ? <>
              <dt>{t('Construction')}</dt><dd>{e.construction ? t(e.construction === 'solid' ? 'Solid' : 'Segmented') : '—'}</dd>
              <dt>{t('Roller type')}</dt><dd>{e.rollerType ? t(`${e.rollerType[0].toUpperCase()}${e.rollerType.slice(1)} roller`) : '—'}</dd>
              <dt>{t('Outer diameter')}</dt><dd>{e.diameter ? `${e.diameter}"` : '—'}</dd>
              <dt>{t('Roller length')}</dt><dd>{e.length ? `${e.length}"` : '—'}</dd>
            </> : <>
              <dt>{t('Part #')}</dt><dd>{e.partNumber || '—'}</dd>
            </>}
          </dl>
          {e.notes && <><hr className="divider" /><div style={{ whiteSpace: 'pre-wrap' }}>{e.notes}</div></>}
        </div>
        <InstallHistory e={e} />
        <div>
          <h3 style={{ marginBottom: '0.6rem' }}><History size={18} style={{ verticalAlign: -3 }} /> {t('Activity')}</h3>
          <div className="card">
            {!hist ? <div className="card-pad center"><Spinner /></div> : hist.length === 0 ? <div className="empty small">{t('No activity yet.')}</div> : (
              <div className="list">{hist.map((h) => <div key={h.id} className="list-item"><div className="grow"><div>{h.summary}</div><div className="small muted">{fmtDateTime(h.at)} · {h.userName}</div></div></div>)}</div>
            )}
          </div>
        </div>
      </div>
    </Drawer>
  );
}

function ActionDialog({ e, kind, onClose }: { e: Equipment; kind: ActionKind; onClose: () => void }) {
  const all = useStore((s) => s.docs.equipment);
  const machines = useHosts(e.type);
  const [machine, setMachine] = useState(kind === 'move' ? '' : e.machine || '');
  const [position, setPosition] = useState(e.position || '');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [to, setTo] = useState<'spare' | 'repair'>('spare');
  const [busy, setBusy] = useState(false);
  const one = oneName(e.type);
  const needsMachine = kind === 'install' || kind === 'move';
  const asksReason = kind === 'remove' || kind === 'retire' || kind === 'move';
  const occupying = needsMachine && machine ? Object.values(all).filter((x) => x.id !== e.id && x.type === e.type && x.status === 'installed' && x.machine === machine && (!position || !x.position || x.position === position)) : [];
  const titles: Record<ActionKind, string> = { install: t('Install {tag}', { tag: e.tag }), move: t('Move {tag}', { tag: e.tag }), remove: t('Remove {tag}', { tag: e.tag }), service: t('Log service for {tag}', { tag: e.tag }), retire: t('Retire {tag}', { tag: e.tag }), spare: t('{tag} back from repair', { tag: e.tag }) };
  const done: Record<ActionKind, string> = { install: t('Installed {tag}', { tag: e.tag }), move: t('Moved {tag}', { tag: e.tag }), remove: t('Removed {tag}', { tag: e.tag }), service: t('Logged service for {tag}', { tag: e.tag }), retire: t('Retired {tag}', { tag: e.tag }), spare: t('{tag} back from repair', { tag: e.tag }) };
  const onFor = e.status === 'installed' && e.installedAt ? Math.max(0, Math.round((Date.now() - e.installedAt) / DAY_MS)) : null;

  const submit = async () => {
    if (needsMachine && !machine.trim()) { toast(hw(e.type, 'Choose the machine', 'Choose the welder'), 'danger'); return; }
    setBusy(true);
    try {
      const at = new Date(date + 'T' + new Date().toTimeString().slice(0, 8)).getTime();
      const res = await api<Equipment>(`/equipment/${e.id}/action`, { body: { action: kind, machine, position: e.type === 'roller' ? position : '', note, reason, to, at: date === todayISO() ? Date.now() : at } });
      applyUpsert('equipment', res);
      toast(done[kind]);
      onClose();
    } catch (err) { toastError(err); } finally { setBusy(false); }
  };
  return (
    <Modal title={titles[kind]} onClose={onClose} footer={<><button className="btn lg" onClick={onClose}>{t('Cancel')}</button><button className={`btn lg ${kind === 'retire' ? 'danger' : 'primary'}`} onClick={submit} disabled={busy}>{busy ? t('Saving…') : t('Confirm')}</button></>}>
      <form className="stack" onSubmit={(ev) => { ev.preventDefault(); submit(); }}>
        <div className="muted">{describe(e)}{e.machine ? ` · ${t('currently on {where}', { where: e.machine })}` : ''}{onFor !== null && (kind === 'remove' || kind === 'retire' || kind === 'move') ? ` · ${t('lasted {d}', { d: days(onFor) })}` : ''}</div>
        {needsMachine && <>
          <Field label={hw(e.type, 'Machine', 'Welder')} required><Combobox value={machine} onChange={setMachine} options={machines} placeholder={hw(e.type, 'e.g. Bag Machine 2', 'e.g. Welder 1')} autoFocus /></Field>
          {e.type === 'roller' && <Field label="Position (optional)" hint="Front / rear, upper / lower, station #…"><input className="input" value={position} onChange={(ev) => setPosition(ev.target.value)} /></Field>}
          {occupying.length > 0 && (isWeld(e.type)
            ? <div className="banner warn">{t('{welder} has {what} {tag} on it now. Each welder holds one {what} — {tag} will be taken off and go back to spares.', { welder: machine, what: one, tag: occupying[0].tag })}</div>
            : <div className="banner warn">{t('Already on {where}: {list}. Remove it first if this one replaces it.', { where: machine, list: occupying.map((x) => `${x.tag}${x.position ? ` (${x.position})` : ''}`).join(', ') })}</div>)}
          {kind === 'install' && isWeld(e.type) && occupying.length > 0 && <Field label={t('Why is {tag} coming off? (optional)', { tag: occupying[0].tag })}><ReasonPicker value={reason} onChange={setReason} /></Field>}
        </>}
        {kind === 'remove' && (
          <Field label="Where is it going?">
            <Seg value={to} onChange={setTo} options={[{ id: 'spare', label: 'Back to spares' }, { id: 'repair', label: 'Repair / rebuild' }]} />
          </Field>
        )}
        {asksReason && e.status === 'installed' && <Field label="Why was it pulled? (optional)"><ReasonPicker value={reason} onChange={setReason} /></Field>}
        {kind !== 'retire' && kind !== 'spare' && <Field label="Date"><input className="input" type="date" value={date} max={todayISO()} onChange={(ev) => setDate(ev.target.value)} /></Field>}
        <Field label="Note (optional)"><input className="input" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder={kind === 'remove' ? t('e.g. tip worn, uneven seal') : kind === 'service' ? t('e.g. cleaned & re-tensioned') : ''} /></Field>
      </form>
    </Modal>
  );
}

function EquipmentForm({ type, item, onClose }: { type: EquipmentType; item?: Equipment; onClose: () => void }) {
  const all = useStore((s) => s.docs.equipment);
  const machines = useHosts(type);
  const one = oneName(type);
  const [d, setD] = useState<Partial<Equipment>>(() => item ? { ...item } : { type, status: 'spare', ...(type === 'knife' ? { tipType: 'thin', bagSize: 'medium' } : type === 'roller' ? { construction: 'solid', rollerType: 'nip' } : {}) });
  const [installDate, setInstallDate] = useState(item?.installedAt ? toISO(item.installedAt) : todayISO());
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Equipment>(k: K, v: Equipment[K] | null | undefined) => setD((x) => ({ ...x, [k]: v ?? undefined }));
  const dupTag = d.tag && Object.values(all).some((x) => x.id !== item?.id && x.type === type && x.tag.toLowerCase() === d.tag!.trim().toLowerCase());
  const weldOccupant = isWeld(type) && d.status === 'installed' && d.machine && !(item?.status === 'installed' && item.machine === d.machine)
    ? Object.values(all).find((x) => x.id !== item?.id && x.type === type && x.status === 'installed' && x.machine === d.machine) : undefined;

  const save = async () => {
    if (!d.tag?.trim()) { toast(t('Enter a tag / ID'), 'danger'); return; }
    if (d.status === 'installed' && !d.machine) { toast(hw(type, 'Choose the machine', 'Choose the welder'), 'danger'); return; }
    setBusy(true);
    try {
      const patch: Partial<Equipment> = { ...d, type, pmDays: undefined, ...(type !== 'roller' ? { position: '' } : {}) };
      if (d.status === 'installed') patch.installedAt = fromISO(installDate);
      else { patch.machine = ''; patch.position = ''; patch.installedAt = null; }
      await saveDoc('equipment', item?.id || newId(), patch, `Save ${d.tag}`);
      toast(item ? t('Saved') : t('Added “{name}”', { name: d.tag }));
      onClose();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };

  return (
    <Modal title={item ? t('Edit {tag}', { tag: item.tag }) : t('Add {what}', { what: one })} onClose={onClose} size="wide"
      footer={<><button className="btn lg" onClick={onClose}>{t('Cancel')}</button><button className="btn primary lg" onClick={save} disabled={busy}>{busy ? t('Saving…') : t('Save')}</button></>}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="grid-form">
          <Field label="Tag / ID number" required hint="What's stamped or written on it"><input className="input mono" value={d.tag || ''} onChange={(e) => set('tag', e.target.value)} autoFocus placeholder={t('e.g. {x}', { x: type === 'knife' ? 'HK-114' : type === 'roller' ? 'RL-207' : type === 'horn' ? 'H-12' : 'A-07' })} /></Field>
          {type === 'knife' ? <>
            <Field label="Tip type"><Seg value={d.tipType || 'thin'} onChange={(v) => set('tipType', v)} options={[{ id: 'thin', label: 'Thin tip' }, { id: 'wide', label: 'Wide tip' }]} /></Field>
            <Field label="Bag type it's meant for">
              <select className="input" value={d.bagSize || ''} onChange={(e) => set('bagSize', (e.target.value || undefined) as Equipment['bagSize'])}>
                <option value="">—</option><option value="small">{t('Small')}</option><option value="medium">{t('Medium')}</option><option value="large">{t('Large')}</option><option value="custom">{t('Custom (inches)')}</option>
              </select>
            </Field>
            <Field label="Bag size in inches (optional)"><NumberInput value={d.bagInches} onChange={(v) => set('bagInches', v)} placeholder={t('e.g. {x}', { x: '14.5' })} /></Field>
          </> : type === 'roller' ? <>
            <Field label="Construction"><Seg value={d.construction || 'solid'} onChange={(v) => set('construction', v)} options={[{ id: 'solid', label: 'Solid' }, { id: 'segmented', label: 'Segmented' }]} /></Field>
            <Field label="Roller type">
              <select className="input" value={d.rollerType || ''} onChange={(e) => set('rollerType', (e.target.value || undefined) as Equipment['rollerType'])}>
                <option value="nip">{t('Nip roller')}</option><option value="draw">{t('Draw roller')}</option><option value="idler">{t('Idler roller')}</option><option value="other">{t('Other roller')}</option>
              </select>
            </Field>
            <Field label="Outer diameter (in, optional)"><NumberInput value={d.diameter} onChange={(v) => set('diameter', v)} min={0} placeholder={t('e.g. {x}', { x: '4.5' })} /></Field>
            <Field label="Roller length (in)"><NumberInput value={d.length} onChange={(v) => set('length', v)} min={0} placeholder={t('e.g. {x}', { x: '36' })} /></Field>
          </> : <>
            <Field label="Part # (optional)"><input className="input mono" value={d.partNumber || ''} onChange={(e) => set('partNumber', e.target.value)} placeholder={t('Manufacturer part number')} /></Field>
          </>}
        </div>
        {dupTag && <div className="banner warn" style={{ marginTop: '1rem' }}>{t('Another one already uses this tag.')}</div>}
        {weldOccupant && <div className="banner warn" style={{ marginTop: '1rem' }}>{t('{welder} has {what} {tag} on it now. Each welder holds one {what} — {tag} will be taken off and go back to spares.', { welder: d.machine, what: one, tag: weldOccupant.tag })}</div>}
        <div className="form-section">
          <h3>{t('Where is it now?')}</h3>
          <Seg value={d.status || 'spare'} onChange={(v) => set('status', v)} options={[{ id: 'installed', label: hw(type, 'On a machine', 'On a welder') }, { id: 'spare', label: 'Spare' }, { id: 'repair', label: 'In repair' }, { id: 'retired', label: 'Retired' }]} />
          {d.status === 'installed' && (
            <div className="grid-form" style={{ marginTop: '1rem' }}>
              <Field label={hw(type, 'Machine', 'Welder')} required><Combobox value={d.machine || ''} onChange={(v) => set('machine', v)} options={machines} placeholder={hw(type, 'e.g. Bag Machine 1', 'e.g. Welder 1')} /></Field>
              {type === 'roller' && <Field label="Position"><input className="input" value={d.position || ''} onChange={(e) => set('position', e.target.value)} placeholder={t('Front / rear / station')} /></Field>}
              <Field label="Installed on" hint={hw(type, 'Used to count days on machine', 'Used to count days on welder')}><input className="input" type="date" value={installDate} max={todayISO()} onChange={(e) => setInstallDate(e.target.value)} /></Field>
            </div>
          )}
        </div>
        <div className="form-section">
          <Field label="Notes"><textarea className="input" value={d.notes || ''} onChange={(e) => set('notes', e.target.value)} placeholder={t(isWeld(type) ? 'Supplier, frequency, re-machining…' : 'Temperature setpoint, wear notes, vendor, rebuild count…')} /></Field>
        </div>
      </form>
    </Modal>
  );
}
