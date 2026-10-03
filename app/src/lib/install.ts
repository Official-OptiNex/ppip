// "Install as an app": Chrome / Edge offer a one-click install prompt; other browsers get short instructions.
import { useSyncExternalStore } from 'react';

interface InstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallPromptEvent | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const isInstalled = () =>
  matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: minimal-ui)').matches || (navigator as { standalone?: boolean }).standalone === true;

/** Call once at start-up, before the browser fires its install event. */
export function listenForInstall() {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallPromptEvent; emit(); });
  window.addEventListener('appinstalled', () => { deferred = null; emit(); });
}

/** Opens the browser's install window. Returns false when this browser has none (show instructions instead). */
export async function promptInstall() {
  if (!deferred) return false;
  const e = deferred;
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === 'accepted') deferred = null;
  emit();
  return true;
}

export function useInstall() {
  const canPrompt = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => !!deferred);
  return { canPrompt, installed: isInstalled() };
}

/** Which instructions to show when there is no install prompt. */
export function browserKind(): 'edge' | 'chrome' | 'safari-mac' | 'ios' | 'android' | 'firefox' | 'other' {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Edg\//.test(ua)) return 'edge';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Chrome\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua) && /Macintosh/.test(ua)) return 'safari-mac';
  return 'other';
}
