// Global app state + live sync (WebSocket) + offline queue.
import { useSyncExternalStore, useRef } from 'react';
import {
  DEFAULT_SETTINGS, type Activity, type AppNotification, type DocKind, type DocMap, type Part, type PublicUser, type Settings, type UserPrefs,
} from '../../../shared/types';
import { api, ApiError, errorMessage, getToken, NetworkError, safeGet, safeSet, setToken, setUnauthorizedHandler, wsUrl } from './api';

export type Docs = { [K in Exclude<DocKind, 'settings'>]: Record<string, DocMap[K]> };
export type ConnState = 'live' | 'connecting' | 'offline';

export interface Toast { id: number; title: string; body?: string; kind?: 'info' | 'success' | 'warn' | 'danger'; link?: string }
export interface OutboxItem { id: string; method: string; path: string; body?: unknown; desc: string; at: number }

export interface State {
  phase: 'boot' | 'login' | 'ready';
  me: (PublicUser & { prefs: UserPrefs }) | null;
  users: PublicUser[];
  settings: Settings;
  docs: Docs;
  notifications: AppNotification[];
  notifSeen: number;
  activity: Activity[];
  online: { id: string; name: string }[];
  conn: ConnState;
  outbox: OutboxItem[];
  toasts: Toast[];
  lastMovementAt: number;
  phoneUploads: Record<string, string>; // code -> imageId
  clockSkew: number;
}

const emptyDocs = (): Docs => ({ parts: {}, manufacturers: {}, vendors: {}, machines: {}, equipment: {}, orders: {}, pms: {} });

let state: State = {
  phase: 'boot', me: null, users: [], settings: DEFAULT_SETTINGS, docs: emptyDocs(), notifications: [], notifSeen: 0, activity: [],
  online: [], conn: 'connecting', outbox: loadOutbox(), toasts: [], lastMovementAt: 0, phoneUploads: {}, clockSkew: 0,
};
const listeners = new Set<() => void>();
export function getState() { return state; }
export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  listeners.forEach((l) => l());
  scheduleCache();
}
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

/** Subscribe to part of the state. Re-renders only when the selected value changes (shallow for arrays/objects by reference). */
export function useStore<T>(selector: (s: State) => T): T {
  const sel = useRef(selector);
  sel.current = selector;
  return useSyncExternalStore(subscribe, () => sel.current(state));
}
export function useDocs<K extends keyof Docs>(kind: K): Docs[K] {
  return useStore((s) => s.docs[kind]);
}

// ------------------------------------------------------------ roles
export const can = {
  edit: (s: State = state) => s.me?.role === 'editor' || s.me?.role === 'admin',
  admin: (s: State = state) => s.me?.role === 'admin',
};
export function useCanEdit() { return useStore((s) => can.edit(s)); }
export function useIsAdmin() { return useStore((s) => can.admin(s)); }

// ------------------------------------------------------------ toasts
let toastId = 1;
export function toast(title: string, kind: Toast['kind'] = 'success', body?: string, link?: string, ms = 4500) {
  const t: Toast = { id: toastId++, title, kind, body, link };
  setState((s) => ({ toasts: [...s.toasts.slice(-4), t] }));
  setTimeout(() => dismissToast(t.id), kind === 'danger' ? ms + 3000 : ms);
}
export function dismissToast(id: number) { setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })); }
export function toastError(e: unknown) { toast(errorMessage(e), 'danger'); }

