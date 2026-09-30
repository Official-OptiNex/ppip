import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { boot } from './lib/store';
import { isFileMode } from './lib/api';

boot();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

if (!isFileMode && 'serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
