import { useState } from 'react';
import { LogOut, KeyRound, Sun, Moon, Monitor, Bell, Save } from 'lucide-react';
import { api, errorMessage, isFileMode } from '../lib/api';
import { logout, savePrefs, toast, useStore } from '../lib/store';
import { avatarColor, initials } from '../lib/util';
import { Field } from '../components/ui';

export function ProfilePage() {
  const me = useStore((s) => s.me)!;
  const prefs = me.prefs || {};
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const changePw = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (next !== again) { setErr('The new passwords do not match.'); return; }
    setBusy(true);
    try { await api('/me/password', { body: { current: cur, next } }); toast('Password changed'); setCur(''); setNext(''); setAgain(''); } catch (e2) { setErr(errorMessage(e2)); } finally { setBusy(false); }
  };
  const alerts = async (on: boolean) => {
    if (on && 'Notification' in window && Notification.permission !== 'granted') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') { toast('Your browser blocked notifications', 'warn', 'Allow notifications for this site in the browser settings.'); return; }
    }
    savePrefs({ desktopAlerts: on });
  };

  const sizes = [{ id: 'standard', label: 'Standard', px: 17 }, { id: 'large', label: 'Large', px: 19 }, { id: 'xlarge', label: 'Extra large', px: 21 }] as const;
  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <div className="row" style={{ gap: '1rem' }}>
        <span className="avatar" style={{ width: '4rem', height: '4rem', fontSize: '1.4rem', background: avatarColor(me.name) }}>{initials(me.name)}</span>
        <div><h1>{me.name}</h1><div className="muted">{me.email} · <span style={{ textTransform: 'capitalize' }}>{me.role}</span></div></div>
      </div>

      <div className="card card-pad stack">
        <h2>Text size</h2>
        <p className="muted" style={{ margin: 0 }}>Makes everything bigger or smaller on this account. Saved for you on every computer.</p>
        <div className="grid-3">
          {sizes.map((s) => (
            <button key={s.id} className={`btn lg ${(prefs.textSize || 'standard') === s.id ? 'primary' : ''}`} onClick={() => savePrefs({ textSize: s.id })} style={{ flexDirection: 'column', minHeight: '5.5rem' }}>
              <span style={{ fontSize: s.px * 1.4, lineHeight: 1 }}>Aa</span><span>{s.label}</span>
            </button>
          ))}
        </div>
        <h2 style={{ marginTop: '0.6rem' }}>Appearance</h2>
        <div className="grid-3">
          {([['light', 'Light', <Sun key="s" />], ['dark', 'Dark', <Moon key="m" />], ['system', 'Match computer', <Monitor key="c" />]] as const).map(([id, label, icon]) => (
            <button key={id} className={`btn lg ${(prefs.theme || 'light') === id ? 'primary' : ''}`} onClick={() => savePrefs({ theme: id })}>{icon}{label}</button>
          ))}
        </div>
        <h2 style={{ marginTop: '0.6rem' }}>Pop-up alerts</h2>
        <label className="check"><input type="checkbox" checked={!!prefs.desktopAlerts} onChange={(e) => alerts(e.target.checked)} /><Bell size={18} />Show a Windows / phone notification for low-stock alerts when this tab is in the background</label>
      </div>

      <form className="card card-pad stack" onSubmit={changePw}>
        <h2><KeyRound size={20} style={{ verticalAlign: -3 }} /> Change password</h2>
        <div className="grid-3">
          <Field label="Current password"><input className="input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" required /></Field>
          <Field label="New password"><input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={6} required /></Field>
          <Field label="New password again"><input className="input" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" required /></Field>
        </div>
        {err && <div className="banner danger">{err}</div>}
        <div><button className="btn primary" disabled={busy}><Save size={18} />Change password</button></div>
      </form>

      <div className="card card-pad row wrap" style={{ justifyContent: 'space-between' }}>
        <div><b>Sign out</b><div className="small muted">{isFileMode ? 'Running from USB.' : 'Signs out on this device only.'}</div></div>
        <button className="btn danger-ghost lg" onClick={() => logout()}><LogOut />Sign out</button>
      </div>
    </div>
  );
}
