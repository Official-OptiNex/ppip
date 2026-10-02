import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  UserPlus, Pencil, Trash2, KeyRound, ShieldCheck, Eye, PenLine, Database, HardDrive, Download, RotateCcw, Plus, Save, Upload, Users, Wand2,
  RefreshCw, LogOut, CheckCircle2, AlertTriangle, Printer, X,
} from 'lucide-react';
import { DEFAULT_PRINT_TEMPLATE, type PrintTemplate, type PublicUser, type Role, type Settings } from '../../../shared/types';
import { api, errorMessage, getToken, serverUrl } from '../lib/api';
import { saveDoc, setState, toast, toastError, useIsAdmin, useStore, loadBootstrap } from '../lib/store';
import { bytes, fmtDateTime, navigate, timeAgo, download } from '../lib/util';
import { Field, Modal, NumberInput, Tabs, confirmDialog, Spinner, Seg } from '../components/ui';
import { OrderSheet } from './Orders';
import { MechanicsTab } from './Mechanics';
import { startTour } from '../components/Tour';
import { GraduationCap, Play } from 'lucide-react';
import { plural, t } from '../lib/i18n';
import { rich } from '../components/ui';
import { Avatar } from '../components/ui';
import { ImagePicker } from '../components/ImagePicker';
import { AnnouncementsAdmin } from '../components/Announcements';
import { IDLE_DEFAULT } from '../components/IdleLogout';

type Tab = 'users' | 'announcements' | 'mechanics' | 'system' | 'backups' | 'settings' | 'print';

export function AdminPage({ tab: tabArg }: { tab?: string }) {
  const isAdmin = useIsAdmin();
  const tab = (isAdmin ? (['users', 'announcements', 'mechanics', 'system', 'backups', 'settings', 'print'].includes(tabArg || '') ? tabArg : 'users') : 'print') as Tab;
  return (
    <div>
      <div className="page-head"><div><h1>{t(isAdmin ? 'Admin' : 'Print layout')}</h1><div className="sub">{t(isAdmin ? 'Accounts, storage, backups and app settings.' : 'Change how printed order guides look.')}</div></div></div>
      {isAdmin && <Tabs value={tab} onChange={(v) => navigate(`/admin/${v}`, true)} tabs={[
        { id: 'users', label: 'Users' }, { id: 'announcements', label: 'Announcements' }, { id: 'mechanics', label: 'Mechanics & shifts' }, { id: 'system', label: 'Storage & usage' }, { id: 'backups', label: 'Backups' }, { id: 'settings', label: 'Settings' }, { id: 'print', label: 'Print layout' },
      ]} />}
      {tab === 'users' && <UsersTab />}
      {tab === 'announcements' && <AnnouncementsAdmin />}
      {tab === 'mechanics' && <MechanicsTab />}
      {tab === 'system' && <SystemTab />}
      {tab === 'backups' && <BackupsTab />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'print' && <PrintTab />}
    </div>
  );
}

// ------------------------------------------------------------ users
const ROLE_INFO: Record<Role, { label: string; icon: React.ReactNode; desc: string; cls: string }> = {
  viewer: { label: 'Viewer', icon: <Eye size={18} />, desc: 'Can look up parts, knives, rollers, reports. Cannot change anything.', cls: 'neutral' },
  editor: { label: 'Editor', icon: <PenLine size={18} />, desc: 'Can add and edit parts, take/receive stock, order guides, knives & rollers, import.', cls: 'info' },
  admin: { label: 'Admin', icon: <ShieldCheck size={18} />, desc: 'Everything, plus manage accounts, settings, backups and storage.', cls: 'ok' },
};

