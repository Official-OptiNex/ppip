// HTTP client. Works both when served from the website and when opened from a USB stick (file://).

const BUILD_SERVER = (import.meta.env.VITE_SERVER_URL as string | undefined) || '';
export const isFileMode = typeof location !== 'undefined' && location.protocol === 'file:';

const LS = {
  token: 'ppip.token',
  server: 'ppip.server',
};

export function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function safeSet(key: string, value: string | null) {
  try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage blocked */ }
}

/** Base URL of the server ('' = same site). */
export function serverUrl(): string {
  if (isFileMode) return (safeGet(LS.server) || BUILD_SERVER).replace(/\/+$/, '');
  return ''; // website mode: same origin (the Vite dev server proxies /api during development)
}
export function setServerUrl(url: string) { safeSet(LS.server, url.trim().replace(/\/+$/, '')); }
export function defaultServerUrl() { return BUILD_SERVER; }
/** Public web address of the site (used for QR codes / phone links). */
export function publicSiteUrl(settingsUrl?: string) {
  if (!isFileMode) return location.origin + location.pathname.replace(/index\.html$/, '');
  return (settingsUrl || serverUrl() || '').replace(/\/+$/, '') + '/';
}

export const getToken = () => safeGet(LS.token);
export const setToken = (t: string | null) => safeSet(LS.token, t);

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: unknown) { super(message); }
}
export class NetworkError extends Error {
  constructor() { super('No connection to the server.'); }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) { onUnauthorized = fn; }
/** Called whenever the server says the change just made can be undone. */
let onUndoable: (u: { id: string; summary: string }) => void = () => {};
export function setUndoableHandler(fn: (u: { id: string; summary: string }) => void) { onUndoable = fn; }

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; form?: FormData; auth?: boolean; timeout?: number } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token && opts.auth !== false) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeout ?? 30000);
  let res: Response;
  try {
    res = await fetch(`${serverUrl()}/api${path}`, { method: opts.method || (body ? 'POST' : 'GET'), headers, body, signal: ctl.signal });
  } catch {
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 && opts.auth !== false && token) onUnauthorized();
  const type = res.headers.get('Content-Type') || '';
  const data = type.includes('application/json') ? await res.json().catch(() => null) : await res.text();
  if (!res.ok) throw new ApiError(res.status, (data && (data as { error?: string }).error) || `Request failed (${res.status})`, data);
  const undoId = res.headers.get('X-Undo-Id');
  if (undoId) onUndoable({ id: undoId, summary: decodeURIComponent(res.headers.get('X-Undo-Summary') || '') });
  return data as T;
}

export function imageUrl(id?: string | null, thumb = false) {
  if (!id) return '';
  return `${serverUrl()}/api/images/${id}${thumb ? '?thumb=1' : ''}`;
}

export function wsUrl() {
  const base = serverUrl() || location.origin;
  return `${base.replace(/^http/, 'ws')}/api/ws?token=${encodeURIComponent(getToken() || '')}`;
}

export function errorMessage(e: unknown) {
  if (e instanceof ApiError || e instanceof NetworkError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
