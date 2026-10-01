import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, LogIn, Package, Bell, Flame, Printer, Wifi, Server, ScanLine, CheckCircle2 } from 'lucide-react';
import { login } from '../lib/store';
import { api, errorMessage, isFileMode, serverUrl, setServerUrl } from '../lib/api';
import { useBadgeScanner } from '../lib/badge';
import { Field, Spinner } from '../components/ui';

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
  const badgeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isFileMode && !serverUrl()) return;
    api<{ badgeLogin: boolean }>('/login-info', { auth: false }).then((r) => setBadgeOn(r.badgeLogin)).catch(() => {});
  }, []);

  const checkServer = () => {
    if (!isFileMode) return true;
    if (!/^https?:\/\//.test(server.trim())) { setErr('Enter the web address of your PPIP site (starts with https://).'); return false; }
    setServerUrl(server);
    return true;
  };

  const signInBadge = async (value: string) => {
    if (busy) return;
    setErr('');
    if (!checkServer()) return;
    setBusy('badge');
    try {
      await login('', '', value);
    } catch (e) {
      setErr(errorMessage(e));
      setBadge('');
      setBusy('');
      badgeRef.current?.focus();
    }
  };

  // A scan works anywhere on this screen — even if the cursor is in the name or password box.
  useBadgeScanner((value, typedInto) => {
    if (typedInto === nameRef.current) setName((v) => (v.endsWith(value) ? v.slice(0, -value.length) : v));
    if (typedInto === pwRef.current) setPw((v) => (v.endsWith(value) ? v.slice(0, -value.length) : v));
    setBadge(value);
    setWelcome('');
    signInBadge(value);
  }, badgeOn && !busy);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!checkServer()) return;
    setBusy('password');
    try { await login(name, pw); setWelcome(name); } catch (e2) { setErr(errorMessage(e2)); setBusy(''); }
  };

  return (
    <div className="login-wrap">
      <div className="login-art">
        <div className="row"><div className="brand-logo" style={{ background: 'rgba(255,255,255,.18)' }}>PPIP</div><b style={{ fontSize: '1.2rem' }}>Parts & PM</b></div>
        <div>
          <h1>Every part. Every machine.<br />Always up to date.</h1>
          <ul>
            <li><Package /> Find any part in seconds — see what's in stock</li>
            <li><Bell /> Automatic low-stock and out-of-stock alerts</li>
            <li><Flame /> Machine PMs, hot knives and rollers</li>
            <li><Printer /> Typed, printable order guides</li>
            <li><Wifi /> Live on every screen — no refresh needed</li>
          </ul>
        </div>
        <div style={{ opacity: 0.75, fontSize: '0.9rem' }}>Private tool · accounts are created by an admin</div>
      </div>
      <div className="login-form">
        <div className="login-card stack">
          {isFileMode && (
            <div className="card card-pad">
              <Field label={<span className="row" style={{ gap: 6 }}><Server size={16} />Server address</span>} hint="Running from USB. This is the web address of your PPIP site.">
                <input className="input" value={server} onChange={(e) => setServer(e.target.value)} placeholder="https://ppip.yourname.workers.dev" />
              </Field>
            </div>
          )}

          {badgeOn && (
            <form className="card card-pad stack badge-card" onSubmit={(e) => { e.preventDefault(); if (badge.trim()) signInBadge(badge.trim()); }} style={{ padding: '1.6rem' }}>
              <div className="row" style={{ gap: '1rem' }}>
                <div className={`badge-icon ${busy === 'badge' ? 'busy' : ''}`}>{busy === 'badge' ? <Spinner /> : <ScanLine size={34} />}</div>
                <div>
                  <h1 style={{ fontSize: '1.5rem' }}>Scan your badge</h1>
                  <div className="row small" style={{ gap: 6, marginTop: 4 }}>
                    {busy === 'badge' ? <span style={{ fontWeight: 700 }}>Signing in…</span> : <><span className="dot ok ready-pulse" /><span className="muted" style={{ fontWeight: 600 }}>Ready — just scan, no clicking needed</span></>}
                  </div>
                </div>
              </div>
              <Field label="Or type your badge number">
                <div className="row">
                  <input ref={badgeRef} className="input grow mono" value={badge} onChange={(e) => setBadge(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    inputMode="numeric" autoComplete="off" autoFocus placeholder="e.g. 10452" aria-label="Badge number" style={{ minHeight: '3.2rem', fontSize: '1.3rem', letterSpacing: '0.08em' }} />
                  <button className="btn primary lg" disabled={!!busy || badge.length < 2}><LogIn size={20} />Go</button>
                </div>
              </Field>
            </form>
          )}

          {badgeOn && <div className="or-divider"><span>or sign in with your name</span></div>}

          <form className="card card-pad stack" onSubmit={submitPassword} style={{ padding: '1.6rem' }}>
            {!badgeOn && <div><h1>Sign in</h1><p className="muted" style={{ marginTop: '0.4rem' }}>Use your email or your name, and your password.</p></div>}
            <Field label="Email or name">
              <input ref={nameRef} className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" autoFocus={!badgeOn} required style={{ minHeight: '3.1rem' }} />
            </Field>
            <Field label="Password">
              <div className="input-wrap">
                <input ref={pwRef} className="input" type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required style={{ minHeight: '3.1rem', paddingLeft: '0.8rem', paddingRight: '3rem' }} />
                <button type="button" className="btn icon ghost clear" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={20} /> : <Eye size={20} />}</button>
              </div>
            </Field>
            <button className={`btn ${badgeOn ? '' : 'primary'} lg block`} disabled={!!busy}><LogIn size={20} />{busy === 'password' ? 'Signing in…' : 'Sign in'}</button>
            <p className="small muted center" style={{ margin: 0 }}>Forgot your password? Ask an admin to reset it.</p>
          </form>

          {err && <div className="banner danger" role="alert">{err}</div>}
          {welcome && <div className="banner ok"><CheckCircle2 />Welcome!</div>}
        </div>
      </div>
    </div>
  );
}
