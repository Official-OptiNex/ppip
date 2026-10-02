import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { boot } from './lib/store';
import { isFileMode } from './lib/api';
import { useLang } from './lib/i18n';

/** Re-mount the app when the language changes so every screen redraws in the new language. */
function Root() {
  const lang = useLang();
  return <App key={lang} />;
}

boot();
createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);

if (!isFileMode && 'serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
