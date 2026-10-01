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

type Tab = 'users' | 'mechanics' | 'system' | 'backups' | 'settings' | 'print';

export function AdminPage({ tab: t }: { tab?: string }) {
  const isAdmin = useIsAdmin();
  const tab = (isAdmin ? (['users', 'mechanics', 'system', 'backups', 'settings', 'print'].includes(t || '') ? t : 'users') : 'print') as Tab;
  return (
    <div>
      <div className="page-head"><div><h1>{isAdmin ? 'Admin' : 'Print layout'}</h1><div className="sub">{isAdmin ? 'Accounts, storage, backups and app settings.' : 'Change how printed order guides look.'}</div></div></div>
      {isAdmin && <Tabs value={tab} onChange={(v) => navigate(`/admin/${v}`, true)} tabs={[
        { id: 'users', label: 'Users' }, { id: 'mechanics', label: 'Mechanics & shifts' }, { id: 'system', label: 'Storage & usage' }, { id: 'backups', label: 'Backups' }, { id: 'settings', label: 'Settings' }, { id: 'print', label: 'Print layout' },
      ]} />}
      {tab === 'users' && <UsersTab />}
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
    if (!(await confirmDialog({ title: `Delete ${u.name}'s account?`, body: 'They will be signed out everywhere. Their past activity stays in the log. (You can also just deactivate the account.)', confirm: 'Delete account', danger: true }))) return;
    try { await api(`/admin/users/${u.id}`, { method: 'DELETE' }); toast('Account deleted'); load(); } catch (e) { toastError(e); }
  };
  const toggleActive = async (u: PublicUser) => {
    try { await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } }); toast(u.active ? `${u.name} deactivated` : `${u.name} reactivated`); load(); } catch (e) { toastError(e); }
  };
  const sendTour = async (target: { userId?: string; role?: Role | 'all' }, label: string) => {
    try {
      const r = await api<{ count: number; online: number }>('/admin/tour', { body: target });
      toast(`Tour turned on for ${label}`, 'success', `${r.count} account${r.count === 1 ? '' : 's'}${r.online ? ` · opens now for ${r.online} online` : ''} · otherwise at next sign-in`);
    } catch (e) { toastError(e); }
  };
  if (!users) return <Spinner />;
  return (
    <div className="stack">
      <div className="card card-pad stack">
        <h3><GraduationCap size={20} style={{ verticalAlign: -4 }} /> Guided tour</h3>
        <p className="muted" style={{ margin: 0 }}>Everyone sees the tour on their first sign-in. Turn it on again for anyone here — it opens right away if they're online, otherwise next time they sign in.</p>
        <div className="row wrap">
          <span className="label" style={{ minWidth: 110 }}>Show it to:</span>
          <button className="btn" onClick={() => sendTour({ role: 'viewer' }, 'all viewers')}><Eye size={17} />All viewers</button>
          <button className="btn" onClick={() => sendTour({ role: 'editor' }, 'all editors')}><PenLine size={17} />All editors</button>
          <button className="btn" onClick={() => sendTour({ role: 'admin' }, 'all admins')}><ShieldCheck size={17} />All admins</button>
          <button className="btn" onClick={() => sendTour({ role: 'all' }, 'everyone')}><Users size={17} />Everyone</button>
        </div>
        <div className="row wrap">
          <span className="label" style={{ minWidth: 110 }}>Preview here as:</span>
          {(['viewer', 'editor', 'admin'] as Role[]).map((r) => <button key={r} className="btn" onClick={() => startTour(r)}><Play size={16} />{ROLE_INFO[r].label}</button>)}
        </div>
        <p className="small muted" style={{ margin: 0 }}>Use the 🎓 button on a person below to show it to just them.</p>
      </div>
      <div className="row wrap" style={{ justifyContent: 'space-between' }}>
        <div className="row wrap" style={{ gap: '0.5rem' }}>{(['viewer', 'editor', 'admin'] as Role[]).map((r) => <span key={r} className={`pill ${ROLE_INFO[r].cls}`} title={ROLE_INFO[r].desc}>{ROLE_INFO[r].icon}{ROLE_INFO[r].label}: {users.filter((u) => u.role === r).length}</span>)}</div>
        <button className="btn primary lg" onClick={() => setEdit({ role: 'editor' })}><UserPlus />Add person</button>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Name</th><th>Email</th><th>Badge</th><th>Access</th><th>Last sign-in</th><th>Status</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.active ? '' : 'st-retired'}>
                <td><b>{u.name}</b>{u.id === me?.id && <span className="muted"> (you)</span>}{online.some((o) => o.id === u.id) && <span className="pill ok" style={{ marginLeft: 8 }}>online</span>}</td>
                <td>{u.email}</td>
                <td className="mono">{u.badge || <span className="muted" style={{ fontFamily: 'var(--font)' }}>—</span>}</td>
                <td><span className={`pill ${ROLE_INFO[u.role].cls}`}>{ROLE_INFO[u.role].icon}{ROLE_INFO[u.role].label}</span></td>
                <td>{u.lastLogin ? timeAgo(u.lastLogin) : 'Never'}</td>
                <td>{u.active ? 'Active' : 'Deactivated'}</td>
                <td>
                  <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                    <button className="btn sm icon" title={`Show the guided tour to ${u.name}`} aria-label={`Show tour to ${u.name}`} onClick={() => sendTour({ userId: u.id }, u.name)} disabled={!u.active}><GraduationCap size={17} /></button>
                    <button className="btn sm" onClick={() => setEdit(u)}><Pencil size={16} />Edit</button>
                    {u.id !== me?.id && <button className="btn sm" onClick={() => toggleActive(u)}>{u.active ? 'Deactivate' : 'Reactivate'}</button>}
                    {u.id !== me?.id && <button className="btn sm icon ghost" onClick={() => remove(u)} aria-label="Delete"><Trash2 size={17} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">People sign in with their email <b>or</b> name + password. Share login details privately (text/in person), not by group email.</p>
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
  const save = async () => {
    setBusy(true);
    try {
      if (isNew) await api('/admin/users', { body: d });
      else await api(`/admin/users/${user.id}`, { method: 'PATCH', body: { name: d.name, email: d.email, role: d.role, badge: d.badge || null, ...(d.password ? { password: d.password } : {}) } });
      onSaved();
      if (d.password) setDone({ name: d.name, email: d.email, password: d.password }); else { toast('Saved'); onClose(); }
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  if (done) {
    const text = `Parts & PM login\nSite: ${serverUrl() || location.origin}\nName: ${done.name}\nEmail: ${done.email}\nPassword: ${done.password}`;
    return (
      <Modal title={isNew ? 'Account created' : 'Password updated'} onClose={onClose} footer={<button className="btn primary lg" onClick={onClose}>Done</button>}>
        <div className="stack">
          <div className="banner ok"><CheckCircle2 /> Give these details to {done.name}. The password is not shown again.</div>
          <pre className="card card-pad mono" style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '1.05rem' }}>{text}</pre>
          <button className="btn" onClick={() => { navigator.clipboard?.writeText(text); toast('Copied'); }}>Copy to clipboard</button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal title={isNew ? 'Add a person' : `Edit ${user.name}`} onClose={onClose} footer={<><button className="btn lg" onClick={onClose}>Cancel</button><button className="btn primary lg" onClick={save} disabled={busy}><Save />{isNew ? 'Create account' : 'Save'}</button></>}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="grid-2">
          <Field label="Name" required hint="Can be used to sign in — must be unique"><input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} autoFocus /></Field>
          <Field label="Email" required><input className="input" type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></Field>
          <Field label="Badge number (optional)" hint="Click here and scan their badge, or type it (2–8 digits). Lets them sign in with one scan." className="span-2">
            <input className="input mono" value={d.badge} inputMode="numeric" autoComplete="off" placeholder="Scan or type" onChange={(e) => setD({ ...d, badge: e.target.value.replace(/\D/g, '').slice(0, 8) })}
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); /* scanners press Enter — don't submit the form */ }} />
          </Field>
        </div>
        <Field label="Access level">
          <div className="col" style={{ gap: '0.5rem' }}>
            {(['viewer', 'editor', 'admin'] as Role[]).map((r) => (
              <label key={r} className="card" style={{ display: 'flex', gap: '0.8rem', padding: '0.8rem 1rem', cursor: 'pointer', borderColor: d.role === r ? 'var(--primary)' : undefined, background: d.role === r ? 'var(--primary-soft)' : undefined }}>
                <input type="radio" name="role" checked={d.role === r} onChange={() => setD({ ...d, role: r })} style={{ width: '1.3rem', height: '1.3rem', accentColor: 'var(--primary)' }} />
                <div><b className="row" style={{ gap: 6 }}>{ROLE_INFO[r].icon}{ROLE_INFO[r].label}</b><div className="small muted">{ROLE_INFO[r].desc}</div></div>
              </label>
            ))}
          </div>
        </Field>
        {isNew || showPw ? (
          <Field label={isNew ? 'Password' : 'New password'} hint="At least 6 characters. You'll see it once after saving so you can pass it on.">
            <div className="row"><input className="input mono grow" value={d.password} onChange={(e) => setD({ ...d, password: e.target.value })} /><button type="button" className="btn" onClick={() => setD({ ...d, password: genPassword() })}><Wand2 size={18} />Generate</button></div>
          </Field>
        ) : <button type="button" className="btn" onClick={() => { setShowPw(true); setD({ ...d, password: genPassword() }); }}><KeyRound size={18} />Reset password</button>}
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
  const revoke = async (id: string) => { try { await api(`/admin/sessions/${id}`, { method: 'DELETE' }); load(); toast('Signed out that device'); } catch (e) { toastError(e); } };
  const demo = async () => {
    if (!(await confirmDialog({ title: 'Load demo data?', body: 'Adds sample parts, machines, suppliers, hot knives, rollers and ~10 months of usage so you can try everything. Only works while there are no parts yet.', confirm: 'Load demo data' }))) return;
    try { await api('/admin/demo', { method: 'POST' }); await loadBootstrap(); toast('Demo data loaded'); load(); } catch (e) { toastError(e); }
  };
  const device = (a: string) => /iPhone|Android/i.test(a) ? 'Phone' : /iPad|Tablet/i.test(a) ? 'Tablet' : /Windows/i.test(a) ? 'Windows PC' : /Mac/i.test(a) ? 'Mac' : 'Browser';
  const browser = (a: string) => /Edg\//.test(a) ? 'Edge' : /Chrome\//.test(a) ? 'Chrome' : /Firefox\//.test(a) ? 'Firefox' : /Safari\//.test(a) ? 'Safari' : '';
  return (
    <div className="stack">
      <div className="tiles">
        <div className="tile info"><span className="t-label"><Database size={18} />Database size</span><span className="t-value" style={{ fontSize: '1.6rem' }}>{bytes(info.dbBytes)}</span><span className="t-sub">of {bytes(info.limits.storageBytes)} free allowance ({(pct * 100).toFixed(pct < 0.01 ? 3 : 1)}%)</span></div>
        <div className="tile"><span className="t-label"><HardDrive size={18} />Photos</span><span className="t-value" style={{ fontSize: '1.6rem' }}>{bytes(info.imageBytes)}</span><span className="t-sub">{info.imageCount} photos</span></div>
        <div className="tile"><span className="t-label"><RotateCcw size={18} />Backups stored</span><span className="t-value" style={{ fontSize: '1.6rem' }}>{bytes(info.backupBytes)}</span><span className="t-sub">compressed snapshots</span></div>
        <div className="tile ok"><span className="t-label"><Users size={18} />Online now</span><span className="t-value">{info.online.length}</span><span className="t-sub">{info.connections} open screens</span></div>
      </div>
      <div className="card card-pad">
        <div className="row" style={{ justifyContent: 'space-between' }}><b>Storage used</b><span className="muted">{bytes(info.dbBytes)} / {bytes(info.limits.storageBytes)}</span></div>
        <div className={`progress ${pct > 0.8 ? 'danger' : pct > 0.5 ? 'warn' : 'info'}`} style={{ height: '0.9rem', marginTop: 8 }}><div style={{ width: `${Math.max(0.5, pct * 100)}%` }} /></div>
        <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>{info.limits.note} Photos are compressed on upload (~150–300 KB each), so thousands fit comfortably.</p>
      </div>
      <div className="grid-cards">
        <div className="card">
          <div className="card-head"><h3>Records</h3><button className="btn sm" onClick={load}><RefreshCw size={16} />Refresh</button></div>
          <div className="card-body"><dl className="kv" style={{ margin: 0 }}>{Object.entries(info.counts).map(([k, v]) => <Fragment key={k}><dt style={{ textTransform: 'capitalize' }}>{k}</dt><dd>{v.toLocaleString()}</dd></Fragment>)}</dl></div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Signed-in devices</h3></div>
          <div className="list" style={{ maxHeight: 420, overflowY: 'auto' }}>
            {info.sessions.map((s) => (
              <div key={s.id} className="list-item">
                <div className="grow"><b>{s.userName || '?'}</b> <span className="muted">· {device(s.agent)} {browser(s.agent)}</span><div className="small muted">last active {timeAgo(s.lastUsed)} · signed in {fmtDateTime(s.createdAt)}</div></div>
                <button className="btn sm" onClick={() => revoke(s.id)} title="Sign this device out"><LogOut size={16} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="card card-pad row wrap" style={{ justifyContent: 'space-between' }}>
        <div><b>Try it with demo data</b><div className="small muted">Fills an empty database with realistic sample data.</div></div>
        <button className="btn" onClick={demo} disabled={partsCount > 0}>{partsCount > 0 ? 'Only available when empty (use Erase all data below first)' : 'Load demo data'}</button>
      </div>
      <div className="card card-pad stack" style={{ borderColor: 'var(--danger-border)' }}>
        <h3 style={{ color: 'var(--danger)' }}><AlertTriangle size={20} style={{ verticalAlign: -4 }} /> Danger zone</h3>
        <div className="row wrap" style={{ justifyContent: 'space-between' }}>
          <div><b>Erase all data</b><div className="small muted">Deletes every part, photo, stock history, PM, knife, roller, order guide, machine and supplier. User accounts, settings and backups are kept.</div></div>
          <button className="btn danger" onClick={() => setErasing(true)}><Trash2 size={18} />Erase all data…</button>
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
  const counts = useMemo(() => ({ parts: Object.keys(docs.parts).length, pms: Object.keys(docs.pms).length, eq: Object.keys(docs.equipment).length, orders: Object.keys(docs.orders).length }), [docs]);
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
    const t = setInterval(() => setWait((w) => (w > 0 ? w - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [step]);

  const erase = async () => {
    setBusy(true); setErr('');
    try {
      await api('/admin/erase', { body: { password: pw, confirm: phrase }, timeout: 120000 });
      await loadBootstrap();
      toast('All data erased', 'success', 'A backup was saved first (Admin → Backups → “Before erase”). You can load demo data now.');
      onDone();
    } catch (e) { setErr(errorMessage(e)); setStep(4); } finally { setBusy(false); }
  };

  const canNext = step === 1 ? true : step === 2 ? ack.a && ack.b && ack.c : step === 3 ? phrase === ERASE_PHRASE : step === 4 ? pw.length > 0 : wait === 0;
  return (
    <Modal title={`Erase all data — step ${step} of 5`} onClose={onClose} icon={<AlertTriangle color="var(--danger)" />}
      footer={<>
        <span className="left">{[1, 2, 3, 4, 5].map((n) => <span key={n} className="dot" style={{ marginRight: 6, background: n <= step ? 'var(--danger)' : 'var(--border-strong)' }} />)}</span>
        <button className="btn lg" onClick={step === 1 ? onClose : () => setStep(step - 1)} disabled={busy}>{step === 1 ? 'Cancel' : 'Back'}</button>
        {step < 5
          ? <button className="btn lg danger" onClick={() => setStep(step + 1)} disabled={!canNext}>Continue</button>
          : <button className="btn lg danger" onClick={erase} disabled={!canNext || busy}><Trash2 />{busy ? 'Erasing…' : wait > 0 ? `Erase everything (${wait})` : 'Erase everything now'}</button>}
      </>}>
      {step === 1 && (
        <div className="stack">
          <div className="banner danger"><AlertTriangle />This wipes the database clean.</div>
          <p style={{ margin: 0 }}>These will be <b>permanently deleted</b> for everyone, on every screen:</p>
          <ul style={{ margin: 0, paddingLeft: '1.3rem', lineHeight: 1.7 }}>
            <li><b>{counts.parts}</b> parts, their photos and all stock history</li>
            <li><b>{counts.pms}</b> PM entries and every machine</li>
            <li><b>{counts.eq}</b> hot knives and rollers</li>
            <li><b>{counts.orders}</b> order guides, the activity log and notifications</li>
            <li>Your suppliers and manufacturers (reset to the built-in list)</li>
          </ul>
          <p className="muted" style={{ margin: 0 }}><b>Kept:</b> user accounts, passwords, app settings, print layout and backups.</p>
        </div>
      )}
      {step === 2 && (
        <div className="stack">
          <p style={{ margin: 0 }}>Tick each box to confirm you understand:</p>
          <label className="check"><input type="checkbox" checked={ack.a} onChange={(e) => setAck({ ...ack, a: e.target.checked })} />Everyone using the app will lose this data immediately.</label>
          <label className="check"><input type="checkbox" checked={ack.b} onChange={(e) => setAck({ ...ack, b: e.target.checked })} />Only a backup can bring it back (one is saved automatically right before erasing).</label>
          <label className="check"><input type="checkbox" checked={ack.c} onChange={(e) => setAck({ ...ack, c: e.target.checked })} />I really want to erase all data.</label>
        </div>
      )}
      {step === 3 && (
        <div className="stack">
          <Field label={<>Type <b className="mono" style={{ color: 'var(--danger)' }}>{ERASE_PHRASE}</b> to confirm</>}>
            <input className="input mono" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoFocus autoComplete="off" placeholder={ERASE_PHRASE} />
          </Field>
          {phrase && phrase !== ERASE_PHRASE && <div className="small muted">Must match exactly, in capitals.</div>}
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
          <h2>Last chance</h2>
          <p style={{ margin: 0 }}>Clicking the red button erases everything right away. A backup is saved first and appears under <b>Admin → Backups</b> as <b>“Before erase”</b>.</p>
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
  const create = async () => { setBusy(true); try { await api('/admin/backups', { method: 'POST' }); toast('Backup created'); load(); } catch (e) { toastError(e); } finally { setBusy(false); } };
  const dl = async (b: BackupRow) => {
    try {
      const res = await fetch(`${serverUrl()}/api/admin/backups/${encodeURIComponent(b.id)}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error('Download failed');
      download(`ppip-backup-${b.id}.json`, await res.text(), 'application/json');
    } catch (e) { toastError(e); }
  };
  const restore = async (b: BackupRow) => {
    if (!(await confirmDialog({ title: 'Restore this backup?', body: <>Everything goes back to how it was on <b>{fmtDateTime(b.at)}</b>. Changes made since then are replaced. A safety backup of the current data is made first, so this can be undone.</>, confirm: 'Restore', danger: true }))) return;
    setBusy(true);
    try { await api(`/admin/backups/${encodeURIComponent(b.id)}/restore`, { method: 'POST', timeout: 120000 }); await loadBootstrap(); toast('Restored'); load(); } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  const del = async (b: BackupRow) => { try { await api(`/admin/backups/${encodeURIComponent(b.id)}`, { method: 'DELETE' }); load(); } catch (e) { toastError(e); } };
  const upload = async (f?: File) => {
    if (!f) return;
    let data: unknown;
    try { data = JSON.parse(await f.text()); } catch { toast('That file is not a valid backup', 'danger'); return; }
    if (!(await confirmDialog({ title: `Restore from “${f.name}”?`, body: 'All current data is replaced by the file. A safety backup of the current data is made first.', confirm: 'Restore', danger: true }))) return;
    setBusy(true);
    try { await api('/admin/restore', { body: data, timeout: 180000 }); await loadBootstrap(); toast('Restored from file'); load(); } catch (e) { toast('Restore failed', 'danger', errorMessage(e)); } finally { setBusy(false); }
  };
  if (!info) return <Spinner />;
  return (
    <div className="stack">
      <div className="card card-pad stack">
        <h3>How your data is protected</h3>
        <div className="row"><CheckCircle2 color="var(--ok)" /><span><b>Automatic daily backup</b> inside the database (last 21 days kept).</span></div>
        <div className="row"><CheckCircle2 color="var(--ok)" /><span><b>Cloudflare durable storage</b> — data is stored redundantly and never expires or sleeps.</span></div>
        <div className="row">{info.offsiteBackupConfigured ? <CheckCircle2 color="var(--ok)" /> : <AlertTriangle color="var(--warn)" />}<span><b>Off-site nightly copy to your private GitHub repo</b> — {info.offsiteBackupConfigured ? 'backup key is set (see the “Nightly backup” GitHub Action for results).' : 'not set up yet. See docs/SETUP.md, step “Off-site backups”.'}</span></div>
        <div className="row"><CheckCircle2 color="var(--ok)" /><span><b>Download a copy any time</b> with the buttons below or from Import / Export.</span></div>
      </div>
      <div className="row wrap">
        <button className="btn primary lg" onClick={create} disabled={busy}><Plus />Back up now</button>
        <label className="btn lg" style={{ cursor: 'pointer' }}><Upload />Restore from a file<input type="file" accept=".json" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} /></label>
        {busy && <Spinner />}
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>When</th><th>Type</th><th>Contents</th><th className="num">Size</th><th /></tr></thead>
          <tbody>
            {info.backups.map((b) => {
              const c = JSON.parse(b.counts || '{}');
              return (
                <tr key={b.id}>
                  <td><b>{fmtDateTime(b.at)}</b><div className="small muted">{timeAgo(b.at)}</div></td>
                  <td><span className={`pill ${b.reason === 'auto' ? 'neutral' : b.reason === 'manual' ? 'info' : 'warn'}`}>{b.reason === 'auto' ? 'Daily' : b.reason === 'manual' ? 'Manual' : b.reason === 'pre-erase' ? 'Before erase' : 'Before restore'}</span></td>
                  <td className="small">{c.parts ?? '?'} parts · {c.equipment ?? 0} knives/rollers · {c.orders ?? 0} orders · {c.movements ?? 0} history rows</td>
                  <td className="num">{bytes(b.size)}</td>
                  <td><div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                    <button className="btn sm" onClick={() => dl(b)}><Download size={16} />Download</button>
                    <button className="btn sm" onClick={() => restore(b)} disabled={busy}><RotateCcw size={16} />Restore</button>
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
      const { companyName, department, weeklyReportDay, currency, publicUrl, badgeLogin } = d;
      await saveDoc('settings', 'app', { companyName, department, weeklyReportDay, currency, publicUrl, badgeLogin: badgeLogin !== false });
      toast('Settings saved');
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  return (
    <div className="stack" style={{ maxWidth: 900 }}>
      <div className="card card-pad grid-2">
        <Field label="Company / plant name"><input className="input" value={d.companyName || ''} onChange={(e) => set('companyName', e.target.value)} /></Field>
        <Field label="Department"><input className="input" value={d.department || ''} onChange={(e) => set('department', e.target.value)} /></Field>
        <Field label="Weekly report starts on">
          <select className="input" value={d.weeklyReportDay ?? 1} onChange={(e) => set('weeklyReportDay', Number(e.target.value))}>
            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((n, i) => <option key={n} value={i}>{n}</option>)}
          </select>
        </Field>
        <Field label="Currency"><select className="input" value={d.currency || 'USD'} onChange={(e) => set('currency', e.target.value)}>{['USD', 'CAD', 'EUR', 'GBP', 'MXN', 'AUD'].map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Website address" className="span-2" hint="Used in QR codes on labels and phone-photo links (important when running from USB). Leave blank to detect automatically.">
          <input className="input" value={d.publicUrl || ''} onChange={(e) => set('publicUrl', e.target.value)} placeholder={serverUrl() || location.origin} />
        </Field>
        <div className="span-2">
          <label className="check"><input type="checkbox" checked={d.badgeLogin !== false} onChange={(e) => set('badgeLogin', e.target.checked)} />Allow badge sign-in (scan an employee badge to sign in — no password)</label>
          <div className="small muted">Anyone holding a linked badge can sign in to that account, so keep this on only for computers in the plant. Badge numbers are set under Users.</div>
        </div>
      </div>
      <p className="muted">Categories, locations and units are edited under <a href="#/suppliers/lists">Suppliers & Lists → Dropdown lists</a>.</p>
      <div><button className="btn primary lg" onClick={save} disabled={busy}><Save />Save settings</button></div>
    </div>
  );
}

// ------------------------------------------------------------ print layout editor
function PrintTab() {
  const settings = useStore((s) => s.settings);
  const [t, setT] = useState<PrintTemplate>(() => ({ ...DEFAULT_PRINT_TEMPLATE, ...(settings.printTemplate || {}), columns: { ...DEFAULT_PRINT_TEMPLATE.columns, ...(settings.printTemplate?.columns || {}) } }));
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<'sample' | 'blank'>('sample');
  const set = <K extends keyof PrintTemplate>(k: K, v: PrintTemplate[K]) => setT({ ...t, [k]: v });
  const sample = useMemo(() => ({
    id: 'x', number: 'ORD-0042', title: 'Seal bar rebuild — Bag Machine 2', requestedBy: 'Nick', department: settings.department, dateNeeded: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10), machine: 'Bag Machine 2', priority: 'high' as const, status: 'draft' as const, vendor: 'McMaster-Carr', createdAt: Date.now(),
    items: [
      { name: 'Cartridge heater 1/2" x 6" 500W', partNumber: '3618K451', manufacturer: 'McMaster-Carr', vendor: 'McMaster-Carr', qty: 4, unitCost: 38.5, reason: 'Two failed, restock spares', url: 'https://www.mcmaster.com/3618K451' },
      { name: 'PTFE coated fiberglass tape 2"', partNumber: '76475A31', manufacturer: 'McMaster-Carr', vendor: 'McMaster-Carr', qty: 2, unit: 'roll', unitCost: 64.2, reason: 'Out of stock' },
      { name: 'Type J thermocouple 1/8" probe', partNumber: '3871K23', manufacturer: 'McMaster-Carr', vendor: 'McMaster-Carr', qty: 3, unitCost: 27.9, reason: 'Running low' },
    ], notes: 'Please expedite — line is running on last spare.',
  }), [settings.department]);
  const save = async () => { setBusy(true); try { await saveDoc('settings', 'app', { printTemplate: t }); toast('Print layout saved'); } catch (e) { toastError(e); } finally { setBusy(false); } };
  const colLabels: Record<keyof PrintTemplate['columns'], string> = { partNumber: 'Part #', manufacturer: 'Manufacturer', vendor: 'Supplier', unitCost: 'Unit cost', total: 'Line total', reason: 'Reason / why', link: 'Order link' };
  return (
    <div className="row top wrap" style={{ gap: '1.5rem' }}>
      <div className="card card-pad stack" style={{ flex: '1 1 340px', maxWidth: 480 }}>
        <h3><Printer size={19} style={{ verticalAlign: -3 }} /> Order guide layout</h3>
        <p className="small muted" style={{ margin: 0 }}>Changes show in the preview right away. Save when it looks right.</p>
        <Field label="Title"><input className="input" value={t.title} onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label="Subtitle"><input className="input" value={t.subtitle || ''} onChange={(e) => set('subtitle', e.target.value)} /></Field>
        <div className="grid-2">
          <Field label="Logo text"><input className="input" value={t.logoText || ''} onChange={(e) => set('logoText', e.target.value)} maxLength={10} /></Field>
          <Field label="Accent color"><input className="input" type="color" value={t.accent || '#1f5fbf'} onChange={(e) => set('accent', e.target.value)} style={{ padding: 4 }} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={!!t.showLogo} onChange={(e) => set('showLogo', e.target.checked)} />Show logo box</label>
        <Field label="Note at the top (optional)"><textarea className="input" value={t.headerNote || ''} onChange={(e) => set('headerNote', e.target.value)} /></Field>
        <Field label="Footer note"><input className="input" value={t.footerNote || ''} onChange={(e) => set('footerNote', e.target.value)} /></Field>
        <Field label="Columns">
          <div className="col" style={{ gap: 0 }}>
            {(Object.keys(colLabels) as (keyof PrintTemplate['columns'])[]).map((k) => (
              <label key={k} className="check" style={{ minHeight: '2.3rem' }}><input type="checkbox" checked={t.columns[k]} onChange={(e) => set('columns', { ...t.columns, [k]: e.target.checked })} />{colLabels[k]}</label>
            ))}
          </div>
        </Field>
        <Field label="Signature lines">
          <div className="col" style={{ gap: '0.4rem' }}>
            {t.signatures.map((s, i) => (
              <div key={i} className="row">
                <input className="input" value={s} onChange={(e) => set('signatures', t.signatures.map((x, j) => (j === i ? e.target.value : x)))} />
                <button type="button" className="btn icon" onClick={() => set('signatures', t.signatures.filter((_, j) => j !== i))} aria-label="Remove"><X size={18} /></button>
              </div>
            ))}
            {t.signatures.length < 4 && <button type="button" className="btn" onClick={() => set('signatures', [...t.signatures, 'Signature'])}><Plus size={18} />Add signature line</button>}
          </div>
        </Field>
        <Field label={`Text size on paper: ${Math.round((t.fontScale || 1) * 100)}%`}><input type="range" min={0.8} max={1.3} step={0.05} value={t.fontScale || 1} onChange={(e) => set('fontScale', Number(e.target.value))} /></Field>
        <div className="row wrap">
          <button className="btn primary lg" onClick={save} disabled={busy}><Save />Save layout</button>
          <button className="btn" onClick={() => setT({ ...DEFAULT_PRINT_TEMPLATE })}><RotateCcw size={18} />Reset to default</button>
        </div>
      </div>
      <div style={{ flex: '2 1 520px', minWidth: 0 }}>
        <div className="row" style={{ marginBottom: 8, justifyContent: 'space-between' }}><h3>Preview</h3><Seg value={preview} onChange={setPreview} options={[{ id: 'sample', label: 'Sample order' }, { id: 'blank', label: 'Blank form' }]} /></div>
        <div style={{ overflowX: 'auto' }}><OrderSheet order={preview === 'sample' ? sample : { items: [] }} tpl={t} settings={settings} blankRows={preview === 'blank' ? 10 : 2} /></div>
      </div>
    </div>
  );
}