// ------------------------------------------------------------ cache for instant start / offline
const CACHE_KEY = 'ppip.cache.v1';
let cacheTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleCache() {
  if (state.phase !== 'ready') return;
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    const { me, users, settings, docs, notifications, notifSeen, activity } = state;
    safeSet(CACHE_KEY, JSON.stringify({ me, users, settings, docs, notifications, notifSeen, activity }));
  }, 1500);
}
function loadCache(): Partial<State> | null {
  try { const raw = safeGet(CACHE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

// ------------------------------------------------------------ outbox (offline edits)
function loadOutbox(): OutboxItem[] {
  try { return JSON.parse(safeGet('ppip.outbox') || '[]'); } catch { return []; }
}
function saveOutbox(items: OutboxItem[]) { safeSet('ppip.outbox', JSON.stringify(items)); setState({ outbox: items }); }

/** Send a change to the server. If the network is down, queue it and apply `optimistic` locally. */
export async function mutate<T>(desc: string, method: string, path: string, body?: unknown, optimistic?: () => void): Promise<T | null> {
  try {
    return await api<T>(path, { method, body });
  } catch (e) {
    if (e instanceof NetworkError && optimistic) {
      optimistic();
      saveOutbox([...state.outbox, { id: crypto.randomUUID(), method, path, body, desc, at: Date.now() }]);
      setState({ conn: 'offline' });
      if (ws) { try { ws.close(); } catch { /* reconnect loop takes over */ } }
      toast('Saved on this device', 'warn', 'No connection right now — it will sync automatically when back online.');
      return null;
    }
    throw e;
  }
}
let flushing = false;
export async function flushOutbox() {
  if (flushing || !state.outbox.length) return;
  flushing = true;
  let sent = 0;
  try {
    while (state.outbox.length) {
      const item = state.outbox[0];
      try {
        await api(item.path, { method: item.method, body: item.body });
        sent++;
      } catch (e) {
        if (e instanceof NetworkError) break;
        toast(`Could not sync: ${item.desc}`, 'danger', errorMessage(e));
      }
      saveOutbox(state.outbox.slice(1));
    }
  } finally { flushing = false; }
  if (sent) toast(`Synced ${sent} offline change${sent > 1 ? 's' : ''}`, 'success');
}

// ------------------------------------------------------------ docs helpers
export function applyUpsert(kind: string, doc: { id: string }) {
  if (kind === 'settings') { setState({ settings: { ...DEFAULT_SETTINGS, ...(doc as Settings) } }); return; }
  setState((s) => ({ docs: { ...s.docs, [kind]: { ...(s.docs as Record<string, Record<string, unknown>>)[kind], [doc.id]: doc } } }));
}
export function applyDelete(kind: string, id: string) {
  setState((s) => {
    const next = { ...(s.docs as Record<string, Record<string, unknown>>)[kind] };
    delete next[id];
    return { docs: { ...s.docs, [kind]: next } };
  });
}

export async function saveDoc<K extends DocKind>(kind: K, id: string, patch: Partial<DocMap[K]>, desc = 'Save'): Promise<DocMap[K] | null> {
  const doc = await mutate<DocMap[K]>(desc, 'PUT', `/docs/${kind}/${id}`, { patch }, () => {
    const cur = kind === 'settings' ? state.settings : (state.docs as Record<string, Record<string, unknown>>)[kind][id];
    applyUpsert(kind, { ...(cur || {}), ...patch, id, updatedAt: Date.now(), updatedBy: state.me?.name } as { id: string });
  });
  if (doc) applyUpsert(kind, doc as { id: string });
  return doc;
}
export async function deleteDoc(kind: DocKind, id: string, desc = 'Delete') {
  await mutate(desc, 'DELETE', `/docs/${kind}/${id}`, undefined, () => applyDelete(kind, id));
  applyDelete(kind, id);
}
export async function adjustStock(part: Part, mode: 'use' | 'receive' | 'set', qty: number, machine?: string, note?: string) {
  const res = await mutate<Part>(`${mode} ${qty} × ${part.name}`, 'POST', `/parts/${part.id}/adjust`, { mode, qty, machine, note }, () => {
    const cur = state.docs.parts[part.id] || part;
    const next = mode === 'use' ? cur.qty - qty : mode === 'receive' ? cur.qty + qty : qty;
    applyUpsert('parts', { ...cur, qty: next, updatedAt: Date.now() } as Part);
  });
  if (res) applyUpsert('parts', res);
  return res;
}
export function newId() { return crypto.randomUUID(); }

// ------------------------------------------------------------ session lifecycle
setUnauthorizedHandler(() => { if (state.phase === 'ready') logout(false); });

export async function boot() {
  applyAppearance(null);
  if (!getToken()) { setState({ phase: 'login' }); return; }
  const cached = loadCache();
  if (cached?.me) {
    setState({ ...cached, docs: { ...emptyDocs(), ...(cached.docs || {}) }, settings: { ...DEFAULT_SETTINGS, ...(cached.settings || {}) }, phase: 'ready' } as Partial<State>);
    applyAppearance(state.me?.prefs || null);
  }
  try {
    await loadBootstrap();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) { logout(false); return; }
    if (!cached?.me) { setState({ phase: 'login' }); toast('Could not reach the server', 'danger', errorMessage(e)); return; }
    setState({ conn: 'offline' });
  }
  connect();
}

export async function loadBootstrap() {
  const b = await api<{
    me: State['me']; users: PublicUser[]; settings: Settings; docs: Record<string, { id: string }[]>; notifications: AppNotification[];
    notifSeen: number; activity: Activity[]; online: State['online']; serverTime: number;
  }>('/bootstrap');
  const docs = emptyDocs() as unknown as Record<string, Record<string, unknown>>;
  for (const [k, list] of Object.entries(b.docs)) docs[k] = Object.fromEntries(list.map((d) => [d.id, d]));
  // keep offline-queued changes visible until they sync
  setState({
    phase: 'ready', me: b.me, users: b.users, settings: { ...DEFAULT_SETTINGS, ...b.settings }, docs: docs as unknown as Docs,
    notifications: b.notifications, notifSeen: b.notifSeen, activity: b.activity, online: b.online, clockSkew: b.serverTime - Date.now(),
  });
  applyAppearance(b.me?.prefs || null);
}

export async function login(loginName: string, password: string) {
  const res = await api<{ token: string }>('/login', { body: { login: loginName, password, device: navigator.userAgent }, auth: false });
  setToken(res.token);
  await loadBootstrap();
  connect();
}

export function logout(callServer = true) {
  if (callServer) api('/logout', { method: 'POST' }).catch(() => {});
  setToken(null);
  safeSet(CACHE_KEY, null);
  disconnect();
  setState({ phase: 'login', me: null, docs: emptyDocs(), users: [], notifications: [], activity: [] });
}

// ------------------------------------------------------------ appearance
export function applyAppearance(prefs: UserPrefs | null) {
  const local = (() => { try { return JSON.parse(safeGet('ppip.prefs') || '{}') as UserPrefs; } catch { return {}; } })();
  const p = { ...local, ...(prefs || {}) };
  safeSet('ppip.prefs', JSON.stringify(p));
  const root = document.documentElement;
  // dark is the default
  const dark = p.theme !== 'light' && (p.theme !== 'system' || matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.size = p.textSize || 'standard';
}
export async function savePrefs(prefs: UserPrefs) {
  const me = state.me;
  if (!me) return;
  const next = { ...me.prefs, ...prefs };
  setState({ me: { ...me, prefs: next } });
  applyAppearance(next);
  try { await api('/me/prefs', { method: 'PATCH', body: prefs }); } catch { /* kept locally */ }
}

// ------------------------------------------------------------ live connection
let ws: WebSocket | null = null;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let pingTimer: ReturnType<typeof setInterval> | undefined;
let everConnected = false;
let wanted = false;

export function connect() {
  wanted = true;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  clearTimeout(retryTimer);
  setState({ conn: 'connecting' });
  let sock: WebSocket;
  try { sock = new WebSocket(wsUrl()); } catch { scheduleReconnect(); return; }
  ws = sock;
  sock.onopen = async () => {
    retry = 0;
    setState({ conn: 'live' });
    sock.send('hello');
    clearInterval(pingTimer);
    pingTimer = setInterval(() => { if (sock.readyState === WebSocket.OPEN) sock.send('ping'); }, 25000);
    await flushOutbox();
    if (everConnected) loadBootstrap().catch(() => {}); // catch up on anything missed while disconnected
    everConnected = true;
  };
  sock.onmessage = (ev) => {
    if (ev.data === 'pong') return;
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(ev.data as string); } catch { return; }
    handleMessage(msg);
  };
  sock.onclose = (ev) => {
    clearInterval(pingTimer);
    if (ws === sock) ws = null;
    if (ev.code === 4001) { toast('You were signed out', 'warn', 'Your account was changed by an admin.'); logout(false); return; }
    if (ev.code === 4002) { toast('Your permissions were updated', 'info'); loadBootstrap().catch(() => {}); }
    if (wanted) scheduleReconnect();
  };
  sock.onerror = () => { try { sock.close(); } catch { /* noop */ } };
}
function scheduleReconnect() {
  setState({ conn: navigator.onLine === false ? 'offline' : retry > 2 ? 'offline' : 'connecting' });
  const delay = [500, 1500, 3000, 5000, 10000, 15000][Math.min(retry++, 5)];
  clearTimeout(retryTimer);
  retryTimer = setTimeout(connect, delay);
}
export function disconnect() {
  wanted = false;
  clearTimeout(retryTimer);
  clearInterval(pingTimer);
  if (ws) { try { ws.close(1000); } catch { /* noop */ } ws = null; }
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { if (wanted) { retry = 0; connect(); flushOutbox(); } });
  // safety net: keep retrying queued offline changes
  setInterval(() => { if (wanted && state.outbox.length) flushOutbox(); }, 15000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wanted && (!ws || ws.readyState !== WebSocket.OPEN)) { retry = 0; connect(); }
  });
}

