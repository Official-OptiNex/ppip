// "Install app" button: puts Process Technician on the desktop / taskbar / home screen with its own icon and window.
import { useState } from 'react';
import { MonitorDown, CheckCircle2 } from 'lucide-react';
import { browserKind, promptInstall, useInstall } from '../lib/install';
import { isFileMode } from '../lib/api';
import { t } from '../lib/i18n';
import { Modal, rich } from './ui';
import { APP_NAME, Logo } from './Logo';

const STEPS: Record<ReturnType<typeof browserKind>, string[]> = {
  edge: ['Click the **App available** icon at the right end of the address bar (or the **⋯** menu → **Apps** → **Install this site as an app**).', 'Click **Install**.'],
  chrome: ['Click the **Install** icon at the right end of the address bar (or the **⋮** menu → **Cast, save and share** → **Install page as app**).', 'Click **Install**.'],
  'safari-mac': ['In the menu bar click **File** → **Add to Dock**.', 'Click **Add**.'],
  ios: ['Tap the **Share** button (square with an arrow).', 'Tap **Add to Home Screen**, then **Add**.'],
  android: ['Tap the **⋮** menu at the top-right.', 'Tap **Install app** (or **Add to Home screen**).'],
  firefox: ['Firefox on a computer can’t install apps. Open this site in **Microsoft Edge** or **Google Chrome** and click **Install app** there.'],
  other: ['Open this site in **Microsoft Edge** or **Google Chrome**.', 'Click the **Install** icon at the right end of the address bar.'],
};

/** `variant="nav"`: a slim button for the sidebar; `variant="card"`: a box for My settings. */
export function InstallApp({ variant = 'nav' }: { variant?: 'nav' | 'card' }) {
  const { canPrompt, installed } = useInstall();
  const [help, setHelp] = useState(false);
  if (isFileMode) return null;
  if (installed && variant === 'nav') return null; // already running as the app
  const install = async () => { if (!(await promptInstall())) setHelp(true); };

  const button = (
    <button className={variant === 'nav' ? 'btn block ghost install-btn' : 'btn primary lg'} onClick={install} data-testid="install-app" disabled={installed}>
      {installed ? <CheckCircle2 size={20} /> : <MonitorDown size={20} />}
      {installed ? t('Installed') : t('Install app')}
    </button>
  );
  return (
    <>
      {variant === 'nav' ? button : (
        <div className="card card-pad row wrap" style={{ gap: '1rem' }}>
          <Logo size={56} />
          <div className="grow" style={{ minWidth: 220 }}>
            <b style={{ fontSize: '1.15rem' }}>{t('Install {app} as an app', { app: APP_NAME })}</b>
            <div className="muted">{t('Opens from your desktop, taskbar or home screen in its own window — no browser tabs, and it starts faster.')}</div>
          </div>
          {button}
        </div>
      )}
      {help && (
        <Modal title={t('Install {app} as an app', { app: APP_NAME })} icon={<MonitorDown />} onClose={() => setHelp(false)}
          footer={<button className="btn primary lg" onClick={() => setHelp(false)}>{t('Got it')}</button>}>
          <div className="stack">
            {!canPrompt && <p className="muted" style={{ margin: 0 }}>{t('Your browser needs two quick steps:')}</p>}
            <ol className="install-steps">{STEPS[browserKind()].map((s) => <li key={s}>{rich(s)}</li>)}</ol>
            <p className="muted small" style={{ margin: 0 }}>{t('Afterwards it shows up with the {app} icon like any other program. Your sign-in and settings stay the same.', { app: APP_NAME })}</p>
          </div>
        </Modal>
      )}
    </>
  );
}
