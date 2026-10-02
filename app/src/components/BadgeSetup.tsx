// Linking an employee badge to your own account, plus the reminder bar shown until you do.
import { useRef, useState } from 'react';
import { ScanLine, X, IdCard } from 'lucide-react';
import { api, errorMessage, safeGet, safeSet } from '../lib/api';
import { setState, toast, useStore } from '../lib/store';
import { cleanBadge, maskBadge } from '../lib/badge';
import { Field, Modal } from './ui';

export function BadgeDialog({ onClose }: { onClose: () => void }) {
  const me = useStore((s) => s.me);
  const [badge, setBadge] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const save = async (raw = inputRef.current?.value ?? badge) => {
    const value = cleanBadge(raw);
    if (!value) { setErr('Scan your badge or type the ID.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await api<{ badge: string | null }>('/me/badge', { method: 'PUT', body: { badge: value } });
      if (me) setState({ me: { ...me, badge: r.badge } });
      toast('Badge linked', 'success', 'Next time, just scan your badge at the sign-in screen.');
      onClose();
    } catch (e) { setErr(errorMessage(e)); setBadge(''); } finally { setBusy(false); }
  };
  return (
    <Modal title="Link your badge" icon={<IdCard color="var(--primary)" />} onClose={onClose}
      footer={<><button className="btn lg" onClick={onClose}>Cancel</button><button className="btn primary lg" onClick={() => save()} disabled={busy || !badge.trim()}>{busy ? 'Saving…' : 'Save badge'}</button></>}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="row" style={{ gap: '1rem' }}>
          <div className="badge-icon"><ScanLine size={32} /></div>
          <div style={{ fontSize: '1.05rem' }}><b>Scan your badge now</b>, or type the number. After this you can sign in on any computer with one scan.</div>
        </div>
        <Field label="Badge ID">
          <input ref={inputRef} className="input mono" value={badge} autoFocus autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="Scan or type (e.g. 7A:018)"
            onChange={(e) => setBadge(e.target.value.slice(0, 40))} style={{ minHeight: '3.2rem', fontSize: '1.3rem', letterSpacing: '0.08em' }} />
        </Field>
        {err && <div className="banner danger">{err}</div>}
      </form>
    </Modal>
  );
}

const snoozeKey = (id: string) => `ppip.badgeNotice.${id}`;

/** Slim bar at the top of every page for people who haven't linked a badge yet. */
export function BadgeNotice() {
  const me = useStore((s) => s.me);
  const enabled = useStore((s) => s.settings.badgeLogin !== false);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => (me ? Number(safeGet(snoozeKey(me.id)) || 0) > Date.now() : false));
  if (!me || me.badge || !enabled || hidden) return open ? <BadgeDialog onClose={() => setOpen(false)} /> : null;
  return (
    <>
      <div className="notice-bar no-print" role="status">
        <IdCard size={22} color="var(--primary)" />
        <span className="grow"><b>Tip:</b> link your employee badge, then you can sign in with one scan.</span>
        <button className="btn primary sm" onClick={() => setOpen(true)}><ScanLine size={16} />Add my badge</button>
        <button className="btn ghost sm" onClick={() => { safeSet(snoozeKey(me.id), String(Date.now() + 7 * 86_400_000)); setHidden(true); }} aria-label="Hide for a week"><X size={16} />Not now</button>
      </div>
      {open && <BadgeDialog onClose={() => setOpen(false)} />}
    </>
  );
}

/** Badge card for the My settings page. */
export function BadgeCard() {
  const me = useStore((s) => s.me);
  const enabled = useStore((s) => s.settings.badgeLogin !== false);
  const [open, setOpen] = useState(false);
  if (!me) return null;
  const remove = async () => {
    try { await api('/me/badge', { method: 'PUT', body: { badge: null } }); setState({ me: { ...me, badge: null } }); toast('Badge removed'); } catch (e) { toast(errorMessage(e), 'danger'); }
  };
  return (
    <div className="card card-pad row wrap" style={{ justifyContent: 'space-between' }}>
      <div>
        <b>Badge sign-in</b>
        <div className="small muted">{!enabled ? 'Turned off by an admin.' : me.badge ? <>Linked badge: <span className="mono">{maskBadge(me.badge)}</span> — scan it at the sign-in screen.</> : 'No badge linked yet.'}</div>
      </div>
      {enabled && <div className="btn-group">
        <button className="btn lg" onClick={() => setOpen(true)}><ScanLine />{me.badge ? 'Change badge' : 'Add my badge'}</button>
        {me.badge && <button className="btn lg danger-ghost" onClick={remove}>Remove</button>}
      </div>}
      {open && <BadgeDialog onClose={() => setOpen(false)} />}
    </div>
  );
}
