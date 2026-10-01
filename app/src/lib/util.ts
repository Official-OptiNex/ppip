// Small helpers: routing, formatting, CSV, images, downloads.
import { useEffect, useState } from 'react';
import { stockStatus, type Equipment, type Part, type Settings, type StockStatus } from '../../../shared/types';

// ------------------------------------------------------------ hash router (works on file:// too)
export interface Route { path: string; parts: string[]; query: URLSearchParams }
function readRoute(): Route {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { path, parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs || '') };
}
export function useRoute(): Route {
  const [r, setR] = useState(readRoute);
  useEffect(() => {
    const on = () => setR(readRoute());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}
export function navigate(to: string, replace = false) {
  const h = to.startsWith('#') ? to : `#${to}`;
  if (replace) history.replaceState(null, '', h); else location.hash = h;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}
export function setQuery(params: Record<string, string | null | undefined>) {
  const r = readRoute();
  for (const [k, v] of Object.entries(params)) { if (v == null || v === '') r.query.delete(k); else r.query.set(k, v); }
  const qs = r.query.toString();
  navigate(`${r.path}${qs ? `?${qs}` : ''}`, true);
}

// ------------------------------------------------------------ formatting
export const DAY = 86_400_000;
export function fmtDate(t?: number | string | null) {
  if (!t) return '—';
  const d = typeof t === 'string' ? new Date(t + (t.length === 10 ? 'T00:00:00' : '')) : new Date(t);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
export function fmtDateTime(t?: number | null) {
  if (!t) return '—';
  return new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function timeAgo(t?: number | null) {
  if (!t) return '—';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hr${h > 1 ? 's' : ''} ago`;
  const d = Math.round(h / 24); if (d < 14) return `${d} day${d > 1 ? 's' : ''} ago`;
  return fmtDate(t);
}
export function durationDays(from?: number | null, to = Date.now()) {
  if (!from) return 0;
  return Math.max(0, Math.floor((to - from) / DAY));
}
export function fmtDuration(days: number) {
  if (days < 1) return 'Today';
  if (days < 60) return `${days} day${days === 1 ? '' : 's'}`;
  const months = days / 30.44;
  if (months < 24) return `${months.toFixed(1)} months`;
  return `${(days / 365.25).toFixed(1)} years`;
}
let currency = 'USD';
export function setCurrency(c?: string) { currency = c || 'USD'; }
export function money(n?: number | null, digits = 2) {
  if (n == null || !Number.isFinite(n)) return '—';
  try { return n.toLocaleString(undefined, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }); } catch { return `$${n.toFixed(digits)}`; }
}
export function num(n?: number | null) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
export function todayISO(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join('') || '?';
}
const AVATAR_COLORS = ['#1f5fbf', '#157a3a', '#b34700', '#7a3fb0', '#0f7c86', '#b42318', '#5b6b00', '#9a3a6b'];
export function avatarColor(s: string) {
  let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// ------------------------------------------------------------ domain helpers
export const STATUS_LABEL: Record<StockStatus, string> = { ok: 'In stock', low: 'Running low', out: 'Out of stock', retired: 'Decommissioned' };
export { stockStatus };
export function partValue(p: Part) { return (p.unitCost || 0) * Math.max(0, p.qty || 0); }
export function reorderQty(p: Part) {
  const target = p.maxQty && p.maxQty > 0 ? p.maxQty : Math.max((p.minQty || 0) * 2, 1);
  return Math.max(1, Math.ceil(target - (p.qty || 0)));
}
export function pmStart(e: Equipment) { return Math.max(e.installedAt || 0, e.lastServiceAt || 0) || null; }
export function pmDays(e: Equipment, s: Settings) { return e.pmDays || (e.type === 'knife' ? s.knifePmDays : s.rollerPmDays) || 0; }
export type PmState = 'ok' | 'soon' | 'due' | 'na';
export function pmState(e: Equipment, s: Settings): { state: PmState; days: number; interval: number; pct: number } {
  const interval = pmDays(e, s);
  const start = pmStart(e);
  if (e.status !== 'installed' || !start) return { state: 'na', days: 0, interval, pct: 0 };
  const days = durationDays(start);
  if (!interval) return { state: 'ok', days, interval, pct: 0 };
  const pct = days / interval;
  return { state: pct >= 1 ? 'due' : pct >= 0.8 ? 'soon' : 'ok', days, interval, pct };
}
export function normalize(s: unknown) { return String(s ?? '').toLowerCase(); }
/** Every word of the query must appear somewhere in the haystack. */
export function matches(query: string, ...fields: unknown[]) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fields.map(normalize).join(' ').replace(/[-_./]/g, ' ') + ' ' + fields.map(normalize).join(' ');
  return words.every((w) => hay.includes(w));
}
export function uniqueSorted(values: (string | undefined | null)[]) {
  return [...new Set(values.map((v) => (v || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// ------------------------------------------------------------ CSV
export function toCSV(rows: Record<string, unknown>[], columns?: string[]) {
  const cols = columns || [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v: unknown) => {
    if (v == null) return '';
    const s = Array.isArray(v) ? v.join('; ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
}
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let q = false;
  const delim = (text.split('\n')[0].match(/;/g)?.length || 0) > (text.split('\n')[0].match(/,/g)?.length || 0) ? ';' : text.split('\n')[0].includes('\t') && !text.split('\n')[0].includes(',') ? '\t' : ',';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// ------------------------------------------------------------ downloads
export function download(filename: string, data: BlobPart, type = 'text/plain') {
  const blob = new Blob([data], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
export async function exportExcel(filename: string, rows: Record<string, unknown>[], columns: { key: string; label: string; width?: number }[]) {
  const { default: writeXlsxFile } = await import('write-excel-file');
  const header = columns.map((c) => ({ value: c.label, fontWeight: 'bold' as const }));
  const body = rows.map((r) => columns.map((c) => {
    const v = r[c.key];
    if (v == null || v === '') return null;
    if (typeof v === 'number') return { type: Number, value: v };
    if (typeof v === 'boolean') return { type: String, value: v ? 'Yes' : 'No' };
    return { type: String, value: Array.isArray(v) ? v.join('; ') : String(v) };
  }));
  await writeXlsxFile([header, ...body] as never, { fileName: filename, columns: columns.map((c) => ({ width: c.width || 18 })), stickyRowsCount: 1 } as never);
}
export async function readSpreadsheet(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const { default: readXlsxFile } = await import('read-excel-file');
    const rows = await readXlsxFile(file);
    return rows.map((r) => r.map((c) => (c == null ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))));
  }
  return parseCSV(await file.text());
}

// ------------------------------------------------------------ images
async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions); } catch { /* fall back */ }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
function toJpeg(src: ImageBitmap | HTMLImageElement, max: number, quality: number): Promise<Blob> {
  const w0 = 'naturalWidth' in src ? src.naturalWidth : src.width;
  const h0 = 'naturalHeight' in src ? src.naturalHeight : src.height;
  const scale = Math.min(1, max / Math.max(w0, h0));
  const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not process image'))), 'image/jpeg', quality));
}
/** Shrinks a photo to a web-friendly size and makes a thumbnail. */
export async function prepareImage(file: Blob) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file (JPG, PNG, HEIC…).');
  const bmp = await loadBitmap(file);
  let full = await toJpeg(bmp, 1600, 0.82);
  if (full.size > 1_800_000) full = await toJpeg(bmp, 1200, 0.72);
  const thumb = await toJpeg(bmp, 320, 0.75);
  const form = new FormData();
  form.append('full', full, 'photo.jpg');
  form.append('thumb', thumb, 'thumb.jpg');
  return form;
}

export function useDebounced<T>(value: T, ms = 150) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
export function useNow(ms = 60000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}