function handleMessage(msg: Record<string, unknown>) {
  switch (msg.t) {
    case 'upsert': applyUpsert(msg.kind as string, msg.doc as { id: string }); break;
    case 'delete': applyDelete(msg.kind as string, msg.id as string); break;
    case 'movement': setState({ lastMovementAt: Date.now() }); break;
    case 'activity': setState((s) => ({ activity: [msg.row as Activity, ...s.activity].slice(0, 60) })); break;
    case 'presence': setState({ online: msg.online as State['online'] }); break;
    case 'users': setState((s) => ({ users: s.me?.role === 'admin' ? mergeUsers(s.users, msg.users as PublicUser[]) : (msg.users as PublicUser[]) })); break;
    case 'reload': loadBootstrap().catch(() => {}); break;
    case 'tour': // an admin turned the guided tour on for this account
      if (state.me) setState({ me: { ...state.me, prefs: { ...state.me.prefs, tutorialDone: false } } });
      break;
    case 'phoneUpload': setState((s) => ({ phoneUploads: { ...s.phoneUploads, [msg.code as string]: msg.imageId as string } })); break;
    case 'notification': {
      const n = msg.row as AppNotification;
      setState((s) => ({ notifications: [n, ...s.notifications].slice(0, 100) }));
      toast(n.title, n.level === 'danger' ? 'danger' : n.level === 'warn' ? 'warn' : n.level === 'success' ? 'success' : 'info', n.body || undefined, n.link || undefined, 7000);
      if (state.me?.prefs?.desktopAlerts && document.visibilityState !== 'visible' && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification(n.title, { body: n.body || '', tag: n.id }); } catch { /* not supported */ }
      }
      break;
    }
  }
}
function mergeUsers(cur: PublicUser[], incoming: PublicUser[]) {
  const map = new Map(cur.map((u) => [u.id, u]));
  return incoming.map((u) => ({ ...(map.get(u.id) || {}), ...u }));
}

export async function markNotificationsSeen() {
  setState({ notifSeen: Date.now() + state.clockSkew });
  try { await api('/notifications/seen', { method: 'POST' }); } catch { /* ignore */ }
}
