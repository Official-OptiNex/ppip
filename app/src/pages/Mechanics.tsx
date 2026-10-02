// Admin → Mechanics: the people who do PMs, and which shift they're on.
import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Save, HardHat, Phone } from 'lucide-react';
import type { Mechanic } from '../../../shared/types';
import { deleteDoc, newId, saveDoc, toast, toastError, useStore } from '../lib/store';
import { uniqueSorted } from '../lib/util';
import { Empty, Field, Modal, TagInput, confirmDialog, rich } from '../components/ui';
import { t } from '../lib/i18n';

export function useShifts() {
  const shifts = useStore((s) => s.settings.shifts);
  return shifts?.length ? shifts : ['1st shift (days)', '2nd shift (afternoons)', '3rd shift (nights)', 'Weekend'];
}

export function MechanicsTab() {
  const mechanics = useStore((s) => s.docs.mechanics);
  const pms = useStore((s) => s.docs.pms);
  const shifts = useShifts();
  const [edit, setEdit] = useState<Partial<Mechanic> | null>(null);
  const [shiftFilter, setShiftFilter] = useState('');
  const [editShifts, setEditShifts] = useState(false);

  const list = useMemo(() => Object.values(mechanics)
    .filter((m) => !shiftFilter || (m.shift || '') === shiftFilter)
    .sort((a, b) => Number(!!a.inactive) - Number(!!b.inactive) || shifts.indexOf(a.shift || '') - shifts.indexOf(b.shift || '') || a.name.localeCompare(b.name)), [mechanics, shiftFilter, shifts]);
  const pmCount = (name: string) => Object.values(pms).filter((l) => l.doneBy === name).length;
  const perShift = (sh: string) => Object.values(mechanics).filter((m) => !m.inactive && m.shift === sh).length;

  const remove = async (m: Mechanic) => {
    if (!(await confirmDialog({ title: t('Delete {name}?', { name: m.name }), body: t('{n} PM entries keep their name. To keep them in the list for history, mark them “No longer here” instead.', { n: pmCount(m.name) }), confirm: t('Delete'), danger: true }))) return;
    try { await deleteDoc('mechanics', m.id); toast(t('Mechanic deleted')); } catch (e) { toastError(e); }
  };

  return (
    <div className="stack">
      <div className="row wrap" style={{ justifyContent: 'space-between' }}>
        <p className="muted" style={{ margin: 0, maxWidth: 640 }}>{rich('Everyone who does PMs. They appear in the **“Who did it”** list when logging a PM, with their shift.')}</p>
        <button className="btn primary lg" onClick={() => setEdit({ shift: shifts[0] })}><Plus />{t('Add mechanic')}</button>
      </div>

      <div className="chips">
        <button className={`filter-chip ${!shiftFilter ? 'on' : ''}`} onClick={() => setShiftFilter('')}>{t('All shifts')}<span className="n">{Object.values(mechanics).filter((m) => !m.inactive).length}</span></button>
        {shifts.map((sh) => <button key={sh} className={`filter-chip ${shiftFilter === sh ? 'on' : ''}`} onClick={() => setShiftFilter(sh)}>{t(sh)}<span className="n">{perShift(sh)}</span></button>)}
        <button className="btn sm ghost" onClick={() => setEditShifts(true)}><Pencil size={15} />{t('Edit shift names')}</button>
      </div>

      {list.length === 0 ? <div className="card"><Empty icon={<HardHat size={48} />} title={Object.keys(mechanics).length ? 'Nobody on this shift' : 'No mechanics yet'}>{t('Add the people who do PMs.')}</Empty></div> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>{t('Name')}</th><th>{t('Shift')}</th><th>{t('Phone')}</th><th className="num">{t('PMs done')}</th><th /></tr></thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id} className={m.inactive ? 'st-retired' : ''}>
                  <td><b>{m.name}</b>{m.inactive && <span className="pill neutral" style={{ marginLeft: 8 }}>{t('No longer here')}</span>}{m.notes && <div className="small muted">{m.notes}</div>}</td>
                  <td>{m.shift ? t(m.shift) : <span className="muted">—</span>}</td>
                  <td>{m.phone ? <a href={`tel:${m.phone}`}><Phone size={14} /> {m.phone}</a> : <span className="muted">—</span>}</td>
                  <td className="num">{pmCount(m.name)}</td>
                  <td><div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                    <button className="btn sm" onClick={() => setEdit(m)}><Pencil size={16} />{t('Edit')}</button>
                    <button className="btn sm icon ghost" onClick={() => remove(m)} aria-label={`${t('Delete')} ${m.name}`}><Trash2 size={17} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <MechanicForm item={edit} onClose={() => setEdit(null)} />}
      {editShifts && <ShiftNames onClose={() => setEditShifts(false)} />}
    </div>
  );
}

