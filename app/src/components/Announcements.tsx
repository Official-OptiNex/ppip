// Site-wide announcements from admins: a coloured banner on every page (and optionally a pop-up),
// plus the editor under Admin → Announcements.
import { useMemo, useState } from 'react';
import { Megaphone, Info, AlertTriangle, Siren, PartyPopper, X, Plus, Pencil, Trash2, Pause, Play, Copy, Eye, Square } from 'lucide-react';
import { announcementLive, type Announcement } from '../../../shared/types';
import { deleteDoc, newId, saveDoc, toast, toastError, useStore } from '../lib/store';
import { safeGet, safeSet } from '../lib/api';
import { fmtDateTime, useNow } from '../lib/util';
import { getLang, t } from '../lib/i18n';
import { Empty, Field, Modal, confirmDialog, Person } from './ui';
import { fromLocalInput, toLocalInput } from '../pages/Downtime';

type Level = NonNullable<Announcement['level']>;
export const LEVELS: { id: Level; label: string; icon: typeof Info }[] = [
  { id: 'info', label: 'Information', icon: Info },
  { id: 'warn', label: 'Heads-up', icon: AlertTriangle },
  { id: 'urgent', label: 'Urgent', icon: Siren },
  { id: 'good', label: 'Good news', icon: PartyPopper },
];
const levelOf = (a: Pick<Announcement, 'level'>) => LEVELS.find((l) => l.id === a.level) || LEVELS[0];
const ORDER: Record<string, number> = { urgent: 0, warn: 1, info: 2, good: 3 };

/** Title and message in the reader's language (Spanish version when there is one). */
export function annText(a: Pick<Announcement, 'title' | 'body' | 'titleEs' | 'bodyEs'>) {
  const es = getLang() === 'es';
  return { title: (es && a.titleEs) || a.title, body: (es && a.bodyEs) || a.body || '' };
}

const key = (kind: 'hide' | 'seen', userId: string) => `ppip.ann.${kind}.${userId}`;
const readSet = (k: string) => { try { return new Set<string>(JSON.parse(safeGet(k) || '[]')); } catch { return new Set<string>(); } };
const stamp = (a: Announcement) => `${a.id}:${a.updatedAt || 0}`; // an edited announcement shows again

/** Announcements showing right now for me (newest / most urgent first). */
export function useLiveAnnouncements() {
  const all = useStore((s) => s.docs.announcements);
  const role = useStore((s) => s.me?.role);
  const tick = useNow(30_000); // re-check every 30 s for scheduled start / end times
  // use the real time (not the last tick) so "End now" disappears straight away
  return useMemo(() => Object.values(all).filter((a) => announcementLive(a, role, Date.now()))
    .sort((a, b) => (ORDER[a.level || 'info'] - ORDER[b.level || 'info']) || (b.updatedAt || 0) - (a.updatedAt || 0)), [all, role, tick]);
}

/** Banner(s) under the top bar on every page. */
export function AnnouncementBar() {
  const me = useStore((s) => s.me);
  const live = useLiveAnnouncements();
  const [hidden, setHidden] = useState(() => (me ? readSet(key('hide', me.id)) : new Set<string>()));
  const [all, setAll] = useState(false);
  if (!me) return null;
  const shown = live.filter((a) => !(a.dismissible !== false && hidden.has(stamp(a))));
  if (!shown.length) return null;
  const MAX = 2; // keep the top of the screen tidy: the most urgent two, then "show more"
  const visible = all ? shown : shown.slice(0, MAX);
  const hide = (a: Announcement) => {
    const next = new Set(hidden); next.add(stamp(a)); setHidden(next);
    safeSet(key('hide', me.id), JSON.stringify([...next].slice(-100)));
  };
  return (
    <div className="no-print" data-tour="announcements">
      {visible.map((a) => <AnnouncementBanner key={a.id} a={a} onHide={a.dismissible !== false ? () => hide(a) : undefined} />)}
      {shown.length > MAX && <button className="ann-more" onClick={() => setAll(!all)}>{all ? t('Show fewer messages') : t('Show {n} more messages', { n: shown.length - MAX })}</button>}
    </div>
  );
}

export function AnnouncementBanner({ a, onHide }: { a: Pick<Announcement, 'title' | 'body' | 'titleEs' | 'bodyEs' | 'level'>; onHide?: () => void }) {
  const L = levelOf(a);
  const { title, body } = annText(a);
  return (
    <div className={`ann-bar ann-${L.id}`} role={L.id === 'urgent' ? 'alert' : 'status'}>
      <L.icon size={24} className="ann-icon" aria-hidden />
      <div className="grow" style={{ minWidth: 0 }}>
        <b className="ann-title">{title}</b>
        {body && <div className="ann-body">{body}</div>}
      </div>
      {onHide && <button className="btn sm ghost" onClick={onHide} aria-label={t('Hide')}><X size={16} />{t('Hide')}</button>}
    </div>
  );
}

