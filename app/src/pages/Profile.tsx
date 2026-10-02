import { useState } from 'react';
import { startTour } from '../components/Tour';
import { BadgeCard } from '../components/BadgeSetup';
import { GraduationCap, LogOut, KeyRound, Sun, Moon, Monitor, Bell, Save, Languages, Camera } from 'lucide-react';
import { api, errorMessage, isFileMode } from '../lib/api';
import { logout, savePrefs, setState, toast, toastError, useStore, getState } from '../lib/store';
import { t } from '../lib/i18n';
import { Avatar, Field } from '../components/ui';
import { ImagePicker } from '../components/ImagePicker';
import { LangSwitch } from '../components/LangSwitch';
import { roleName } from '../components/Layout';

/** Save my profile picture (or remove it with null). */
export async function saveMyAvatar(id: string | null) {
  try {
    const r = await api<{ avatar: string | null }>('/me/avatar', { method: 'PUT', body: { image: id } });
    const me = getState().me;
    if (me) setState({ me: { ...me, avatar: r.avatar }, users: getState().users.map((u) => (u.id === me.id ? { ...u, avatar: r.avatar } : u)) });
    toast(id ? t('Profile picture saved') : t('Profile picture removed'));
  } catch (e) { toastError(e); }
}

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
    if (next !== again) { setErr(t('The new passwords do not match.')); return; }
    setBusy(true);
    try { await api('/me/password', { body: { current: cur, next } }); toast(t('Password changed')); setCur(''); setNext(''); setAgain(''); } catch (e2) { setErr(t(errorMessage(e2))); } finally { setBusy(false); }
  };
  const alerts = async (on: boolean) => {
    if (on && 'Notification' in window && Notification.permission !== 'granted') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') { toast(t('Your browser blocked notifications'), 'warn', t('Allow notifications for this site in the browser settings.')); return; }
    }
    savePrefs({ desktopAlerts: on });
  };

  const sizes = [{ id: 'standard', label: 'Standard', px: 17 }, { id: 'large', label: 'Large', px: 19 }, { id: 'xlarge', label: 'Extra large', px: 21 }] as const;
  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <div className="row" style={{ gap: '1rem' }}>
        <Avatar name={me.name} image={me.avatar} size={72} />
        <div><h1>{me.name}</h1><div className="muted">{me.email} · {t(roleName(me.role))}</div></div>
      </div>

      <div className="card card-pad stack" data-tour="language">
        <h2><Languages size={22} style={{ verticalAlign: -4 }} /> {t('Language')} / Idioma</h2>
        <p className="muted" style={{ margin: 0 }}>{t('Saved to your account, so every computer shows it in your language.')}</p>
        <LangSwitch big />
      </div>

      <div className="card card-pad stack" data-tour="text-size">
        <h2>{t('Text size')}</h2>
        <p className="muted" style={{ margin: 0 }}>{t('Makes everything bigger or smaller on this account. Saved for you on every computer.')}</p>
        <div className="grid-3">
          {sizes.map((s) => (
            <button key={s.id} className={`btn lg ${(prefs.textSize || 'standard') === s.id ? 'primary' : ''}`} onClick={() => savePrefs({ textSize: s.id })} style={{ flexDirection: 'column', minHeight: '5.5rem' }}>
              <span style={{ fontSize: s.px * 1.4, lineHeight: 1 }}>Aa</span><span>{t(s.label)}</span>
            </button>
          ))}
        </div>
        <h2 style={{ marginTop: '0.6rem' }}>{t('Appearance')}</h2>
        <div className="grid-3">
          {([['light', 'Light', <Sun key="s" />], ['dark', 'Dark', <Moon key="m" />], ['system', 'Match computer', <Monitor key="c" />]] as const).map(([id, label, icon]) => (
            <button key={id} className={`btn lg ${(prefs.theme || 'dark') === id ? 'primary' : ''}`} onClick={() => savePrefs({ theme: id })}>{icon}{t(label)}</button>
          ))}
        </div>
        <h2 style={{ marginTop: '0.6rem' }}>{t('Pop-up alerts')}</h2>
        <label className="check"><input type="checkbox" checked={!!prefs.desktopAlerts} onChange={(e) => alerts(e.target.checked)} /><Bell size={18} />{t('Show a Windows / phone notification for low-stock alerts when this tab is in the background')}</label>
      </div>

      <div className="card card-pad stack" data-tour="photo">
        <h2><Camera size={22} style={{ verticalAlign: -4 }} /> {t('Profile picture')}</h2>
        <p className="muted" style={{ margin: 0 }}>{t('Shows next to your name so others can see who is online. Upload one from this PC or take one with your phone.')}</p>
        <ImagePicker value={me.avatar} onChange={saveMyAvatar} label={t('Profile picture: {name}', { name: me.name })} round purpose="avatar" />
      </div>

      <form className="card card-pad stack" onSubmit={changePw}>
        <h2><KeyRound size={20} style={{ verticalAlign: -3 }} /> {t('Change password')}</h2>
        <div className="grid-3">
          <Field label="Current password"><input className="input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" required /></Field>
          <Field label="New password"><input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={6} required /></Field>
          <Field label="New password again"><input className="input" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" required /></Field>
        </div>
        {err && <div className="banner danger">{err}</div>}
        <div><button className="btn primary" disabled={busy}><Save size={18} />{t('Change password')}</button></div>
      </form>

      <BadgeCard />

      <div className="card card-pad row wrap" style={{ justifyContent: 'space-between' }}>
        <div><b>{t('Guided tour')}</b><div className="small muted">{t('A 2-minute walk through the app.')}</div></div>
        <button className="btn lg" onClick={() => startTour()}><GraduationCap />{t('Take the tour')}</button>
      </div>

      <div className="card card-pad row wrap" style={{ justifyContent: 'space-between' }}>
        <div><b>{t('Sign out')}</b><div className="small muted">{isFileMode ? t('Running from USB.') : t('Signs out on this device only.')}</div></div>
        <button className="btn danger-ghost lg" onClick={() => logout()}><LogOut />{t('Sign out')}</button>
      </div>
    </div>
  );
}
