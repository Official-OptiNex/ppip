// Shift handover notes: what the next shift needs to know. Tick "Needs follow-up" for anything still to do.
import { useEffect, useMemo, useRef, useState } from 'react';
import { NotebookPen, Send, CheckCircle2, RotateCcw, Pencil, Trash2, Flag } from 'lucide-react';
import type { ShiftNote } from '../../../shared/types';
import { deleteDoc, newId, saveDoc, toast, toastError, useCanEdit, useStore } from '../lib/store';
import { fmtDateTime, matches, setQuery, timeAgo } from '../lib/util';
import { safeGet, safeSet } from '../lib/api';
import { UserAvatar, Person, Combobox, Empty, Field, Modal, SearchInput, Seg, confirmDialog } from '../components/ui';
import { t } from '../lib/i18n';
import { startOfToday, useMachineNames } from './Downtime';
import { PhotoAttach, PhotoThumb } from '../components/PhotoAttach';

type Show = 'all' | 'open' | 'today';
const SHIFT_KEY = 'ppip.notes.shift';

export function NotesPage({ query }: { query: URLSearchParams }) {
  const all = useStore((s) => s.docs.notes);
  const canEdit = useCanEdit();
  const [q, setQ] = useState(() => query.get('q') || '');
  useEffect(() => { const v = query.get('q'); if (v != null) { setQ(v); setQuery({ q: null }); } }, [query]); // from the top search box
  const [editing, setEditing] = useState<ShiftNote | null>(null);
  const show = (['all', 'open', 'today'].includes(query.get('show') || '') ? query.get('show') : 'all') as Show;

  const items = useMemo(() => Object.values(all).sort((a, b) => (b.createdAt || b.updatedAt || 0) - (a.createdAt || a.updatedAt || 0)), [all]);
  const openCount = items.filter((n) => n.followUp && !n.done).length;
  const today = startOfToday();
  const filtered = items.filter((n) =>
    (show !== 'open' || (n.followUp && !n.done)) && (show !== 'today' || (n.createdAt || n.updatedAt || 0) >= today)
    && matches(q, n.text, n.machine, n.shift, n.author));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t('Shift Notes')}</h1>
          <div className="sub">{t('Leave a note for the next shift. Tick “Needs follow-up” for anything that still has to be done.')}</div>
        </div>
      </div>

      {canEdit && <NoteComposer />}

      <div className="row wrap" style={{ margin: '1rem 0' }}>
        <Seg value={show} onChange={(v) => setQuery({ show: v === 'all' ? null : v })} options={[
          { id: 'all', label: t('All notes') },
          { id: 'open', label: `${t('Needs follow-up')} (${openCount})` },
          { id: 'today', label: t('Today') },
        ]} />
        <SearchInput value={q} onChange={setQ} placeholder="Search notes…" />
      </div>

      {filtered.length === 0 ? (
        <div className="card"><Empty icon={<NotebookPen size={48} />} title={items.length ? (show === 'open' ? 'Nothing waiting for follow-up' : 'No notes match') : 'No shift notes yet'}>
          {!items.length && canEdit && t('Write the first one in the box above.')}
        </Empty></div>
      ) : (
        <div className="stack" data-testid="notes-list">
          {filtered.map((n) => <NoteCard key={n.id} n={n} canEdit={canEdit} onEdit={() => setEditing(n)} />)}
        </div>
      )}
      {editing && <NoteEdit note={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function NoteComposer() {
  const machines = useMachineNames();
  const shifts = useStore((s) => s.settings.shifts) || [];
  const [text, setText] = useState('');
  const [machine, setMachine] = useState('');
  const [shift, setShift] = useState(() => safeGet(SHIFT_KEY) || '');
  const [followUp, setFollowUp] = useState(false);
  const [photo, setPhoto] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const me = useStore((s) => s.me);

  const post = async () => {
    if (!text.trim()) { toast(t('Write the note.'), 'danger'); ref.current?.focus(); return; }
    setBusy(true);
    try {
      await saveDoc('notes', newId(), { text: text.trim(), machine: machine.trim(), shift, followUp, author: me?.name, imageId: photo }, 'Post note');
      if (shift) safeSet(SHIFT_KEY, shift);
      setText(''); setMachine(''); setFollowUp(false); setPhoto('');
      toast(t('Note posted'));
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };

  return (
    <form className="card card-pad stack" onSubmit={(e) => { e.preventDefault(); post(); }} data-tour="notes-add">
      <Field label="New note">
        <textarea ref={ref} className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} style={{ fontSize: '1.15rem' }}
          placeholder={t('e.g. Bag Machine 2 knife is running hot, keep an eye on it.')}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) post(); }} />
      </Field>
      <div className="grid-form">
        <Field label="Machine (optional)"><Combobox value={machine} onChange={setMachine} options={machines} placeholder={t('e.g. Bag Machine 2')} /></Field>
        {shifts.length > 0 && <Field label="Shift (optional)">
          <select className="input" value={shift} onChange={(e) => setShift(e.target.value)}>
            <option value="">—</option>{shifts.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>}
      </div>
      <div className="row wrap" style={{ justifyContent: 'space-between' }}>
        <div className="row wrap" style={{ gap: '1rem' }}>
          <label className="check"><input type="checkbox" checked={followUp} onChange={(e) => setFollowUp(e.target.checked)} /><Flag size={18} />{t('Needs follow-up')}</label>
          <PhotoAttach value={photo} onChange={setPhoto} label={t('Shift note')} />
        </div>
        <button className="btn primary lg" type="submit" disabled={busy}><Send />{busy ? t('Saving…') : t('Post note')}</button>
      </div>
    </form>
  );
}