/** Announcements marked "pop up": shown once per person (and again if edited). */
export function AnnouncementPopup() {
  const me = useStore((s) => s.me);
  const phase = useStore((s) => s.phase);
  const live = useLiveAnnouncements();
  const [seen, setSeen] = useState(() => (me ? readSet(key('seen', me.id)) : new Set<string>()));
  // the language question and the guided tour come first
  const busy = !me?.prefs?.lang || !me?.prefs?.tutorialDone;
  if (!me || phase !== 'ready' || busy) return null;
  // whoever posted or last changed it has already read it
  const a = live.find((x) => x.popup && !seen.has(stamp(x)) && x.updatedBy !== me.name);
  if (!a) return null;
  const L = levelOf(a);
  const { title, body } = annText(a);
  const close = () => { const next = new Set(seen); next.add(stamp(a)); setSeen(next); safeSet(key('seen', me.id), JSON.stringify([...next].slice(-100))); };
  return (
    <Modal title={<span className="row" style={{ gap: 8 }}><Megaphone />{t('Announcement')}</span>} onClose={close}
      footer={<button className="btn primary lg" onClick={close} autoFocus>{t('Got it')}</button>}>
      <div className={`ann-pop ann-${L.id}`}>
        <L.icon size={40} aria-hidden />
        <div>
          <h2 style={{ fontSize: '1.5rem' }}>{title}</h2>
          {body && <p style={{ whiteSpace: 'pre-wrap', fontSize: '1.15rem', margin: '0.5rem 0 0' }}>{body}</p>}
          <div className="small muted" style={{ marginTop: '0.8rem' }}>{a.author && <><Person name={a.author} size={20} /> · </>}{fmtDateTime(a.updatedAt || a.createdAt)}</div>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ Admin → Announcements
const AUDIENCE: { id: NonNullable<Announcement['audience']>; label: string }[] = [
  { id: 'all', label: 'Everyone' }, { id: 'editor', label: 'Editors and admins' }, { id: 'viewer', label: 'Viewers only' }, { id: 'admin', label: 'Admins only' },
];
// one-click starting points (all editable)
const TEMPLATES: { label: string; a: Partial<Announcement> }[] = [
  { label: 'Safety reminder', a: { level: 'warn', title: 'Safety reminder', body: 'Lock out / tag out before working on any machine.' } },
  { label: 'Meeting', a: { level: 'info', title: 'Shift meeting today', body: 'Maintenance meeting at 2:00 PM in the break room.' } },
  { label: 'Machine down', a: { level: 'urgent', title: 'Machine down', body: 'Bag Machine 2 is down until further notice.' } },
  { label: 'Planned shutdown', a: { level: 'warn', title: 'Planned shutdown', body: 'The plant is shut down this weekend for maintenance.' } },
  { label: 'Good job', a: { level: 'good', title: 'Great work, team!', body: 'Zero downtime on all lines this week.' } },
];

function status(a: Announcement, now: number) {
  if (a.active === false) return { label: 'Paused', cls: 'neutral' };
  if (a.startsAt && a.startsAt > now) return { label: 'Scheduled', cls: 'info' };
  if (a.endsAt && a.endsAt <= now) return { label: 'Ended', cls: 'retired' };
  return { label: 'Showing now', cls: 'ok' };
}

export function AnnouncementsAdmin() {
  const all = useStore((s) => s.docs.announcements);
  useNow(30_000); // re-render every 30 s so "Scheduled" / "Ended" stay current
  const now = Date.now();
  const [edit, setEdit] = useState<Partial<Announcement> | null>(null);
  const list = useMemo(() => Object.values(all).sort((a, b) => {
    const r = (x: Announcement) => (status(x, now).label === 'Showing now' ? 0 : status(x, now).label === 'Scheduled' ? 1 : 2);
    return r(a) - r(b) || (b.updatedAt || 0) - (a.updatedAt || 0);
  }), [all, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (a: Announcement, patch: Partial<Announcement>, msg: string) => saveDoc('announcements', a.id, patch).then(() => toast(t(msg))).catch(toastError);
  const remove = async (a: Announcement) => {
    if (!(await confirmDialog({ title: t('Delete this announcement?'), body: a.title, confirm: t('Delete'), danger: true }))) return;
    try { await deleteDoc('announcements', a.id); toast(t('Deleted')); } catch (e) { toastError(e); }
  };
  return (
    <div className="stack">
      <div className="row wrap" style={{ justifyContent: 'space-between' }}>
        <p className="muted" style={{ margin: 0, maxWidth: 640 }}>{t('Post a message that shows at the top of every screen, right away, on every computer. Use it for safety reminders, meetings, machines that are down, or good news.')}</p>
        <button className="btn primary lg" onClick={() => setEdit({ level: 'info', audience: 'all', dismissible: true, active: true })}><Plus />{t('New announcement')}</button>
      </div>
      {list.length === 0 ? <div className="card"><Empty icon={<Megaphone size={48} />} title="No announcements yet">{t('Click “New announcement” to post one.')}</Empty></div> : (
        <div className="stack" style={{ gap: '0.8rem' }}>
          {list.map((a) => {
            const st = status(a, now);
            return (
              <div key={a.id} className="card card-pad stack" style={{ gap: '0.6rem' }} data-testid="ann-row">
                <div className="row wrap" style={{ justifyContent: 'space-between' }}>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <span className={`pill ${st.cls}`}>{t(st.label)}</span>
                    <span className="pill neutral">{t(AUDIENCE.find((x) => x.id === (a.audience || 'all'))!.label)}</span>
                    {a.popup && <span className="pill neutral">{t('Pop-up')}</span>}
                    {a.showOnLogin && <span className="pill neutral">{t('Sign-in screen')}</span>}
                  </div>
                  <span className="small muted">{a.author && <><Person name={a.author} size={20} /> · </>}{fmtDateTime(a.updatedAt)}{a.endsAt ? ` · ${t('until {date}', { date: fmtDateTime(a.endsAt) })}` : ''}{a.startsAt && a.startsAt > now ? ` · ${t('from {date}', { date: fmtDateTime(a.startsAt) })}` : ''}</span>
                </div>
                <AnnouncementBanner a={a} />
                <div className="btn-group">
                  <button className="btn sm" onClick={() => setEdit(a)}><Pencil size={16} />{t('Edit')}</button>
                  {st.label === 'Paused'
                    ? <button className="btn sm" onClick={() => save(a, { active: true }, 'Announcement is showing again')}><Play size={16} />{t('Resume')}</button>
                    : st.label !== 'Ended' && <button className="btn sm" onClick={() => save(a, { active: false }, 'Announcement paused')}><Pause size={16} />{t('Pause')}</button>}
                  {st.label === 'Showing now' && <button className="btn sm" onClick={() => save(a, { endsAt: Date.now() }, 'Announcement ended')}><Square size={16} />{t('End now')}</button>}
                  <button className="btn sm" onClick={() => setEdit({ ...a, id: undefined, createdAt: undefined, updatedAt: undefined, startsAt: null, endsAt: null, active: true })}><Copy size={16} />{t('Post again')}</button>
                  <button className="btn sm icon danger-ghost" onClick={() => remove(a)} aria-label={t('Delete')} title={t('Delete')}><Trash2 size={16} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {edit && <AnnouncementForm item={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function AnnouncementForm({ item, onClose }: { item: Partial<Announcement>; onClose: () => void }) {
  const [d, setD] = useState<Partial<Announcement>>(item);
  const [from, setFrom] = useState(item.startsAt ? toLocalInput(item.startsAt) : '');
  const [until, setUntil] = useState(item.endsAt ? toLocalInput(item.endsAt) : '');
  const [showEs, setShowEs] = useState(!!(item.titleEs || item.bodyEs));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Announcement>(k: K, v: Announcement[K]) => setD((x) => ({ ...x, [k]: v }));
  const endOfToday = () => { const x = new Date(); x.setHours(23, 59, 0, 0); return x.getTime(); };
  const quick: [string, () => number | null][] = [
    ['No end date', () => null], ['End of today', endOfToday], ['1 day', () => Date.now() + 864e5], ['1 week', () => Date.now() + 7 * 864e5],
  ];

  const save = async () => {
    if (!d.title?.trim()) { toast(t('Write the announcement.'), 'danger'); return; }
    const startsAt = from ? fromLocalInput(from) : null;
    const endsAt = until ? fromLocalInput(until) : null;
    if (startsAt && endsAt && endsAt <= startsAt) { toast(t('“Until” must be after “From”.'), 'danger'); return; }
    setBusy(true);
    try {
      await saveDoc('announcements', d.id || newId(), {
        title: d.title.trim(), body: (d.body || '').trim(), titleEs: showEs ? (d.titleEs || '').trim() : '', bodyEs: showEs ? (d.bodyEs || '').trim() : '',
        level: d.level || 'info', audience: d.audience || 'all', popup: !!d.popup, dismissible: d.dismissible !== false, showOnLogin: !!d.showOnLogin && (d.audience || 'all') === 'all',
        active: d.active !== false, startsAt, endsAt,
      }, 'Announcement');
      toast(d.id ? t('Announcement updated') : t('Announcement posted'), 'success', startsAt && startsAt > Date.now() ? t('It will show from {date}.', { date: fmtDateTime(startsAt) }) : t('It is showing on every screen now.'));
      onClose();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };

  return (
    <Modal title={d.id ? 'Edit announcement' : 'New announcement'} icon={<Megaphone color="var(--primary)" />} onClose={onClose} size="wide"
      footer={<><button className="btn lg" onClick={onClose}>{t('Cancel')}</button><button className="btn primary lg" onClick={save} disabled={busy}><Megaphone />{busy ? t('Saving…') : d.id ? t('Save') : t('Post announcement')}</button></>}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {!d.id && (
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="small muted" style={{ fontWeight: 700 }}>{t('Start from:')}</span>
            {TEMPLATES.map((tp) => <button key={tp.label} type="button" className="btn sm" onClick={() => setD((x) => ({ ...x, ...tp.a, title: t(tp.a.title!), body: t(tp.a.body!) }))}>{t(tp.label)}</button>)}
          </div>
        )}
        <Field label="Headline" required><input className="input" value={d.title || ''} onChange={(e) => set('title', e.target.value)} autoFocus placeholder={t('e.g. Shift meeting today at 2 PM')} maxLength={160} style={{ fontSize: '1.15rem' }} /></Field>
        <Field label="Message (optional)"><textarea className="input" rows={3} value={d.body || ''} onChange={(e) => set('body', e.target.value)} placeholder={t('More details…')} /></Field>
        <Field label="Style">
          <div className="row wrap" style={{ gap: 6 }} role="radiogroup" aria-label={t('Style')}>
            {LEVELS.map((l) => (
              <button key={l.id} type="button" role="radio" aria-checked={(d.level || 'info') === l.id} className={`btn ann-choice ann-${l.id} ${(d.level || 'info') === l.id ? 'on' : ''}`} onClick={() => set('level', l.id)}>
                <l.icon size={18} />{t(l.label)}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid-2">
          <Field label="Who sees it">
            <select className="input" value={d.audience || 'all'} onChange={(e) => set('audience', e.target.value as Announcement['audience'])}>
              {AUDIENCE.map((a) => <option key={a.id} value={a.id}>{t(a.label)}</option>)}
            </select>
          </Field>
          <Field label="Show from (optional)" hint="Blank = right away"><input className="input" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        </div>
        <Field label="Show until">
          <div className="stack" style={{ gap: 6 }}>
            <div className="row wrap" style={{ gap: 6 }}>
              {quick.map(([label, fn]) => <button key={label} type="button" className={`btn sm ${(label === 'No end date' && !until) ? 'primary' : ''}`} onClick={() => { const v = fn(); setUntil(v ? toLocalInput(v) : ''); }}>{t(label)}</button>)}
            </div>
            <input className="input" type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} aria-label={t('Show until')} />
          </div>
        </Field>
        <div className="stack" style={{ gap: 4 }}>
          <label className="check"><input type="checkbox" checked={!!d.popup} onChange={(e) => set('popup', e.target.checked)} />{t('Also pop it up on screen once (people click “Got it”)')}</label>
          <label className="check"><input type="checkbox" checked={d.dismissible !== false} onChange={(e) => set('dismissible', e.target.checked)} />{t('People can hide the banner')}</label>
          <label className="check" style={{ opacity: (d.audience || 'all') === 'all' ? 1 : 0.55 }}><input type="checkbox" checked={!!d.showOnLogin && (d.audience || 'all') === 'all'} disabled={(d.audience || 'all') !== 'all'} onChange={(e) => set('showOnLogin', e.target.checked)} />{t('Also show it on the sign-in screen')}{(d.audience || 'all') !== 'all' && <span className="small muted">({t('only for messages to everyone')})</span>}</label>
        </div>
        <div>
          {!showEs ? <button type="button" className="btn sm" onClick={() => setShowEs(true)}><Plus size={16} />{t('Add a Spanish version (optional)')}</button> : (
            <div className="card card-pad stack" style={{ gap: '0.6rem' }}>
              <b>{t('Spanish version (shown to people using Spanish)')}</b>
              <Field label="Headline (Spanish)"><input className="input" lang="es" value={d.titleEs || ''} onChange={(e) => set('titleEs', e.target.value)} maxLength={160} /></Field>
              <Field label="Message (Spanish)"><textarea className="input" lang="es" rows={2} value={d.bodyEs || ''} onChange={(e) => set('bodyEs', e.target.value)} /></Field>
            </div>
          )}
        </div>
        <div>
          <div className="fld-label"><Eye size={15} style={{ verticalAlign: -2 }} /> {t('Preview')}</div>
          <div className="ann-preview"><AnnouncementBanner a={{ title: d.title || t('Your headline here'), body: d.body, titleEs: showEs ? d.titleEs : '', bodyEs: showEs ? d.bodyEs : '', level: d.level }} onHide={d.dismissible !== false ? () => {} : undefined} /></div>
        </div>
      </form>
    </Modal>
  );
}
