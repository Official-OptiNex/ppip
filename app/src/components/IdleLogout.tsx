// Signs people out after a while with no activity (Admin → Settings), so the next person at a shared
// plant computer doesn't work under the wrong name. A warning with a countdown shows for the last minute.
import { useEffect, useState } from 'react';
import { LogOut, Clock } from 'lucide-react';
import { logout, useStore } from '../lib/store';
import { safeGet, safeSet } from '../lib/api';
import { t } from '../lib/i18n';
import { Modal } from './ui';

export const IDLE_DEFAULT = 15;
const LAST = 'ppip.lastActive'; // shared by every tab of this browser
const WARN_MS = 60_000;
export const IDLE_FLAG = 'ppip.idleOut'; // tells the sign-in screen why it is showing

const lastActive = () => Number(safeGet(LAST)) || Date.now();
const touch = () => safeSet(LAST, String(Date.now()));

export function IdleLogout() {
  const mins = useStore((s) => s.settings.idleLogoutMin ?? IDLE_DEFAULT);
  const [left, setLeft] = useState<number | null>(null); // ms until sign-out, while warning

  useEffect(() => {
    if (!mins) return;
    touch();
    let lastWrite = 0;
    const onActivity = () => { const now = Date.now(); if (now - lastWrite > 5000) { lastWrite = now; touch(); } };
    const evs = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
    for (const e of evs) window.addEventListener(e, onActivity, { passive: true, capture: true });
    const check = () => {
      const remaining = lastActive() + mins * 60_000 - Date.now();
      if (remaining <= 0) {
        try { sessionStorage.setItem(IDLE_FLAG, String(mins)); } catch { /* ignore */ }
        logout();
      } else setLeft(remaining <= WARN_MS ? remaining : null);
    };
    const timer = setInterval(check, 1000);
    return () => { clearInterval(timer); for (const e of evs) window.removeEventListener(e, onActivity, { capture: true }); };
  }, [mins]);

  if (!mins || left == null) return null;
  const secs = Math.ceil(left / 1000);
  const stay = () => { touch(); setLeft(null); };
  return (
    <Modal title={<span className="row" style={{ gap: 8 }}><Clock />{t('Still there?')}</span>} onClose={stay}
      footer={<><button className="btn lg" onClick={() => logout()}><LogOut />{t('Sign out now')}</button><button className="btn primary lg" onClick={stay} autoFocus>{t('Stay signed in')}</button></>}>
      <p style={{ fontSize: '1.2rem', margin: 0 }}>{t('You will be signed out in {n} seconds because nobody has used this screen for a while.', { n: secs })}</p>
    </Modal>
  );
}