function NoteCard({ n, canEdit, onEdit }: { n: ShiftNote; canEdit: boolean; onEdit: () => void }) {
  const open = n.followUp && !n.done;
  const toggle = async () => {
    try { await saveDoc('notes', n.id, { ...n, done: !n.done }, n.done ? 'Reopen note' : 'Mark note done'); toast(n.done ? t('Reopened') : t('Marked done')); }
    catch (e) { toastError(e); }
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: t('Delete this note?'), body: n.text.slice(0, 120), confirm: t('Delete'), danger: true }))) return;
    try { await deleteDoc('notes', n.id); toast(t('Deleted')); } catch (e) { toastError(e); }
  };
  return (
    <div className={`card card-pad note-card ${open ? 'note-open' : ''}`} data-testid="note">
      <div className="row" style={{ gap: '0.7rem', alignItems: 'flex-start' }}>
        <UserAvatar name={n.author} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row wrap" style={{ gap: '0.4rem' }}>
            <b>{n.author || t('Someone')}</b>
            <span className="muted small" title={fmtDateTime(n.createdAt)}>{timeAgo(n.createdAt || n.updatedAt)}</span>
            {n.machine && <span className="pill neutral">{n.machine}</span>}
            {n.shift && <span className="pill info">{n.shift}</span>}
            {open && <span className="pill warn"><Flag size={14} />{t('Needs follow-up')}</span>}
            {n.followUp && n.done && <span className="pill ok"><CheckCircle2 size={14} />{t('Done')}{n.doneBy && <> · <Person name={n.doneBy} size={18} /></>}</span>}
          </div>
          <div className="note-text">{n.text}</div>
          {n.imageId && <div style={{ marginTop: '0.5rem' }}><PhotoThumb id={n.imageId} size={110} /></div>}
        </div>
      </div>
      {canEdit && (
        <div className="row wrap" style={{ justifyContent: 'flex-end', gap: 6, marginTop: '0.6rem' }}>
          {n.followUp && (n.done
            ? <button className="btn sm" onClick={toggle}><RotateCcw size={16} />{t('Reopen')}</button>
            : <button className="btn sm ok" onClick={toggle}><CheckCircle2 size={16} />{t('Mark done')}</button>)}
          <button className="btn sm icon" onClick={onEdit} aria-label={t('Edit')} title={t('Edit')}><Pencil size={17} /></button>
          <button className="btn sm icon danger-ghost" onClick={remove} aria-label={t('Delete')} title={t('Delete')}><Trash2 size={17} /></button>
        </div>
      )}
    </div>
  );
}

function NoteEdit({ note, onClose }: { note: ShiftNote; onClose: () => void }) {
  const machines = useMachineNames();
  const shifts = useStore((s) => s.settings.shifts) || [];
  const [d, setD] = useState(note);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!d.text.trim()) { toast(t('Write the note.'), 'danger'); return; }
    setBusy(true);
    try { await saveDoc('notes', note.id, { ...d, text: d.text.trim(), machine: (d.machine || '').trim() }, 'Edit note'); toast(t('Saved')); onClose(); }
    catch (e) { toastError(e); } finally { setBusy(false); }
  };
  return (
    <Modal title="Edit note" icon={<NotebookPen />} onClose={onClose}
      footer={<><button className="btn lg" onClick={onClose}>{t('Cancel')}</button><button className="btn primary lg" onClick={save} disabled={busy}>{busy ? t('Saving…') : t('Save')}</button></>}>
      <div className="stack">
        <Field label="Note"><textarea className="input" rows={4} value={d.text} onChange={(e) => setD({ ...d, text: e.target.value })} autoFocus style={{ fontSize: '1.15rem' }} /></Field>
        <div className="grid-form">
          <Field label="Machine (optional)"><Combobox value={d.machine || ''} onChange={(v) => setD({ ...d, machine: v })} options={machines} /></Field>
          {shifts.length > 0 && <Field label="Shift (optional)">
            <select className="input" value={d.shift || ''} onChange={(e) => setD({ ...d, shift: e.target.value })}>
              <option value="">—</option>{[...new Set([...shifts, ...(d.shift ? [d.shift] : [])])].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>}
        </div>
        <div className="row wrap" style={{ gap: '1rem' }}>
          <label className="check"><input type="checkbox" checked={!!d.followUp} onChange={(e) => setD({ ...d, followUp: e.target.checked, done: e.target.checked ? d.done : false })} /><Flag size={18} />{t('Needs follow-up')}</label>
          <PhotoAttach value={d.imageId} onChange={(id) => setD({ ...d, imageId: id })} label={t('Shift note')} />
        </div>
      </div>
    </Modal>
  );
}