function UsersTab() {
  const me = useStore((s) => s.me);
  const online = useStore((s) => s.online);
  const [users, setUsers] = useState<PublicUser[] | null>(null);
  const [edit, setEdit] = useState<Partial<PublicUser> | null>(null);
  const load = () => api<PublicUser[]>('/admin/users').then((u) => { setUsers(u); setState({ users: u }); }).catch(toastError);
  useEffect(() => { load(); }, []);
  const liveUsers = useStore((s) => s.users);
  useEffect(() => { if (users) load(); /* refresh when someone else edits */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveUsers.length]);

  const remove = async (u: PublicUser) => {
    if (!(await confirmDialog({ title: t("Delete {name}'s account?", { name: u.name }), body: t('They will be signed out everywhere. Their past activity stays in the log. (You can also just deactivate the account.)'), confirm: t('Delete account'), danger: true }))) return;
    try { await api(`/admin/users/${u.id}`, { method: 'DELETE' }); toast(t('Account deleted')); load(); } catch (e) { toastError(e); }
  };
  const toggleActive = async (u: PublicUser) => {
    try { await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } }); toast(t(u.active ? '{name} deactivated' : '{name} reactivated', { name: u.name })); load(); } catch (e) { toastError(e); }
  };
  const sendTour = async (target: { userId?: string; role?: Role | 'all' }, label: string) => {
    try {
      const r = await api<{ count: number; online: number }>('/admin/tour', { body: target });
      toast(t('Tour turned on for {who}', { who: label }), 'success', `${plural(r.count, '{n} account', '{n} accounts')}${r.online ? ` · ${t('opens now for {n} online', { n: r.online })}` : ''} · ${t('otherwise at next sign-in')}`);
    } catch (e) { toastError(e); }
  };
  if (!users) return <Spinner />;
  return (
    <div className="stack">
      <div className="card card-pad stack">
        <h3><GraduationCap size={20} style={{ verticalAlign: -4 }} /> {t('Guided tour')}</h3>
        <p className="muted" style={{ margin: 0 }}>{t("Everyone sees the tour on their first sign-in. Turn it on again for anyone here — it opens right away if they're online, otherwise next time they sign in.")}</p>
        <div className="row wrap">
          <span className="fld-label" style={{ minWidth: 110, margin: 0 }}>{t('Show it to:')}</span>
          <button className="btn" onClick={() => sendTour({ role: 'viewer' }, t('All viewers'))}><Eye size={17} />{t('All viewers')}</button>
          <button className="btn" onClick={() => sendTour({ role: 'editor' }, t('All editors'))}><PenLine size={17} />{t('All editors')}</button>
          <button className="btn" onClick={() => sendTour({ role: 'admin' }, t('All admins'))}><ShieldCheck size={17} />{t('All admins')}</button>
          <button className="btn" onClick={() => sendTour({ role: 'all' }, t('Everyone'))}><Users size={17} />{t('Everyone')}</button>
        </div>
        <div className="row wrap">
          <span className="fld-label" style={{ minWidth: 110, margin: 0 }}>{t('Preview here as:')}</span>
          {(['viewer', 'editor', 'admin'] as Role[]).map((r) => <button key={r} className="btn" onClick={() => startTour(r)}><Play size={16} />{t(ROLE_INFO[r].label)}</button>)}
        </div>
        <p className="small muted" style={{ margin: 0 }}>{t('Use the 🎓 button on a person below to show it to just them.')}</p>
      </div>
      <div className="row wrap" style={{ justifyContent: 'space-between' }}>
        <div className="row wrap" style={{ gap: '0.5rem' }}>{(['viewer', 'editor', 'admin'] as Role[]).map((r) => <span key={r} className={`pill ${ROLE_INFO[r].cls}`} title={t(ROLE_INFO[r].desc)}>{ROLE_INFO[r].icon}{t(ROLE_INFO[r].label)}: {users.filter((u) => u.role === r).length}</span>)}</div>
        <button className="btn primary lg" onClick={() => setEdit({ role: 'editor' })}><UserPlus />{t('Add person')}</button>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>{t('Name')}</th><th>{t('Email')}</th><th>{t('Badge')}</th><th>{t('Access')}</th><th>{t('Last sign-in')}</th><th>{t('Status')}</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.active ? '' : 'st-retired'}>
                <td><div className="row" style={{ gap: 8 }}><Avatar name={u.name} image={u.avatar} /><span><b>{u.name}</b>{u.id === me?.id && <span className="muted"> ({t('you')})</span>}{online.some((o) => o.id === u.id) && <span className="pill ok" style={{ marginLeft: 8 }}>{t('online')}</span>}</span></div></td>
                <td>{u.email}</td>
                <td className="mono">{u.badge || <span className="muted" style={{ fontFamily: 'var(--font)' }}>—</span>}</td>
                <td><span className={`pill ${ROLE_INFO[u.role].cls}`}>{ROLE_INFO[u.role].icon}{t(ROLE_INFO[u.role].label)}</span></td>
                <td>{u.lastLogin ? timeAgo(u.lastLogin) : t('Never')}</td>
                <td>{t(u.active ? 'Active' : 'Deactivated')}</td>
                <td>
                  <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                    <button className="btn sm icon" title={t('Show the guided tour to {name}', { name: u.name })} aria-label={`Show tour to ${u.name}`} onClick={() => sendTour({ userId: u.id }, u.name)} disabled={!u.active}><GraduationCap size={17} /></button>
                    <button className="btn sm" onClick={() => setEdit(u)}><Pencil size={16} />{t('Edit')}</button>
                    {u.id !== me?.id && <button className="btn sm" onClick={() => toggleActive(u)}>{t(u.active ? 'Deactivate' : 'Reactivate')}</button>}
                    {u.id !== me?.id && <button className="btn sm icon ghost" onClick={() => remove(u)} aria-label={t('Delete')}><Trash2 size={17} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">{t('People sign in with their badge, or their email or name + password. Share login details privately (text/in person), not by group email.')}</p>
      {edit && <UserForm user={edit} onClose={() => setEdit(null)} onSaved={load} />}
    </div>
  );
}

function genPassword() {
  const words = ['Bolt', 'Gear', 'Roller', 'Knife', 'Valve', 'Motor', 'Belt', 'Spring', 'Wrench', 'Piston', 'Bearing', 'Sensor'];
  const r = crypto.getRandomValues(new Uint32Array(3));
  return `${words[r[0] % words.length]}${words[r[1] % words.length]}${100 + (r[2] % 900)}`;
}

