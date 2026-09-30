import { useState } from 'react';
import { Eye, EyeOff, LogIn, Package, Bell, Flame, Printer, Wifi, Server } from 'lucide-react';
import { login } from '../lib/store';
import { errorMessage, isFileMode, serverUrl, setServerUrl } from '../lib/api';
import { Field } from '../components/ui';

export function Login() {
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [server, setServer] = useState(serverUrl());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (isFileMode) {
      if (!/^https?:\/\//.test(server.trim())) { setErr('Enter the web address of your PPIP site (starts with https://).'); return; }
      setServerUrl(server);
    }
    setBusy(true);
    try { await login(name, pw); } catch (e2) { setErr(errorMessage(e2)); } finally { setBusy(false); }
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
            <li><Flame /> Hot knife and roller PM tracking</li>
            <li><Printer /> Typed, printable order guides</li>
            <li><Wifi /> Live on every screen — no refresh needed</li>
          </ul>
        </div>
        <div style={{ opacity: 0.75, fontSize: '0.9rem' }}>Private tool · accounts are created by an admin</div>
      </div>
      <div className="login-form">
        <form className="login-card card card-pad stack" onSubmit={submit} style={{ padding: '2rem' }}>
          <div>
            <h1>Sign in</h1>
            <p className="muted" style={{ marginTop: '0.4rem' }}>Use your email or your name, and your password.</p>
          </div>
          {isFileMode && (
            <Field label={<span className="row" style={{ gap: 6 }}><Server size={16} />Server address</span>} hint="Running from USB. This is the web address of your PPIP site.">
              <input className="input" value={server} onChange={(e) => setServer(e.target.value)} placeholder="https://ppip.yourname.workers.dev" />
            </Field>
          )}
          <Field label="Email or name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" autoFocus required style={{ minHeight: '3.1rem' }} />
          </Field>
          <Field label="Password">
            <div className="input-wrap">
              <input className="input" type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required style={{ minHeight: '3.1rem', paddingLeft: '0.8rem', paddingRight: '3rem' }} />
              <button type="button" className="btn icon ghost clear" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={20} /> : <Eye size={20} />}</button>
            </div>
          </Field>
          {err && <div className="banner danger">{err}</div>}
          <button className="btn primary lg block" disabled={busy}><LogIn size={20} />{busy ? 'Signing in…' : 'Sign in'}</button>
          <p className="small muted center" style={{ margin: 0 }}>Forgot your password? Ask an admin to reset it.</p>
        </form>
      </div>
    </div>
  );
}
