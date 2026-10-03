import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, LogIn, Package, Bell, Flame, Printer, Wifi, Server, ScanLine, CheckCircle2 } from 'lucide-react';
import { login } from '../lib/store';
import { api, errorMessage, isFileMode, serverUrl, setServerUrl } from '../lib/api';
import { cleanBadge, useBadgeCapture } from '../lib/badge';
import { Field, Spinner } from '../components/ui';
import { Logo, APP_NAME } from '../components/Logo';
import { LangSwitch } from '../components/LangSwitch';
import { AnnouncementBanner } from '../components/Announcements';
import { IDLE_FLAG } from '../components/IdleLogout';
import type { Announcement } from '../../../shared/types';
import { t } from '../lib/i18n';

export function Login() {
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [badge, setBadge] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<'' | 'badge' | 'password'>('');
  const [welcome, setWelcome] = useState('');
  const [err, setErr] = useState('');
  const [server, setServer] = useState(serverUrl());
  const [badgeOn, setBadgeOn] = useState(true);
  const [news, setNews] = useState<Announcement[]>([]);
  const [idleOut] = useState(() => { try { const v = sessionStorage.getItem(IDLE_FLAG); sessionStorage.removeItem(IDLE_FLAG); return Number(v) || 0; } catch { return 0; } });
  const badgeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isFileMode && !serverUrl()) return;
    api<{ badgeLogin: boolean; announcements?: Announcement[] }>('/login-info', { auth: false }).then((r) => { setBadgeOn(r.badgeLogin); setNews(r.announcements || []); }).catch(() => {});
  }, []);

  const checkServer = () => {
    if (!isFileMode) return true;
    if (!/^https?:\/\//.test(server.trim())) { setErr(t('Enter the web address of your Process Technician site (starts with https://).')); return false; }
    setServerUrl(server);
    return true;
  };

  const signInBadge = async (raw: string) => {
    const value = cleanBadge(raw);
    if (busy || !value) return;
    clearTimeout(idleTimer.current);
    setErr('');
    if (!checkServer()) return;
    setBusy('badge');
    try {
      await login('', '', value);
    } catch (e) {
      setErr(t(errorMessage(e)));
      setBadge('');
      setBusy('');
      badgeRef.current?.focus();
    }
  };

  // A scan works anywhere on this screen: with nothing focused it goes into the badge box;
  // a scanner burst that lands in the name or password box is moved over to the badge.
  const badgeVal = useRef('');
  badgeVal.current = badge;
  useBadgeCapture({
    enabled: badgeOn && !busy,
    badgeInput: badgeRef,
    appendToBadge: (ch) => setBadge((v) => (v + ch).slice(0, 40)),
    submitBadge: () => signInBadge(badgeVal.current),
    onScanIntoField: (value, field) => {
      if (field === nameRef.current) setName((v) => (v.endsWith(value) ? v.slice(0, -value.length) : v));
      if (field === pwRef.current) setPw((v) => (v.endsWith(value) ? v.slice(0, -value.length) : v));
      setBadge(value); setWelcome(''); signInBadge(value);
    },
  });

  // Scanners set up without an Enter at the end: if the whole ID arrived as one fast burst, sign in after a short pause.
  const keyTimes = useRef<number[]>([]);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onBadgeKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key.length !== 1) { if (e.key !== 'Shift') keyTimes.current = []; return; }
    const now = performance.now();
    const kt = keyTimes.current;
    if (kt.length && now - kt[kt.length - 1] > 60) keyTimes.current = [];
    keyTimes.current.push(now);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      // only when every character came in scanner-fast (people type much slower) and it filled the box
      if (keyTimes.current.length >= 3 && keyTimes.current.length >= badgeVal.current.length) signInBadge(badgeVal.current);
    }, 450);
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!checkServer()) return;
    setBusy('password');
    try { await login(name, pw); setWelcome(name); } catch (e2) { setErr(t(errorMessage(e2))); setBusy(''); }
  };

  return (
    <div className="login-wrap">
      <div className="login-art">
        <div className="row" style={{ gap: '0.8rem' }}><Logo size={52} /><b style={{ fontSize: '1.45rem', letterSpacing: '-0.01em' }}>{APP_NAME}</b></div>
        <div>
          <h1>{t('Every part. Every machine.')}<br />{t('Always up to date.')}</h1>
          <ul>
            <li><Package /> {t("Find any part in seconds — see what's in stock")}</li>
            <li><Bell /> {t('Automatic low-stock and out-of-stock alerts')}</li>
            <li><Flame /> {t('Machine PMs, hot knives, rollers and sonic welders')}</li>
            <li><Printer /> {t('Typed, printable order guides and labels')}</li>
            <li><Wifi /> {t('Live on every screen — no refresh needed')}</li>
          </ul>
        </div>
        <div style={{ opacity: 0.75, fontSize: '0.9rem' }}>{t('Private tool · accounts are created by an admin')}</div>
      </div>
      <div className="login-form">
        <div className="login-card stack">
          <div className="row mobile-login-brand" style={{ gap: '0.8rem', justifyContent: 'center' }}><Logo size={48} /><b style={{ fontSize: '1.4rem' }}>{APP_NAME}</b></div>
          <LangSwitch />
          {idleOut > 0 && <div className="banner info" role="status" data-testid="idle-out">{t('You were signed out after {n} minutes with no activity. Scan your badge or sign in again.', { n: idleOut })}</div>}
          {news.map((a) => <AnnouncementBanner key={a.id} a={a} />)}
          {isFileMode && (
            <div className="card card-pad">
              <Field label={<span className="row" style={{ gap: 6 }}><Server size={16} />{t('Server address')}</span>} hint="Running from USB. This is the web address of your Process Technician site.">
                <input className="input" value={server} onChange={(e) => setServer(e.target.value)} placeholder="https://ppip.yourname.workers.dev" />
              </Field>
            </div>
          )}

          {badgeOn && (
            <form className="card card-pad stack badge-card" onSubmit={(e) => { e.preventDefault(); signInBadge(badgeRef.current?.value ?? badge); /* read the box itself so the full scan is used */ }} style={{ padding: '1.6rem' }}>
              <div className="row" style={{ gap: '1rem' }}>
                <div className={`badge-icon ${busy === 'badge' ? 'busy' : ''}`}>{busy === 'badge' ? <Spinner /> : <ScanLine size={34} />}</div>
                <div>
                  <h1 style={{ fontSize: '1.5rem' }}>{t('Scan your badge')}</h1>
                  <div className="row small" style={{ gap: 6, marginTop: 4 }}>
                    {busy === 'badge' ? <span style={{ fontWeight: 700 }}>{t('Signing in…')}</span> : <><span className="dot ok ready-pulse" /><span className="muted" style={{ fontWeight: 600 }}>{t('Ready — just scan, no clicking needed')}</span></>}
                  </div>
                </div>
              </div>
              <Field label="Or type your badge ID">
                <div className="row">
                  <input ref={badgeRef} className="input grow mono" value={badge} onChange={(e) => setBadge(e.target.value.slice(0, 40))} onKeyDown={onBadgeKey}
                    autoComplete="off" autoCapitalize="off" spellCheck={false} autoFocus placeholder={t('e.g. 7A:018')} aria-label={t('Badge number')} style={{ minHeight: '3.2rem', fontSize: '1.3rem', letterSpacing: '0.08em' }} />
                  <button className="btn primary lg" disabled={!!busy || !badge.trim()}><LogIn size={20} />{t('Go')}</button>
                </div>
              </Field>
            </form>
          )}

          {badgeOn && <div className="or-divider"><span>{t('or sign in with your name')}</span></div>}

          <form className="card card-pad stack" onSubmit={submitPassword} style={{ padding: '1.6rem' }}>
            {!badgeOn && <div><h1>{t('Sign in')}</h1><p className="muted" style={{ marginTop: '0.4rem' }}>{t('Use your email or your name, and your password.')}</p></div>}
            <Field label="Email or name">
              <input ref={nameRef} className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" autoFocus={!badgeOn} required style={{ minHeight: '3.1rem' }} />
            </Field>
            <Field label="Password">
              <div className="input-wrap">
                <input ref={pwRef} className="input" type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required style={{ minHeight: '3.1rem', paddingLeft: '0.8rem', paddingRight: '3rem' }} />
                <button type="button" className="btn icon ghost clear" onClick={() => setShow(!show)} aria-label={show ? t('Hide password') : t('Show password')}>{show ? <EyeOff size={20} /> : <Eye size={20} />}</button>
              </div>
            </Field>
            <button className={`btn ${badgeOn ? '' : 'primary'} lg block`} disabled={!!busy}><LogIn size={20} />{busy === 'password' ? t('Signing in…') : t('Sign in')}</button>
            <p className="small muted center" style={{ margin: 0 }}>{t('Forgot your password? Ask an admin to reset it.')}</p>
          </form>

          {err && <div className="banner danger" role="alert">{err}</div>}
          {welcome && <div className="banner ok"><CheckCircle2 />{t('Welcome!')}</div>}
        </div>
      </div>
    </div>
  );
}