function UserForm({ user, onClose, onSaved }: { user: Partial<PublicUser>; onClose: () => void; onSaved: () => void }) {
  const isNew = !user.id;
  const [d, setD] = useState({ name: user.name || '', email: user.email || '', role: (user.role || 'editor') as Role, password: isNew ? genPassword() : '', badge: user.badge || '' });
  const [showPw, setShowPw] = useState(isNew);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ name: string; email: string; password: string } | null>(null);
  const [avatar, setAvatar] = useState<string | null>(user.avatar || null);
  const saveAvatar = async (id: string | null) => {
    if (!user.id) return;
    try { await api(`/admin/users/${user.id}`, { method: 'PATCH', body: { avatar: id } }); setAvatar(id); toast(id ? t('Profile picture saved') : t('Profile picture removed')); onSaved(); } catch (e) { toastError(e); }
  };
  const save = async () => {
    setBusy(true);
    try {
      if (isNew) await api('/admin/users', { body: d });
      else await api(`/admin/users/${user.id}`, { method: 'PATCH', body: { name: d.name, email: d.email, role: d.role, badge: d.badge || null, ...(d.password ? { password: d.password } : {}) } });
      onSaved();
      if (d.password) setDone({ name: d.name, email: d.email, password: d.password }); else { toast(t('Saved')); onClose(); }
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  if (done) {
    const text = `Process Engineer login\nSite: ${serverUrl() || location.origin}\nName: ${done.name}\nEmail: ${done.email}\nPassword: ${done.password}`;
    return (
      <Modal title={isNew ? 'Account created' : 'Password updated'} onClose={onClose} footer={<button className="btn primary lg" onClick={onClose}>{t('Done')}</button>}>
        <div className="stack">
          <div className="banner ok"><CheckCircle2 /> {t('Give these details to {name}. The password is not shown again.', { name: done.name })}</div>
          <pre className="card card-pad mono" style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '1.05rem' }}>{text}</pre>
          <button className="btn" onClick={() => { navigator.clipboard?.writeText(text); toast(t('Copied')); }}>{t('Copy to clipboard')}</button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal title={isNew ? t('Add a person') : t('Edit {tag}', { tag: user.name })} onClose={onClose} footer={<><button className="btn lg" onClick={onClose}>{t('Cancel')}</button><button className="btn primary lg" onClick={save} disabled={busy}><Save />{isNew ? t('Create account') : t('Save')}</button></>}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="grid-2">
          <Field label="Name" required hint="Can be used to sign in — must be unique"><input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} autoFocus /></Field>
          <Field label="Email" required><input className="input" type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></Field>
          <Field label="Badge ID (optional)" hint="Click here and scan their badge, or type the ID exactly as printed (letters and symbols like 7A:018 are fine). Lets them sign in with one scan." className="span-2">
            <input className="input mono" value={d.badge} autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder={t('Scan or type')} onChange={(e) => setD({ ...d, badge: e.target.value.slice(0, 40) })}
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); /* scanners press Enter — don't submit the form */ }} />
          </Field>
        </div>
        <Field label="Access level">
          <div className="col" style={{ gap: '0.5rem' }}>
            {(['viewer', 'editor', 'admin'] as Role[]).map((r) => (
              <label key={r} className="card" style={{ display: 'flex', gap: '0.8rem', padding: '0.8rem 1rem', cursor: 'pointer', borderColor: d.role === r ? 'var(--primary)' : undefined, background: d.role === r ? 'var(--primary-soft)' : undefined }}>
                <input type="radio" name="role" checked={d.role === r} onChange={() => setD({ ...d, role: r })} style={{ width: '1.3rem', height: '1.3rem', accentColor: 'var(--primary)' }} />
                <div><b className="row" style={{ gap: 6 }}>{ROLE_INFO[r].icon}{t(ROLE_INFO[r].label)}</b><div className="small muted">{t(ROLE_INFO[r].desc)}</div></div>
              </label>
            ))}
          </div>
        </Field>
        {isNew || showPw ? (
          <Field label={isNew ? 'Password' : 'New password'} hint="At least 6 characters. You'll see it once after saving so you can pass it on.">
            <div className="row"><input className="input mono grow" value={d.password} onChange={(e) => setD({ ...d, password: e.target.value })} /><button type="button" className="btn" onClick={() => setD({ ...d, password: genPassword() })}><Wand2 size={18} />{t('Generate')}</button></div>
          </Field>
        ) : <button type="button" className="btn" onClick={() => { setShowPw(true); setD({ ...d, password: genPassword() }); }}><KeyRound size={18} />{t('Reset password')}</button>}
        {!isNew && <Field label="Profile picture"><ImagePicker value={avatar} onChange={saveAvatar} label={t('Profile picture: {name}', { name: user.name || '' })} round purpose="avatar" /></Field>}
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------ system
interface SystemInfo {
  dbBytes: number; imageBytes: number; imageCount: number; backupBytes: number; docsBytes: number; counts: Record<string, number>;
  sessions: { id: string; createdAt: number; lastUsed: number; agent: string; userName: string }[]; online: { id: string; name: string }[]; connections: number;
  offsiteBackupConfigured: boolean; limits: { storageBytes: number; note: string };
}
function SystemTab() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const load = () => api<SystemInfo>('/admin/system').then(setInfo).catch(toastError);
  useEffect(() => { load(); }, []);
  const partsCount = useStore((s) => Object.keys(s.docs.parts).length);
  const [erasing, setErasing] = useState(false);
  if (!info) return <Spinner />;
  const pct = info.dbBytes / info.limits.storageBytes;
  const revoke = async (id: string) => { try { await api(`/admin/sessions/${id}`, { method: 'DELETE' }); load(); toast(t('Signed out that device')); } catch (e) { toastError(e); } };
  const demo = async () => {
    if (!(await confirmDialog({ title: t('Load demo data?'), body: t('Adds sample parts, machines, suppliers, hot knives, rollers, sonic welders, downtime, crushed cores and ~10 months of usage so you can try everything. Only works while there are no parts yet.'), confirm: t('Load demo data') }))) return;
    try { await api('/admin/demo', { method: 'POST' }); await loadBootstrap(); toast(t('Demo data loaded')); load(); } catch (e) { toastError(e); }
  };
  const device = (a: string) => /iPhone|Android/i.test(a) ? 'Phone' : /iPad|Tablet/i.test(a) ? 'Tablet' : /Windows/i.test(a) ? 'Windows PC' : /Mac/i.test(a) ? 'Mac' : 'Browser';
  const browser = (a: string) => /Edg\//.test(a) ? 'Edge' : /Chrome\//.test(a) ? 'Chrome' : /Firefox\//.test(a) ? 'Firefox' : /Safari\//.test(a) ? 'Safari' : '';
  return (
    <div className="stack">
      <div className="tiles">
        <div className="tile info"><span className="t-label"><Database size={18} />{t('Database size')}</span><span className="t-value" style={{ fontSize: '1.6rem' }}>{bytes(info.dbBytes)}</span><span className="t-sub">{t('of {v} free allowance', { v: bytes(info.limits.storageBytes) })} ({(pct * 100).toFixed(pct < 0.01 ? 3 : 1)}%)</span></div>
        <div className="tile"><span className="t-label"><HardDrive size={18} />{t('Photos')}</span><span className="t-value" style={{ fontSize: '1.6rem' }}>{bytes(info.imageBytes)}</span><span className="t-sub">{t('{n} photos', { n: info.imageCount })}</span></div>
        <div className="tile"><span className="t-label"><RotateCcw size={18} />{t('Backups stored')}</span><span className="t-value" style={{ fontSize: '1.6rem' }}>{bytes(info.backupBytes)}</span><span className="t-sub">{t('compressed snapshots')}</span></div>
        <div className="tile ok"><span className="t-label"><Users size={18} />{t('Online now')}</span><span className="t-value">{info.online.length}</span><span className="t-sub">{t('{n} open screens', { n: info.connections })}</span></div>
      </div>
      <div className="card card-pad">
        <div className="row" style={{ justifyContent: 'space-between' }}><b>{t('Storage used')}</b><span className="muted">{bytes(info.dbBytes)} / {bytes(info.limits.storageBytes)}</span></div>
        <div className={`progress ${pct > 0.8 ? 'danger' : pct > 0.5 ? 'warn' : 'info'}`} style={{ height: '0.9rem', marginTop: 8 }}><div style={{ width: `${Math.max(0.5, pct * 100)}%` }} /></div>
        <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>{info.limits.note} Photos are compressed on upload (~150–300 KB each), so thousands fit comfortably.</p>
      </div>
      <div className="grid-cards">
        <div className="card">
          <div className="card-head"><h3>{t('Records')}</h3><button className="btn sm" onClick={load}><RefreshCw size={16} />{t('Refresh')}</button></div>
          <div className="card-body"><dl className="kv" style={{ margin: 0 }}>{Object.entries(info.counts).map(([k, v]) => <Fragment key={k}><dt style={{ textTransform: 'capitalize' }}>{k}</dt><dd>{v.toLocaleString()}</dd></Fragment>)}</dl></div>
        </div>
        <div className="card">
          <div className="card-head"><h3>{t('Signed-in devices')}</h3></div>
          <div className="list" style={{ maxHeight: 420, overflowY: 'auto' }}>
            {info.sessions.map((s) => (
              <div key={s.id} className="list-item">
                <div className="grow"><b>{s.userName || '?'}</b> <span className="muted">· {device(s.agent)} {browser(s.agent)}</span><div className="small muted">{t('last active {a} · signed in {b}', { a: timeAgo(s.lastUsed), b: fmtDateTime(s.createdAt) })}</div></div>
                <button className="btn sm" onClick={() => revoke(s.id)} title={t('Sign this device out')}><LogOut size={16} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="card card-pad row wrap" style={{ justifyContent: 'space-between' }}>
        <div><b>{t('Try it with demo data')}</b><div className="small muted">{t('Fills an empty database with realistic sample data.')}</div></div>
        <button className="btn" onClick={demo} disabled={partsCount > 0}>{partsCount > 0 ? t('Only available when empty (use Erase all data below first)') : t('Load demo data')}</button>
      </div>
      <div className="card card-pad stack" style={{ borderColor: 'var(--danger-border)' }}>
        <h3 style={{ color: 'var(--danger)' }}><AlertTriangle size={20} style={{ verticalAlign: -4 }} /> {t('Danger zone')}</h3>
        <div className="row wrap" style={{ justifyContent: 'space-between' }}>
          <div><b>{t('Erase all data')}</b><div className="small muted">{t('Deletes every part, photo, stock history, PM, knife, roller, welder, downtime entry, crushed core, order guide, machine and supplier. User accounts, settings and backups are kept.')}</div></div>
          <button className="btn danger" onClick={() => setErasing(true)}><Trash2 size={18} />{t('Erase all data…')}</button>
        </div>
      </div>
      {erasing && <EraseWizard onClose={() => setErasing(false)} onDone={() => { setErasing(false); load(); }} />}
    </div>
  );
}

const ERASE_PHRASE = 'DELETE ALL DATA';
/** Five deliberate steps before everything is wiped. */
function EraseWizard({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const docs = useStore((s) => s.docs);
  const counts = useMemo(() => ({ parts: Object.keys(docs.parts).length, pms: Object.keys(docs.pms).length, eq: Object.keys(docs.equipment).length, orders: Object.keys(docs.orders).length, dt: Object.keys(docs.downtime).length + Object.keys(docs.cores).length + Object.keys(docs.welders).length }), [docs]);
  const [step, setStep] = useState(1);
  const [ack, setAck] = useState({ a: false, b: false, c: false });
  const [phrase, setPhrase] = useState('');
  const [pw, setPw] = useState('');
  const [wait, setWait] = useState(5);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (step !== 5) return;
    setWait(5);
    const timer = setInterval(() => setWait((w) => (w > 0 ? w - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [step]);

  const erase = async () => {
    setBusy(true); setErr('');
    try {
      await api('/admin/erase', { body: { password: pw, confirm: phrase }, timeout: 120000 });
      await loadBootstrap();
      toast(t('All data erased'), 'success', t('A backup was saved first (Admin → Backups → “Before erase”). You can load demo data now.'));
      onDone();
    } catch (e) { setErr(t(errorMessage(e))); setStep(4); } finally { setBusy(false); }
  };

  const canNext = step === 1 ? true : step === 2 ? ack.a && ack.b && ack.c : step === 3 ? phrase === ERASE_PHRASE : step === 4 ? pw.length > 0 : wait === 0;
  return (
    <Modal title={t('Erase all data — step {i} of 5', { i: step })} onClose={onClose} icon={<AlertTriangle color="var(--danger)" />}
      footer={<>
        <span className="left">{[1, 2, 3, 4, 5].map((n) => <span key={n} className="dot" style={{ marginRight: 6, background: n <= step ? 'var(--danger)' : 'var(--border-strong)' }} />)}</span>
        <button className="btn lg" onClick={step === 1 ? onClose : () => setStep(step - 1)} disabled={busy}>{step === 1 ? t('Cancel') : t('Back')}</button>
        {step < 5
          ? <button className="btn lg danger" onClick={() => setStep(step + 1)} disabled={!canNext}>{t('Continue')}</button>
          : <button className="btn lg danger" onClick={erase} disabled={!canNext || busy}><Trash2 />{busy ? t('Erasing…') : wait > 0 ? `${t('Erase everything')} (${wait})` : t('Erase everything now')}</button>}
      </>}>
      {step === 1 && (
        <div className="stack">
          <div className="banner danger"><AlertTriangle />{t('This wipes the database clean.')}</div>
          <p style={{ margin: 0 }}>{rich('These will be **permanently deleted** for everyone, on every screen:')}</p>
          <ul style={{ margin: 0, paddingLeft: '1.3rem', lineHeight: 1.7 }}>
            <li><b>{counts.parts}</b> {t('parts, their photos and all stock history')}</li>
            <li><b>{counts.pms}</b> {t('PM entries and every machine')}</li>
            <li><b>{counts.eq}</b> {t('hot knives, rollers, horns and anvils')}</li>
            <li><b>{counts.dt}</b> {t('sonic welders, downtime entries and crushed cores')}</li>
            <li><b>{counts.orders}</b> {t('order guides, the activity log and notifications')}</li>
            <li>{t('Your suppliers and manufacturers (reset to the built-in list)')}</li>
          </ul>
          <p className="muted" style={{ margin: 0 }}>{rich('**Kept:** user accounts, passwords, profile pictures, app settings, print layout and backups.')}</p>
        </div>
      )}
      {step === 2 && (
        <div className="stack">
          <p style={{ margin: 0 }}>{t('Tick each box to confirm you understand:')}</p>
          <label className="check"><input type="checkbox" checked={ack.a} onChange={(e) => setAck({ ...ack, a: e.target.checked })} />{t('Everyone using the app will lose this data immediately.')}</label>
          <label className="check"><input type="checkbox" checked={ack.b} onChange={(e) => setAck({ ...ack, b: e.target.checked })} />{t('Only a backup can bring it back (one is saved automatically right before erasing).')}</label>
          <label className="check"><input type="checkbox" checked={ack.c} onChange={(e) => setAck({ ...ack, c: e.target.checked })} />{t('I really want to erase all data.')}</label>
        </div>
      )}
      {step === 3 && (
        <div className="stack">
          <Field label={<>{t('Type this to confirm:')} <b className="mono" style={{ color: 'var(--danger)' }}>{ERASE_PHRASE}</b></>}>
            <input className="input mono" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoFocus autoComplete="off" placeholder={ERASE_PHRASE} />
          </Field>
          {phrase && phrase !== ERASE_PHRASE && <div className="small muted">{t('Must match exactly, in capitals.')}</div>}
        </div>
      )}
      {step === 4 && (
        <div className="stack">
          <Field label="Enter your password"><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="current-password" /></Field>
          {err && <div className="banner danger">{err}</div>}
        </div>
      )}
      {step === 5 && (
        <div className="stack center">
          <Trash2 size={56} color="var(--danger)" style={{ margin: '0 auto' }} />
          <h2>{t('Last chance')}</h2>
          <p style={{ margin: 0 }}>{rich('Clicking the red button erases everything right away. A backup is saved first and appears under **Admin → Backups** as **“Before erase”**.')}</p>
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------ backups
interface BackupRow { id: string; at: number; reason: string; size: number; counts: string }
function BackupsTab() {
  const [info, setInfo] = useState<{ backups: BackupRow[]; offsiteBackupConfigured: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api<{ backups: BackupRow[]; offsiteBackupConfigured: boolean }>('/admin/system').then(setInfo).catch(toastError);
  useEffect(() => { load(); }, []);
  const create = async () => { setBusy(true); try { await api('/admin/backups', { method: 'POST' }); toast(t('Backup created')); load(); } catch (e) { toastError(e); } finally { setBusy(false); } };
  const dl = async (b: BackupRow) => {
    try {
      const res = await fetch(`${serverUrl()}/api/admin/backups/${encodeURIComponent(b.id)}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error('Download failed');
      download(`ppip-backup-${b.id}.json`, await res.text(), 'application/json');
    } catch (e) { toastError(e); }
  };
  const restore = async (b: BackupRow) => {
    if (!(await confirmDialog({ title: t('Restore this backup?'), body: <>{t('Everything goes back to how it was on {date}. Changes made since then are replaced. A safety backup of the current data is made first, so this can be undone.', { date: fmtDateTime(b.at) })}</>, confirm: t('Restore'), danger: true }))) return;
    setBusy(true);
    try { await api(`/admin/backups/${encodeURIComponent(b.id)}/restore`, { method: 'POST', timeout: 120000 }); await loadBootstrap(); toast(t('Restored')); load(); } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  const del = async (b: BackupRow) => { try { await api(`/admin/backups/${encodeURIComponent(b.id)}`, { method: 'DELETE' }); load(); } catch (e) { toastError(e); } };
  const upload = async (f?: File) => {
    if (!f) return;
    let data: unknown;
    try { data = JSON.parse(await f.text()); } catch { toast(t('That file is not a valid backup'), 'danger'); return; }
    if (!(await confirmDialog({ title: t('Restore from “{name}”?', { name: f.name }), body: t('All current data is replaced by the file. A safety backup of the current data is made first.'), confirm: t('Restore'), danger: true }))) return;
    setBusy(true);
    try { await api('/admin/restore', { body: data, timeout: 180000 }); await loadBootstrap(); toast(t('Restored from file')); load(); } catch (e) { toast(t('Restore failed'), 'danger', t(errorMessage(e))); } finally { setBusy(false); }
  };
  if (!info) return <Spinner />;
  return (
    <div className="stack">
      <div className="card card-pad stack">
        <h3>{t('How your data is protected')}</h3>
        <div className="row"><CheckCircle2 color="var(--ok)" /><span><b>Automatic daily backup</b> inside the database (last 21 days kept).</span></div>
        <div className="row"><CheckCircle2 color="var(--ok)" /><span><b>Cloudflare durable storage</b> — data is stored redundantly and never expires or sleeps.</span></div>
        <div className="row">{info.offsiteBackupConfigured ? <CheckCircle2 color="var(--ok)" /> : <AlertTriangle color="var(--warn)" />}<span><b>Off-site nightly copy to your private GitHub repo</b> — {info.offsiteBackupConfigured ? 'backup key is set (see the “Nightly backup” GitHub Action for results).' : 'not set up yet. See docs/SETUP.md, step “Off-site backups”.'}</span></div>
        <div className="row"><CheckCircle2 color="var(--ok)" /><span><b>Download a copy any time</b> with the buttons below or from Import / Export.</span></div>
      </div>
      <div className="row wrap">
        <button className="btn primary lg" onClick={create} disabled={busy}><Plus />{t('Back up now')}</button>
        <label className="btn lg" style={{ cursor: 'pointer' }}><Upload />{t('Restore from a file')}<input type="file" accept=".json" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} /></label>
        {busy && <Spinner />}
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>{t('When')}</th><th>{t('Type')}</th><th>{t('Contents')}</th><th className="num">{t('Size')}</th><th /></tr></thead>
          <tbody>
            {info.backups.map((b) => {
              const c = JSON.parse(b.counts || '{}');
              return (
                <tr key={b.id}>
                  <td><b>{fmtDateTime(b.at)}</b><div className="small muted">{timeAgo(b.at)}</div></td>
                  <td><span className={`pill ${b.reason === 'auto' ? 'neutral' : b.reason === 'manual' ? 'info' : 'warn'}`}>{t(b.reason === 'auto' ? 'Daily' : b.reason === 'manual' ? 'Manual' : b.reason === 'pre-erase' ? 'Before erase' : 'Before restore')}</span></td>
                  <td className="small">{c.parts ?? '?'} parts · {c.equipment ?? 0} knives/rollers · {c.orders ?? 0} orders · {c.movements ?? 0} history rows</td>
                  <td className="num">{bytes(b.size)}</td>
                  <td><div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                    <button className="btn sm" onClick={() => dl(b)}><Download size={16} />{t('Download')}</button>
                    <button className="btn sm" onClick={() => restore(b)} disabled={busy}><RotateCcw size={16} />{t('Restore')}</button>
                    <button className="btn sm icon ghost" onClick={() => del(b)} aria-label="Delete backup"><Trash2 size={16} /></button>
                  </div></td>
                </tr>
              );
            })}
            {info.backups.length === 0 && <tr><td colSpan={5} className="center muted">No backups yet — the first automatic one runs tonight. Click “Back up now” to make one immediately.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ settings
function SettingsTab() {
  const settings = useStore((s) => s.settings);
  const [d, setD] = useState<Settings>(settings);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setD({ ...d, [k]: v });
  const save = async () => {
    setBusy(true);
    try {
      const { companyName, department, weeklyReportDay, currency, publicUrl, badgeLogin, idleLogoutMin } = d;
      await saveDoc('settings', 'app', { companyName, department, weeklyReportDay, currency, publicUrl, badgeLogin: badgeLogin !== false, idleLogoutMin: idleLogoutMin ?? IDLE_DEFAULT });
      toast(t('Settings saved'));
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  return (
    <div className="stack" style={{ maxWidth: 900 }}>
      <div className="card card-pad grid-2">
        <Field label="Company / plant name"><input className="input" value={d.companyName || ''} onChange={(e) => set('companyName', e.target.value)} /></Field>
        <Field label="Department"><input className="input" value={d.department || ''} onChange={(e) => set('department', e.target.value)} /></Field>
        <Field label="Weekly report starts on">
          <select className="input" value={d.weeklyReportDay ?? 1} onChange={(e) => set('weeklyReportDay', Number(e.target.value))}>
            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((n, i) => <option key={n} value={i}>{t(n)}</option>)}
          </select>
        </Field>
        <Field label="Currency"><select className="input" value={d.currency || 'USD'} onChange={(e) => set('currency', e.target.value)}>{['USD', 'CAD', 'EUR', 'GBP', 'MXN', 'AUD'].map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Website address" className="span-2" hint="Used in QR codes on labels and phone-photo links (important when running from USB). Leave blank to detect automatically.">
          <input className="input" value={d.publicUrl || ''} onChange={(e) => set('publicUrl', e.target.value)} placeholder={serverUrl() || location.origin} />
        </Field>
        <div className="span-2">
          <label className="check"><input type="checkbox" checked={d.badgeLogin !== false} onChange={(e) => set('badgeLogin', e.target.checked)} />{t('Allow badge sign-in (scan an employee badge to sign in — no password)')}</label>
          <div className="small muted">{t('Anyone holding a linked badge can sign in to that account, so keep this on only for computers in the plant. Badge numbers are set under Users.')}</div>
        </div>
        <Field label="Sign out automatically" hint="When nobody touches the screen for this long, it signs out so the next person can't use the wrong account. A warning shows 1 minute before.">
          <select className="input" value={d.idleLogoutMin ?? IDLE_DEFAULT} onChange={(e) => set('idleLogoutMin', Number(e.target.value))} data-testid="idle-setting">
            {[5, 10, 15, 30, 60, 120].map((m) => <option key={m} value={m}>{t('After {n} minutes of no activity', { n: m })}</option>)}
            <option value={0}>{t('Never (stay signed in)')}</option>
          </select>
        </Field>
      </div>
      <p className="muted">{t('Categories, locations and units are edited under')} <a href="#/suppliers/lists">{t('Suppliers & Lists → Dropdown lists')}</a>.</p>
      <div><button className="btn primary lg" onClick={save} disabled={busy}><Save />{t('Save settings')}</button></div>
    </div>
  );
}

// ------------------------------------------------------------ print layout editor
function PrintTab() {
  const settings = useStore((s) => s.settings);
  const [tp, setT] = useState<PrintTemplate>(() => ({ ...DEFAULT_PRINT_TEMPLATE, ...(settings.printTemplate || {}), columns: { ...DEFAULT_PRINT_TEMPLATE.columns, ...(settings.printTemplate?.columns || {}) } }));
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<'sample' | 'blank'>('sample');
  const set = <K extends keyof PrintTemplate>(k: K, v: PrintTemplate[K]) => setT({ ...tp, [k]: v });
  const sample = useMemo(() => ({
    id: 'x', number: 'ORD-0042', title: 'Seal bar rebuild — Bag Machine 2', requestedBy: 'Nick', department: settings.department, dateNeeded: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10), machine: 'Bag Machine 2', priority: 'high' as const, status: 'draft' as const, vendor: 'McMaster-Carr', createdAt: Date.now(),
    items: [
      { name: 'Cartridge heater 1/2" x 6" 500W', partNumber: '3618K451', manufacturer: 'McMaster-Carr', vendor: 'McMaster-Carr', qty: 4, unitCost: 38.5, reason: 'Two failed, restock spares', url: 'https://www.mcmaster.com/3618K451' },
      { name: 'PTFE coated fiberglass tape 2"', partNumber: '76475A31', manufacturer: 'McMaster-Carr', vendor: 'McMaster-Carr', qty: 2, unit: 'roll', unitCost: 64.2, reason: 'Out of stock' },
      { name: 'Type J thermocouple 1/8" probe', partNumber: '3871K23', manufacturer: 'McMaster-Carr', vendor: 'McMaster-Carr', qty: 3, unitCost: 27.9, reason: 'Running low' },
    ], notes: 'Please expedite — line is running on last spare.',
  }), [settings.department]);
  const save = async () => { setBusy(true); try { await saveDoc('settings', 'app', { printTemplate: tp }); toast(t('Print layout saved')); } catch (e) { toastError(e); } finally { setBusy(false); } };
  const colLabels: Record<keyof PrintTemplate['columns'], string> = { partNumber: 'Part #', manufacturer: 'Manufacturer', vendor: 'Supplier', unitCost: 'Unit cost', total: 'Line total', reason: 'Reason / why', link: 'Order link' };
  return (
    <div className="row top wrap" style={{ gap: '1.5rem' }}>
      <div className="card card-pad stack" style={{ flex: '1 1 340px', maxWidth: 480 }}>
        <h3><Printer size={19} style={{ verticalAlign: -3 }} /> {t('Order guide layout')}</h3>
        <p className="small muted" style={{ margin: 0 }}>{t('Changes show in the preview right away. Save when it looks right.')}</p>
        <Field label="Title"><input className="input" value={tp.title} onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label="Subtitle"><input className="input" value={tp.subtitle || ''} onChange={(e) => set('subtitle', e.target.value)} /></Field>
        <div className="grid-2">
          <Field label="Accent color"><input className="input" type="color" value={tp.accent || '#1f5fbf'} onChange={(e) => set('accent', e.target.value)} style={{ padding: 4 }} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={!!tp.showLogo} onChange={(e) => set('showLogo', e.target.checked)} />{t('Show the Process Engineer logo')}</label>
        <Field label="Note at the top (optional)"><textarea className="input" value={tp.headerNote || ''} onChange={(e) => set('headerNote', e.target.value)} /></Field>
        <Field label="Footer note"><input className="input" value={tp.footerNote || ''} onChange={(e) => set('footerNote', e.target.value)} /></Field>
        <Field label="Columns">
          <div className="col" style={{ gap: 0 }}>
            {(Object.keys(colLabels) as (keyof PrintTemplate['columns'])[]).map((k) => (
              <label key={k} className="check" style={{ minHeight: '2.3rem' }}><input type="checkbox" checked={tp.columns[k]} onChange={(e) => set('columns', { ...tp.columns, [k]: e.target.checked })} />{t(colLabels[k])}</label>
            ))}
          </div>
        </Field>
        <Field label="Signature lines">
          <div className="col" style={{ gap: '0.4rem' }}>
            {tp.signatures.map((s, i) => (
              <div key={i} className="row">
                <input className="input" value={s} onChange={(e) => set('signatures', tp.signatures.map((x, j) => (j === i ? e.target.value : x)))} />
                <button type="button" className="btn icon" onClick={() => set('signatures', tp.signatures.filter((_, j) => j !== i))} aria-label={t('Remove')}><X size={18} /></button>
              </div>
            ))}
            {tp.signatures.length < 4 && <button type="button" className="btn" onClick={() => set('signatures', [...tp.signatures, 'Signature'])}><Plus size={18} />{t('Add signature line')}</button>}
          </div>
        </Field>
        <Field label={`${t('Text size on paper:')} ${Math.round((tp.fontScale || 1) * 100)}%`}><input type="range" min={0.8} max={1.3} step={0.05} value={tp.fontScale || 1} onChange={(e) => set('fontScale', Number(e.target.value))} /></Field>
        <div className="row wrap">
          <button className="btn primary lg" onClick={save} disabled={busy}><Save />{t('Save layout')}</button>
          <button className="btn" onClick={() => setT({ ...DEFAULT_PRINT_TEMPLATE })}><RotateCcw size={18} />{t('Reset to default')}</button>
        </div>
      </div>
      <div style={{ flex: '2 1 520px', minWidth: 0 }}>
        <div className="row" style={{ marginBottom: 8, justifyContent: 'space-between' }}><h3>{t('Preview')}</h3><Seg value={preview} onChange={setPreview} options={[{ id: 'sample', label: 'Sample order' }, { id: 'blank', label: 'Blank form' }]} /></div>
        <div style={{ overflowX: 'auto' }}><OrderSheet order={preview === 'sample' ? sample : { items: [] }} tpl={tp} settings={settings} blankRows={preview === 'blank' ? 10 : 2} /></div>
      </div>
    </div>
  );
}