function MechanicForm({ item, onClose }: { item: Partial<Mechanic>; onClose: () => void }) {
  const [d, setD] = useState<Partial<Mechanic>>({ ...item });
  const [busy, setBusy] = useState(false);
  const shifts = useShifts();
  const all = useStore((s) => s.docs.mechanics);
  const dup = d.name && Object.values(all).some((m) => m.id !== d.id && m.name.toLowerCase() === d.name!.trim().toLowerCase());
  const save = async () => {
    if (!d.name?.trim()) { toast(t('Enter a name'), 'danger'); return; }
    if (dup) { toast(t('That name is already on the list'), 'danger'); return; }
    setBusy(true);
    try { await saveDoc('mechanics', d.id || newId(), { ...d, name: d.name.trim() }); toast(d.id ? t('Saved') : t('Added “{name}”', { name: d.name })); onClose(); } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  return (
    <Modal title={d.id ? t('Edit {tag}', { tag: item.name }) : t('Add mechanic')} icon={<HardHat color="var(--primary)" />} onClose={onClose}
      footer={<><button className="btn lg" onClick={onClose}>{t('Cancel')}</button><button className="btn primary lg" onClick={save} disabled={busy}><Save />{t('Save')}</button></>}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Name" required hint="Shown in the “Who did it” list on PMs"><input className="input" value={d.name || ''} onChange={(e) => setD({ ...d, name: e.target.value })} autoFocus /></Field>
        {dup && <div className="banner warn">{t('Someone with this name is already on the list.')}</div>}
        <Field label="Shift">
          <div className="seg" style={{ display: 'flex', flexWrap: 'wrap' }}>
            {shifts.map((sh) => <button type="button" key={sh} className={d.shift === sh ? 'on' : ''} onClick={() => setD({ ...d, shift: sh })}>{t(sh)}</button>)}
          </div>
        </Field>
        <Field label="Phone (optional)"><input className="input" value={d.phone || ''} onChange={(e) => setD({ ...d, phone: e.target.value })} inputMode="tel" /></Field>
        <Field label="Notes (optional)"><input className="input" value={d.notes || ''} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder={t('e.g. lead mechanic, electrical')} /></Field>
        {d.id && <label className="check"><input type="checkbox" checked={!!d.inactive} onChange={(e) => setD({ ...d, inactive: e.target.checked })} />{t('No longer here (hide from the list, keep their PM history)')}</label>}
      </form>
    </Modal>
  );
}

function ShiftNames({ onClose }: { onClose: () => void }) {
  const shifts = useShifts();
  const mechanics = useStore((s) => s.docs.mechanics);
  const [list, setList] = useState(shifts);
  const [busy, setBusy] = useState(false);
  const inUse = uniqueSorted(Object.values(mechanics).map((m) => m.shift)).filter((s) => !list.includes(s));
  const save = async () => {
    if (!list.length) { toast(t('Keep at least one shift'), 'danger'); return; }
    setBusy(true);
    try { await saveDoc('settings', 'app', { shifts: list }); toast(t('Shift names saved')); onClose(); } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  return (
    <Modal title="Shift names" onClose={onClose} footer={<><button className="btn lg" onClick={onClose}>{t('Cancel')}</button><button className="btn primary lg" onClick={save} disabled={busy}><Save />{t('Save')}</button></>}>
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>{t('Type a shift name and press Enter to add it. Click × to remove one.')}</p>
        <TagInput values={list} onChange={setList} options={[]} placeholder={t('e.g. A shift, B shift, Days, Nights…')} />
        {inUse.length > 0 && <div className="banner warn">{t("Still assigned to someone: {list}. Change those mechanics' shift too.", { list: inUse.join(', ') })}</div>}
      </div>
    </Modal>
  );
}
