// The whole database lives in this one Durable Object (SQLite storage, persistent, free tier).
// Every change is broadcast to all connected screens over WebSockets so the app updates live.
import { DurableObject } from 'cloudflare:workers';
import {
  DEFAULT_SETTINGS, DOC_KINDS, FIELD_SPECS, ROLES, SEED_MANUFACTURERS, SEED_VENDORS, stockStatus, EQUIPMENT_LABEL, announcementLive,
  type Announcement, type DocKind, type Equipment, type Machine, type Part, type PmLog, type PublicUser, type Role, type StockStatus, type UserPrefs,
} from '../shared/types';
import { demoData } from './demo';
import { fmtDay, machinePmState } from '../shared/pm';

interface Env { BACKUP_KEY?: string }

type Row = Record<string, SqlStorageValue>;
interface AuthUser { id: string; name: string; email: string; role: Role }
interface Ctx { user: AuthUser | null; tokenHash?: string; url: URL; req: Request }
interface UndoOps { docs: { kind: string; id: string; before: Record<string, unknown> | null; afterUpdatedAt: number | null }[]; addedMovements: string[]; removedMovements: Row[] }
interface UndoRec extends UndoOps { activity: string[]; summaries: string[] }

// Initial admin (password is stored only as a PBKDF2 hash).
const SEED_ADMIN = {
  name: 'Nick',
  email: 'faciano.nicholas@gmail.com',
  hash: 'pbkdf2$100000$0d5afc3e596a8e1416820b6f02424620$7726f10fdb111ef4d570e5ff2b8c2946f137e333ad70a1125d3c953cce996ed9',
};

const DAY = 86_400_000;
const SESSION_TTL = 60 * DAY;
const UPLOAD_TTL = 20 * 60_000;
const MAX_BACKUPS_AUTO = 21;
const CHUNK = 900_000; // bytes per stored chunk (DO SQLite values max out at 2 MB)
const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };
const UNDO_DAYS = 30; // changes can be undone for this long

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

const uid = () => crypto.randomUUID();
const hex = (buf: ArrayBuffer | Uint8Array) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => new Uint8Array(s.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
async function sha256(s: string) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))); }

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}
async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$100000$${hex(salt)}$${await pbkdf2(password, salt, 100000)}`;
}
async function verifyPassword(password: string, stored: string) {
  const [, iter, salt, hash] = stored.split('$');
  if (!iter || !salt || !hash) return false;
  const got = await pbkdf2(password, unhex(salt), Number(iter));
  // constant-time compare
  let diff = got.length ^ hash.length;
  for (let i = 0; i < Math.min(got.length, hash.length); i++) diff |= got.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

function randomCode(len: number) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

// ---- value sanitising ----
function clean(kind: DocKind, patch: Record<string, unknown>) {
  const spec = FIELD_SPECS[kind];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch || {})) {
    const t = spec[k];
    if (!t) continue;
    if (v === null || v === undefined || v === '') { out[k] = t === 'bool' ? false : t === 'strs' ? [] : null; continue; }
    switch (t) {
      case 'str': out[k] = String(v).trim().slice(0, 500); break;
      case 'text': out[k] = String(v).slice(0, 10_000); break;
      case 'num': { const n = Number(v); out[k] = Number.isFinite(n) ? n : null; break; }
      case 'time': { const n = Number(v); out[k] = Number.isFinite(n) && n > 0 ? n : null; break; }
      case 'bool': out[k] = v === true || v === 'true' || v === 1 || v === '1' || v === 'yes'; break;
      case 'strs': out[k] = (Array.isArray(v) ? v : String(v).split(/[,;]/)).map((s) => String(s).trim()).filter(Boolean).slice(0, 200); break;
      case 'json': out[k] = JSON.parse(JSON.stringify(v)); break;
    }
  }
  return out;
}

export class Store extends DurableObject<Env> {
  sql: SqlStorage;
  failedLogins = new Map<string, { count: number; until: number }>();
  /** While a change is running, remembers how things looked before it so it can be undone. */
  rec: UndoRec | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => { this.migrate(); });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  // ------------------------------------------------------------------ schema
  migrate() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT, name TEXT, role TEXT, pw TEXT, active INTEGER DEFAULT 1,
        prefs TEXT, created_at INTEGER, last_login INTEGER, notif_seen INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY, user_id TEXT, created_at INTEGER, expires_at INTEGER, last_used INTEGER, agent TEXT);
      CREATE TABLE IF NOT EXISTS docs (
        kind TEXT, id TEXT, data TEXT, updated_at INTEGER, PRIMARY KEY (kind, id));
      CREATE TABLE IF NOT EXISTS movements (
        id TEXT PRIMARY KEY, part_id TEXT, part_name TEXT, delta REAL, qty_after REAL, kind TEXT,
        machine TEXT, note TEXT, user_id TEXT, user_name TEXT, unit_cost REAL, at INTEGER);
      CREATE INDEX IF NOT EXISTS mv_at ON movements(at);
      CREATE INDEX IF NOT EXISTS mv_part ON movements(part_id, at);
      CREATE TABLE IF NOT EXISTS activity (
        id TEXT PRIMARY KEY, at INTEGER, user_name TEXT, action TEXT, kind TEXT, ref_id TEXT, summary TEXT);
      CREATE INDEX IF NOT EXISTS act_at ON activity(at);
      CREATE INDEX IF NOT EXISTS act_ref ON activity(ref_id, at);
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY, at INTEGER, level TEXT, title TEXT, body TEXT, link TEXT);
      CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY, mime TEXT, full BLOB, thumb BLOB, size INTEGER, at INTEGER);
      CREATE TABLE IF NOT EXISTS uploads (
        code TEXT PRIMARY KEY, user_id TEXT, label TEXT, created_at INTEGER, expires_at INTEGER, image_id TEXT);
      CREATE TABLE IF NOT EXISTS backups (
        id TEXT PRIMARY KEY, at INTEGER, reason TEXT, size INTEGER, chunks INTEGER, counts TEXT);
      CREATE TABLE IF NOT EXISTS backup_chunks (
        backup_id TEXT, seq INTEGER, data BLOB, PRIMARY KEY (backup_id, seq));
      CREATE TABLE IF NOT EXISTS undo (
        id TEXT PRIMARY KEY, at INTEGER, user_id TEXT, user_name TEXT, summary TEXT, ops TEXT, undone INTEGER DEFAULT 0);
      CREATE INDEX IF NOT EXISTS undo_at ON undo(at);
    `);
    const actCols = this.sql.exec(`PRAGMA table_info(activity)`).toArray().map((r) => r.name);
    if (!actCols.includes('undo_id')) this.sql.exec(`ALTER TABLE activity ADD COLUMN undo_id TEXT`);
    // v3: badge numbers for one-scan sign-in
    const userCols = this.sql.exec(`PRAGMA table_info(users)`).toArray().map((r) => r.name);
    if (!userCols.includes('badge')) this.sql.exec(`ALTER TABLE users ADD COLUMN badge TEXT`);
    // v4: profile pictures (image id)
    if (!userCols.includes('avatar')) this.sql.exec(`ALTER TABLE users ADD COLUMN avatar TEXT`);
    this.sql.exec(`DROP INDEX IF EXISTS users_badge`);
    this.sql.exec(`CREATE UNIQUE INDEX IF NOT EXISTS users_badge_ci ON users(lower(badge)) WHERE badge IS NOT NULL`);
    const seeded = this.sql.exec(`SELECT value FROM meta WHERE key='seeded'`).toArray()[0];
    if (!seeded) {
      const now = Date.now();
      this.sql.exec(`INSERT INTO users (id,email,name,role,pw,active,prefs,created_at) VALUES (?,?,?,?,?,1,'{}',?)`,
        uid(), SEED_ADMIN.email, SEED_ADMIN.name, 'admin', SEED_ADMIN.hash, now);
      this.putDoc('settings', { ...DEFAULT_SETTINGS, createdAt: now, updatedAt: now });
      for (const m of SEED_MANUFACTURERS) this.putDoc('manufacturers', { id: uid(), ...m, createdAt: now, updatedAt: now });
      this.sql.exec(`INSERT INTO meta (key,value) VALUES ('seeded','1'), ('orderSeq','0')`);
    }
    // seed v2: add any built-in manufacturers / suppliers that are missing (never overwrites your edits)
    const seedV = Number(this.sql.exec(`SELECT value FROM meta WHERE key='seedVersion'`).toArray()[0]?.value || 1);
    if (seedV < 2) {
      const now = Date.now();
      for (const [kind, list] of [['manufacturers', SEED_MANUFACTURERS], ['vendors', SEED_VENDORS]] as const) {
        const have = new Set(this.allDocs<{ name: string }>(kind).map((d) => d.name.toLowerCase()));
        for (const m of list) if (!have.has(m.name.toLowerCase())) this.putDoc(kind, { id: uid(), ...m, createdAt: now, updatedAt: now });
      }
      this.sql.exec(`INSERT OR REPLACE INTO meta (key,value) VALUES ('seedVersion','2')`);
    }
    // seed v3: app renamed to "Process Technician" — update the old default names if nobody changed them
    if (seedV < 3) {
      const s = this.getDoc<Record<string, unknown>>('settings', 'app');
      if (s) {
        const pt = (s.printTemplate || null) as Record<string, unknown> | null;
        const next = { ...s };
        if (s.department === 'Process Engineering / Maintenance') next.department = 'Process Technician / Maintenance';
        if (pt && pt.subtitle === 'Maintenance / Process Engineering') next.printTemplate = { ...pt, subtitle: 'Maintenance / Process Technician' };
        this.putDoc('settings', next);
      }
      this.sql.exec(`INSERT OR REPLACE INTO meta (key,value) VALUES ('seedVersion','3')`);
    }
  }

  // ------------------------------------------------------------------ helpers
  getDoc<T = Record<string, unknown>>(kind: string, id: string): T | null {
    const r = this.sql.exec(`SELECT data FROM docs WHERE kind=? AND id=?`, kind, id).toArray()[0];
    return r ? (JSON.parse(r.data as string) as T) : null;
  }
  putDoc(kind: string, doc: Record<string, unknown>) {
    this.captureBefore(kind, doc.id as string);
    this.sql.exec(`INSERT OR REPLACE INTO docs (kind,id,data,updated_at) VALUES (?,?,?,?)`, kind, doc.id as string, JSON.stringify(doc), Number(doc.updatedAt) || Date.now());
  }
  allDocs<T = Record<string, unknown>>(kind: string): T[] {
    return this.sql.exec(`SELECT data FROM docs WHERE kind=?`, kind).toArray().map((r) => JSON.parse(r.data as string) as T);
  }
  settings() { return { ...DEFAULT_SETTINGS, ...(this.getDoc('settings', 'app') || {}) }; }

  publicUser(r: Row, full = false): PublicUser {
    const u: PublicUser = { id: r.id as string, name: r.name as string, email: r.email as string, role: r.role as Role, active: !!r.active, avatar: (r.avatar as string) || null };
    if (full) { u.lastLogin = (r.last_login as number) ?? null; u.createdAt = r.created_at as number; u.badge = (r.badge as string) || null; }
    return u;
  }
  /** An uploaded image id, or null. Refuses ids that don't exist. */
  checkImage(id?: string | null) {
    if (!id) return null;
    const s = String(id);
    if (!this.sql.exec(`SELECT id FROM images WHERE id=?`, s).toArray().length) throw new HttpError(400, 'That photo was not found. Please upload it again.');
    return s;
  }
  users(full = false) { return this.sql.exec(`SELECT * FROM users ORDER BY name COLLATE NOCASE`).toArray().map((r) => this.publicUser(r, full)); }

  broadcast(msg: unknown, except?: WebSocket) {
    const s = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try { ws.send(s); } catch { /* socket closing */ }
    }
  }
  presence(exclude?: WebSocket) {
    const names = new Map<string, string>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      const a = ws.deserializeAttachment() as { uid: string; name: string } | null;
      if (a) names.set(a.uid, a.name);
    }
    return [...names.entries()].map(([id, name]) => ({ id, name }));
  }

  log(user: AuthUser | null, action: string, kind: string | null, refId: string | null, summary: string) {
    const row = { id: uid(), at: Date.now(), userName: user?.name ?? 'System', action, kind, refId, summary };
    this.sql.exec(`INSERT INTO activity (id,at,user_name,action,kind,ref_id,summary) VALUES (?,?,?,?,?,?,?)`,
      row.id, row.at, row.userName, action, kind, refId, summary);
    if (this.rec) { this.rec.activity.push(row.id); this.rec.summaries.push(summary); }
    this.broadcast({ t: 'activity', row });
    return row;
  }

  notify(level: 'info' | 'warn' | 'danger' | 'success', title: string, body = '', link = '') {
    const row = { id: uid(), at: Date.now(), level, title, body, link };
    this.sql.exec(`INSERT INTO notifications (id,at,level,title,body,link) VALUES (?,?,?,?,?,?)`, row.id, row.at, level, title, body, link);
    this.broadcast({ t: 'notification', row });
  }

  movement(user: AuthUser | null, p: Part, delta: number, kind: string, machine?: string | null, note?: string | null) {
    const row = {
      id: uid(), partId: p.id, partName: p.name, delta, qtyAfter: p.qty, kind, machine: machine || null, note: note || null,
      userName: user?.name ?? 'System', unitCost: p.unitCost ?? null, at: Date.now(),
    };
    this.sql.exec(`INSERT INTO movements (id,part_id,part_name,delta,qty_after,kind,machine,note,user_id,user_name,unit_cost,at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      row.id, row.partId, row.partName, delta, row.qtyAfter, kind, row.machine, row.note, user?.id ?? null, row.userName, row.unitCost, row.at);
    if (this.rec) this.rec.addedMovements.push(row.id);
    this.broadcast({ t: 'movement', row });
  }

  stockAlert(before: StockStatus | null, p: Part) {
    const after = stockStatus(p);
    if (after === before) return;
    const where = p.location ? ` · ${p.location}` : '';
    if (after === 'out') this.notify('danger', `OUT OF STOCK: ${p.name}`, `${p.partNumber ? `#${p.partNumber} · ` : ''}0 ${p.unit || 'ea'} left${where}`, `#/parts/${p.id}`);
    else if (after === 'order') this.notify('danger', `ORDER NOW: ${p.name}`, `Only ${p.qty} ${p.unit || 'ea'} left${where}`, `#/parts/${p.id}`);
    else if (after === 'low') this.notify('warn', `Running low: ${p.name}`, `${p.qty} ${p.unit || 'ea'} left (reorder at ${p.minQty})${where}`, `#/parts/${p.id}`);
    else if (after === 'ok' && (before === 'out' || before === 'order' || before === 'low')) this.notify('success', `Restocked: ${p.name}`, `${p.qty} ${p.unit || 'ea'} in stock`, `#/parts/${p.id}`);
  }

  // ------------------------------------------------------------------ undo
  captureBefore(kind: string, id: string) {
    const r = this.rec;
    if (!r || r.docs.some((d) => d.kind === kind && d.id === id)) return;
    const row = this.sql.exec(`SELECT data FROM docs WHERE kind=? AND id=?`, kind, id).toArray()[0];
    r.docs.push({ kind, id, before: row ? JSON.parse(row.data as string) : null, afterUpdatedAt: null });
  }

  /** Run a change while recording its undo information; responds with the result plus X-Undo-Id / X-Undo-Summary headers. */
  undoable(c: Ctx, fn: () => unknown | Promise<unknown>, summaryOverride?: string): Promise<Response> {
    return (async () => {
      this.rec = { docs: [], addedMovements: [], removedMovements: [], activity: [], summaries: [] };
      let result: unknown;
      try { result = await fn(); } catch (e) { this.rec = null; throw e; }
      const rec = this.rec!;
      this.rec = null;
      if (!rec.docs.length && !rec.addedMovements.length && !rec.removedMovements.length) return json(result);
      for (const d of rec.docs) {
        const row = this.sql.exec(`SELECT data FROM docs WHERE kind=? AND id=?`, d.kind, d.id).toArray()[0];
        d.afterUpdatedAt = row ? Number(JSON.parse(row.data as string).updatedAt) || 0 : null;
      }
      const id = uid();
      const summary = (summaryOverride || rec.summaries[0] || 'Change').slice(0, 300) + (rec.summaries.length > 1 && !summaryOverride ? ` (+${rec.summaries.length - 1} more)` : '');
      this.sql.exec(`INSERT INTO undo (id,at,user_id,user_name,summary,ops) VALUES (?,?,?,?,?,?)`, id, Date.now(), c.user?.id ?? null, c.user?.name ?? 'System', summary,
        JSON.stringify({ docs: rec.docs, addedMovements: rec.addedMovements, removedMovements: rec.removedMovements }));
      for (const a of rec.activity) this.sql.exec(`UPDATE activity SET undo_id=? WHERE id=?`, id, a);
      return json(result, 200, { 'X-Undo-Id': id, 'X-Undo-Summary': encodeURIComponent(summary) });
    })();
  }

  async runUndo(c: Ctx, id: string, force: boolean): Promise<Response> {
    const u = this.need(c, 'editor');
    const row = this.sql.exec(`SELECT * FROM undo WHERE id=?`, id).toArray()[0];
    if (!row) throw new HttpError(404, `This change is too old to undo (changes can be undone for ${UNDO_DAYS} days).`);
    if (row.undone) throw new HttpError(400, 'That change was already undone.');
    if (row.user_id !== u.id && u.role !== 'admin') throw new HttpError(403, `Only ${row.user_name} or an admin can undo this change.`);
    const ops = JSON.parse(row.ops as string) as UndoOps;
    // has anyone changed these things since?
    const changed: string[] = [];
    for (const d of ops.docs) {
      const cur = this.sql.exec(`SELECT data FROM docs WHERE kind=? AND id=?`, d.kind, d.id).toArray()[0];
      const curAt = cur ? Number(JSON.parse(cur.data as string).updatedAt) || 0 : null;
      if (curAt !== d.afterUpdatedAt) {
        const doc = cur ? JSON.parse(cur.data as string) : d.before;
        changed.push(`${doc?.name || doc?.tag || doc?.title || doc?.machine || d.kind}${cur ? ` (changed by ${doc.updatedBy || 'someone'})` : ' (deleted since)'}`);
      }
    }
    if (changed.length && !force) return json({ error: 'Changed since', conflict: true, changed }, 409);
    const summary = `Undid: ${row.summary}`;
    return this.undoable(c, () => {
      this.ctx.storage.transactionSync(() => {
        const now = Date.now();
        for (const d of [...ops.docs].reverse()) {
          if (d.before) {
            const doc = { ...d.before, updatedAt: now, updatedBy: u.name };
            this.putDoc(d.kind, doc);
            this.broadcast({ t: 'upsert', kind: d.kind, doc });
          } else {
            this.captureBefore(d.kind, d.id);
            this.sql.exec(`DELETE FROM docs WHERE kind=? AND id=?`, d.kind, d.id);
            this.broadcast({ t: 'delete', kind: d.kind, id: d.id });
          }
        }
        for (const mid of ops.addedMovements) {
          const mv = this.sql.exec(`SELECT * FROM movements WHERE id=?`, mid).toArray()[0];
          if (mv) { this.rec?.removedMovements.push(mv); this.sql.exec(`DELETE FROM movements WHERE id=?`, mid); }
        }
        for (const mv of ops.removedMovements) {
          const cols = Object.keys(mv);
          this.sql.exec(`INSERT OR REPLACE INTO movements (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...cols.map((k) => mv[k] as SqlStorageValue));
          this.rec?.addedMovements.push(mv.id as string);
        }
        this.sql.exec(`UPDATE undo SET undone=1 WHERE id=?`, id);
      });
      this.log(u, 'undo', null, null, summary);
      this.broadcast({ t: 'movement', row: null });
      return { ok: true, summary };
    }, summary);
  }

  undoList(c: Ctx) {
    const u = this.need(c, 'editor');
    const rows = u.role === 'admin'
      ? this.sql.exec(`SELECT id, at, user_name AS userName, user_id AS userId, summary, undone FROM undo ORDER BY at DESC LIMIT 100`).toArray()
      : this.sql.exec(`SELECT id, at, user_name AS userName, user_id AS userId, summary, undone FROM undo WHERE user_id=? ORDER BY at DESC LIMIT 100`, u.id).toArray();
    return rows;
  }

  // ------------------------------------------------------------------ auth
  async auth(req: Request, url: URL): Promise<Ctx> {
    const h = req.headers.get('Authorization') || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : url.searchParams.get('token') || '';
    if (!token) return { user: null, url, req };
    const tokenHash = await sha256(token);
    const now = Date.now();
    const r = this.sql.exec(
      `SELECT s.last_used, u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>? AND u.active=1`, tokenHash, now,
    ).toArray()[0];
    if (!r) return { user: null, url, req };
    if (now - (r.last_used as number) > 3_600_000) {
      this.sql.exec(`UPDATE sessions SET last_used=?, expires_at=? WHERE token=?`, now, now + SESSION_TTL, tokenHash);
    }
    return { user: { id: r.id as string, name: r.name as string, email: r.email as string, role: r.role as Role }, tokenHash, url, req };
  }
  need(c: Ctx, role: Role): AuthUser {
    if (!c.user) throw new HttpError(401, 'Please sign in.');
    if (RANK[c.user.role] < RANK[role]) throw new HttpError(403, role === 'admin' ? 'Admins only.' : 'Your account is view-only.');
    return c.user;
  }

  // ------------------------------------------------------------------ http
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    try {
      return await this.route(req, url);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Server error: ' + (e instanceof Error ? e.message : String(e)) }, 500);
    }
  }

  async body<T = Record<string, unknown>>(req: Request): Promise<T> {
    try { return (await req.json()) as T; } catch { throw new HttpError(400, 'Invalid request body.'); }
  }

  async route(req: Request, url: URL): Promise<Response> {
    const p = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '') || '/';
    const m = req.method;
    const seg = p.split('/').filter(Boolean).map(decodeURIComponent);

    // ---- public endpoints
    if (p === '/health') return json({ ok: true, time: Date.now() });
    if (p === '/login-info' && m === 'GET') {
      const s = this.settings();
      // announcements marked "show on the sign-in screen" (only the text, nothing else)
      const announcements = this.allDocs<Announcement>('announcements').filter((a) => a.showOnLogin && (a.audience || 'all') === 'all' && announcementLive(a, undefined)) // public screen: only messages for everyone
        .map((a) => ({ id: a.id, title: a.title, body: a.body || '', titleEs: a.titleEs || '', bodyEs: a.bodyEs || '', level: a.level || 'info' }));
      return json({ badgeLogin: s.badgeLogin !== false, companyName: s.companyName || '', announcements });
    }
    if (p === '/login' && m === 'POST') return this.login(req);
    if (seg[0] === 'images' && seg[1] && m === 'GET') return this.getImage(seg[1], url.searchParams.has('thumb'));
    if (seg[0] === 'm' && seg[1]) { // phone upload page endpoints (the random code is the credential)
      if (m === 'GET') return this.uploadInfo(seg[1]);
      if (m === 'POST') return this.uploadFromPhone(seg[1], req);
    }
    if (p === '/backup/export' && m === 'GET') return this.backupExport(req, false);
    if (p === '/backup/images' && m === 'GET') return this.backupExport(req, true);

    const c = await this.auth(req, url);
    if (p === '/ws') return this.websocket(req, c);

    // ---- session / me
    if (p === '/logout' && m === 'POST') {
      if (c.tokenHash) this.sql.exec(`DELETE FROM sessions WHERE token=?`, c.tokenHash);
      return json({ ok: true });
    }
    if (p === '/bootstrap' && m === 'GET') return this.bootstrap(c);
    if (p === '/me/prefs' && m === 'PATCH') {
      const u = this.need(c, 'viewer');
      const prefs = await this.body<UserPrefs>(req);
      const cur = JSON.parse((this.sql.exec(`SELECT prefs FROM users WHERE id=?`, u.id).one().prefs as string) || '{}');
      const next = { ...cur, ...prefs };
      this.sql.exec(`UPDATE users SET prefs=? WHERE id=?`, JSON.stringify(next), u.id);
      return json({ prefs: next });
    }
    if (p === '/me/badge' && m === 'PUT') {
      const u = this.need(c, 'viewer');
      const b = await this.body<{ badge?: string | null }>(req);
      this.setBadge(u.id, b.badge);
      const badge = this.sql.exec(`SELECT badge FROM users WHERE id=?`, u.id).one().badge as string | null;
      this.log(u, 'update', 'users', u.id, badge ? `${u.name} linked a badge` : `${u.name} removed their badge`);
      return json({ badge });
    }
    if (p === '/me/avatar' && m === 'PUT') {
      const u = this.need(c, 'viewer');
      const b = await this.body<{ image?: string | null }>(req);
      const avatar = this.checkImage(b.image);
      this.sql.exec(`UPDATE users SET avatar=? WHERE id=?`, avatar, u.id);
      this.broadcast({ t: 'users', users: this.users(false) });
      return json({ avatar });
    }
    if (p === '/me/password' && m === 'POST') {
      const u = this.need(c, 'viewer');
      const b = await this.body<{ current: string; next: string }>(req);
      const row = this.sql.exec(`SELECT pw FROM users WHERE id=?`, u.id).one();
      if (!(await verifyPassword(b.current || '', row.pw as string))) throw new HttpError(400, 'Current password is not correct.');
      if (!b.next || b.next.length < 6) throw new HttpError(400, 'New password must be at least 6 characters.');
      this.sql.exec(`UPDATE users SET pw=? WHERE id=?`, await hashPassword(b.next), u.id);
      this.sql.exec(`DELETE FROM sessions WHERE user_id=? AND token<>?`, u.id, c.tokenHash!);
      return json({ ok: true });
    }
    if (p === '/notifications/seen' && m === 'POST') {
      const u = this.need(c, 'viewer');
      this.sql.exec(`UPDATE users SET notif_seen=? WHERE id=?`, Date.now(), u.id);
      return json({ ok: true });
    }
    if (p === '/notifications' && m === 'GET') {
      this.need(c, 'viewer');
      return json(this.sql.exec(`SELECT * FROM notifications ORDER BY at DESC LIMIT 200`).toArray());
    }

    // ---- documents
    if (seg[0] === 'docs' && seg[1] && seg[2]) {
      const kind = seg[1] as DocKind;
      if (!DOC_KINDS.includes(kind)) throw new HttpError(404, 'Unknown collection.');
      if (m === 'PUT') { const b = await this.body<{ patch: Record<string, unknown> }>(req); return this.undoable(c, () => this.upsert(c, kind, seg[2], b.patch)); }
      if (m === 'DELETE') return this.undoable(c, () => this.remove(c, kind, seg[2]));
    }
    if (seg[0] === 'parts' && seg[1] && seg[2] === 'adjust' && m === 'POST') { const b = await this.body(req); return this.undoable(c, () => this.adjust(c, seg[1], b)); }
    if (seg[0] === 'equipment' && seg[1] && seg[2] === 'action' && m === 'POST') { const b = await this.body(req); return this.undoable(c, () => this.equipmentAction(c, seg[1], b)); }
    if (seg[0] === 'orders' && seg[1] && seg[2] === 'receive' && m === 'POST') { const b = await this.body(req); return this.undoable(c, () => this.receiveOrder(c, seg[1], b)); }
    if (p === '/import' && m === 'POST') { const b = await this.body(req); return this.undoable(c, () => this.importRows(c, b)); }
    if (seg[0] === 'undo' && seg[1] && m === 'POST') { const b = await this.body<{ force?: boolean }>(req).catch(() => ({ force: false })); return this.runUndo(c, seg[1], !!b.force); }
    if (p === '/undo' && m === 'GET') return json(this.undoList(c));

    // ---- read-only queries
    if (p === '/movements' && m === 'GET') return json(this.movements(c, url));
    if (p === '/activity' && m === 'GET') return json(this.activity(c, url));
    if (p === '/analytics' && m === 'GET') return json(this.analytics(c, url));
    if (p === '/report' && m === 'GET') return json(this.report(c, url));
    if (p === '/export' && m === 'GET') { this.need(c, 'viewer'); return json(await this.snapshot(false)); }

    // ---- images
    // anyone signed in may upload a photo (viewers need it for their own profile picture)
    if (p === '/images' && m === 'POST') { const u = this.need(c, 'viewer'); return json(await this.saveImage(req, u.id)); }
    if (p === '/uploads' && m === 'POST') {
      const u = this.need(c, 'viewer');
      const b = await this.body<{ label?: string }>(req);
      const code = randomCode(8);
      const now = Date.now();
      this.sql.exec(`INSERT INTO uploads (code,user_id,label,created_at,expires_at) VALUES (?,?,?,?,?)`, code, u.id, (b.label || '').slice(0, 120), now, now + UPLOAD_TTL);
      return json({ code, expiresAt: now + UPLOAD_TTL });
    }

    // ---- admin
    if (seg[0] === 'admin') return this.admin(c, req, seg.slice(1));

    throw new HttpError(404, 'Not found.');
  }

  // ------------------------------------------------------------------ login
  async login(req: Request) {
    const b = await this.body<{ login?: string; password?: string; badge?: string; device?: string }>(req);
    if (b.badge != null) return this.badgeLogin(req, String(b.badge), b.device);
    const login = String(b.login || '').trim().toLowerCase();
    if (!login || !b.password) throw new HttpError(400, 'Enter your email (or name) and password.');
    const now = Date.now();
    const f = this.failedLogins.get(login);
    if (f && f.until > now) throw new HttpError(429, `Too many attempts. Try again in ${Math.ceil((f.until - now) / 60000)} min.`);
    const r = this.sql.exec(`SELECT * FROM users WHERE (lower(email)=? OR lower(name)=?) AND active=1`, login, login).toArray()[0];
    if (!r || !(await verifyPassword(b.password, r.pw as string))) {
      const count = (f && f.until > now - 15 * 60000 ? f.count : 0) + 1;
      this.failedLogins.set(login, { count, until: count >= 8 ? now + 15 * 60000 : 0 });
      throw new HttpError(401, 'Wrong email/name or password.');
    }
    this.failedLogins.delete(login);
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    this.sql.exec(`INSERT INTO sessions (token,user_id,created_at,expires_at,last_used,agent) VALUES (?,?,?,?,?,?)`,
      await sha256(token), r.id as string, now, now + SESSION_TTL, now, String(b.device || req.headers.get('User-Agent') || '').slice(0, 200));
    this.sql.exec(`UPDATE users SET last_login=? WHERE id=?`, now, r.id as string);
    return json({ token, user: this.publicUser(r) });
  }

  /** One-scan sign-in with an employee badge (keyboard-wedge scanner or typed). */
  async badgeLogin(req: Request, raw: string, device?: string) {
    if (this.settings().badgeLogin === false) throw new HttpError(403, 'Badge sign-in is turned off. Use your name or email and password.');
    const badge = normBadge(raw);
    if (!badge) throw new HttpError(400, BADGE_RULE);
    const now = Date.now();
    const key = '__badge__'; // shared limit so badge numbers can't be guessed by trying many
    const f = this.failedLogins.get(key);
    if (f && f.until > now) throw new HttpError(429, `Too many unknown badges. Try again in ${Math.ceil((f.until - now) / 60000)} min, or sign in with your password.`);
    const r = this.sql.exec(`SELECT * FROM users WHERE lower(badge)=lower(?) AND active=1`, badge).toArray()[0];
    if (!r) {
      const count = (f && f.until > now - 15 * 60000 ? f.count : 0) + 1;
      this.failedLogins.set(key, { count, until: count >= 20 ? now + 10 * 60000 : 0 });
      throw new HttpError(401, 'Badge not recognized. Sign in with your name and password, then add your badge under My settings.');
    }
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    this.sql.exec(`INSERT INTO sessions (token,user_id,created_at,expires_at,last_used,agent) VALUES (?,?,?,?,?,?)`,
      await sha256(token), r.id as string, now, now + SESSION_TTL, now, String(device || req.headers.get('User-Agent') || '').slice(0, 200));
    this.sql.exec(`UPDATE users SET last_login=? WHERE id=?`, now, r.id as string);
    return json({ token, user: this.publicUser(r) });
  }

  setBadge(userId: string, raw: string | null | undefined) {
    if (raw == null || String(raw).trim() === '') { this.sql.exec(`UPDATE users SET badge=NULL WHERE id=?`, userId); return; }
    const badge = normBadge(String(raw));
    if (!badge) throw new HttpError(400, BADGE_RULE);
    const other = this.sql.exec(`SELECT name FROM users WHERE lower(badge)=lower(?) AND id<>?`, badge, userId).toArray()[0];
    if (other) throw new HttpError(400, `Badge ${badge} already belongs to ${other.name}.`);
    this.sql.exec(`UPDATE users SET badge=? WHERE id=?`, badge, userId);
  }

  bootstrap(c: Ctx) {
    const u = this.need(c, 'viewer');
    const row = this.sql.exec(`SELECT prefs, notif_seen, badge, avatar FROM users WHERE id=?`, u.id).one();
    const docs: Record<string, unknown[]> = {};
    for (const k of DOC_KINDS) if (k !== 'settings') docs[k] = this.allDocs(k);
    return json({
      me: { ...u, badge: (row.badge as string) || null, avatar: (row.avatar as string) || null, prefs: JSON.parse((row.prefs as string) || '{}') },
      notifSeen: row.notif_seen || 0,
      users: this.users(u.role === 'admin'),
      settings: this.settings(),
      docs,
      notifications: this.sql.exec(`SELECT * FROM notifications ORDER BY at DESC LIMIT 60`).toArray(),
      activity: this.sql.exec(`SELECT id, at, user_name AS userName, action, kind, ref_id AS refId, summary FROM activity ORDER BY at DESC LIMIT 40`).toArray(),
      online: this.presence(),
      serverTime: Date.now(),
    });
  }

  // ------------------------------------------------------------------ websockets
  websocket(req: Request, c: Ctx) {
    if (req.headers.get('Upgrade') !== 'websocket') throw new HttpError(426, 'Expected WebSocket.');
    if (!c.user) return new Response('Unauthorized', { status: 401 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [c.user.id]);
    server.serializeAttachment({ uid: c.user.id, name: c.user.name });
    this.broadcast({ t: 'presence', online: this.presence() });
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (message === 'hello') ws.send(JSON.stringify({ t: 'presence', online: this.presence() }));
  }
  async webSocketClose(ws: WebSocket, code: number) {
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye'); } catch { /* already closed */ }
    this.broadcast({ t: 'presence', online: this.presence(ws) }, ws);
  }
  async webSocketError(ws: WebSocket) { this.broadcast({ t: 'presence', online: this.presence(ws) }, ws); }

  // ------------------------------------------------------------------ documents
  async upsert(c: Ctx, kind: DocKind, id: string, patch: Record<string, unknown>) {
    // editors may change the printed order-guide layout; everything else in settings is admin-only
    const printOnly = kind === 'settings' && Object.keys(patch || {}).every((k) => k === 'printTemplate');
    const u = this.need(c, (kind === 'settings' && !printOnly) || kind === 'mechanics' || kind === 'announcements' ? 'admin' : 'editor');
    if (kind === 'settings') id = 'app';
    if (!/^[\w-]{1,64}$/.test(id)) throw new HttpError(400, 'Invalid id.');
    return this.upsertDoc(u, kind, id, patch);
  }

  upsertDoc(u: AuthUser | null, kind: DocKind, id: string, patch: Record<string, unknown>, opts: { quiet?: boolean; note?: string } = {}) {
    const now = Date.now();
    const existing = this.getDoc<Record<string, unknown>>(kind, id);
    const changes = clean(kind, patch);
    const doc: Record<string, unknown> = { ...(existing || {}), ...changes, id, updatedAt: now, updatedBy: u?.name ?? 'System', createdAt: existing?.createdAt ?? now };

    if (kind !== 'settings' && kind !== 'orders' && kind !== 'equipment' && kind !== 'pms' && kind !== 'downtime' && kind !== 'cores' && kind !== 'announcements' && kind !== 'notes' && !String(doc.name ?? '').trim()) throw new HttpError(400, 'Name is required.');
    if (kind === 'pms') {
      if (!String(doc.machine ?? '').trim()) throw new HttpError(400, 'Choose a machine.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(doc.date ?? ''))) throw new HttpError(400, 'Enter the date the PM was done.');
      if (doc.type !== 'weekly' && doc.type !== 'monthly') throw new HttpError(400, 'PM type must be weekly or monthly.');
      if (doc.nextDue && !/^\d{4}-\d{2}-\d{2}$/.test(String(doc.nextDue))) doc.nextDue = null;
    }
    if (kind === 'equipment') {
      if (!doc.tag) throw new HttpError(400, 'Tag / ID is required.');
      if (!['knife', 'roller', 'horn', 'anvil'].includes(doc.type as string)) throw new HttpError(400, 'Unknown item type.');
      if (!doc.status) doc.status = doc.machine ? 'installed' : 'spare';
      if (doc.status === 'installed' && !doc.installedAt) doc.installedAt = now;
      syncHistory(doc as unknown as Equipment, now);
      if (doc.status === 'installed' && doc.machine && (existing?.status !== 'installed' || existing?.machine !== doc.machine)) {
        this.replaceOnWelder(u, doc as unknown as Equipment, String(doc.machine), now, '', '');
      }
    }
    if (kind === 'downtime') {
      if (!String(doc.machine ?? '').trim()) throw new HttpError(400, 'Choose the machine.');
      if (!String(doc.problem ?? '').trim()) throw new HttpError(400, 'Describe what happened.');
      if (!doc.startedAt) doc.startedAt = now;
      if (doc.minutes != null && (doc.minutes as number) < 0) throw new HttpError(400, 'Minutes can’t be negative.');
    }
    if (kind === 'cores') {
      if (!String(doc.tag ?? '').trim()) throw new HttpError(400, 'Enter the tag number.');
      if (!doc.at) doc.at = now;
    }
    if (kind === 'announcements') {
      if (!String(doc.title ?? '').trim()) throw new HttpError(400, 'Write the announcement.');
      if (!['info', 'warn', 'urgent', 'good'].includes(String(doc.level))) doc.level = 'info';
      if (!['all', 'viewer', 'editor', 'admin'].includes(String(doc.audience))) doc.audience = 'all';
      if (doc.active == null) doc.active = true;
      if (doc.dismissible == null) doc.dismissible = true;
      if (!existing) doc.author = u?.name || '';
    }
    if (kind === 'notes') {
      if (!String(doc.text ?? '').trim()) throw new HttpError(400, 'Write the note.');
      if (!existing) doc.author = u?.name || '';
      if (doc.done && !existing?.done) { doc.doneBy = u?.name || ''; doc.doneAt = now; }
      if (!doc.done) { doc.doneBy = ''; doc.doneAt = null; }
    }
    if (kind === 'orders') {
      if (!Array.isArray(doc.items)) doc.items = [];
      doc.items = (doc.items as Record<string, unknown>[]).slice(0, 300).map((it) => ({
        ...it, name: String(it.name ?? '').slice(0, 300), qty: Number(it.qty) || 0,
        unitCost: it.unitCost === '' || it.unitCost == null ? null : Number(it.unitCost) || 0,
      }));
      if (!doc.status) doc.status = 'draft';
      if (!doc.title) doc.title = 'Parts order';
      if (!doc.number) {
        const seq = Number(this.sql.exec(`SELECT value FROM meta WHERE key='orderSeq'`).one().value) + 1;
        this.sql.exec(`UPDATE meta SET value=? WHERE key='orderSeq'`, String(seq));
        doc.number = `ORD-${String(seq).padStart(4, '0')}`;
      }
    }
    if (kind === 'parts') {
      doc.qty = Number(doc.qty) || 0;
      if (!Array.isArray(doc.machines)) doc.machines = [];
    }

    this.putDoc(kind, doc);
    this.broadcast({ t: 'upsert', kind, doc });

    // side effects
    if (kind === 'parts') {
      const p = doc as unknown as Part;
      const beforeQty = existing ? Number(existing.qty) || 0 : 0;
      if (!existing && p.qty !== 0) this.movement(u, p, p.qty, 'create', null, 'Initial stock');
      else if (existing && p.qty !== beforeQty) this.movement(u, p, p.qty - beforeQty, 'adjust', null, opts.note || 'Count corrected on edit');
      if (!opts.quiet) this.stockAlert(existing ? stockStatus(existing as unknown as Part) : null, p);
    }
    if (existing && kind === 'mechanics' && existing.name !== doc.name) {
      for (const l of this.allDocs<PmLog>('pms')) {
        if (l.doneBy === existing.name) { l.doneBy = doc.name as string; this.putDoc('pms', l as unknown as Record<string, unknown>); this.broadcast({ t: 'upsert', kind: 'pms', doc: l }); }
      }
    }
    if (existing && (kind === 'manufacturers' || kind === 'vendors' || kind === 'machines' || kind === 'welders') && existing.name !== doc.name) {
      this.cascadeRename(kind, existing.name as string, doc.name as string);
    }
    if (!opts.quiet && kind !== 'settings') {
      const label = (kind === 'pms' ? `${doc.type === 'monthly' ? 'Monthly' : 'Weekly'} PM on ${doc.machine} (${doc.date})${doc.doneBy ? ` by ${doc.doneBy}` : ''}`
        : kind === 'downtime' ? `${doc.welder ? `${doc.welder} (${doc.machine})` : doc.machine}: ${String(doc.problem).slice(0, 80)}${doc.minutes ? ` — ${doc.minutes} min` : ''}`
          : kind === 'cores' ? `tag ${doc.tag}${doc.machine ? ` on ${doc.machine}` : ''}`
            : kind === 'notes' ? `${doc.machine ? `${doc.machine}: ` : ''}${String(doc.text).slice(0, 80)}${doc.done ? ' (done)' : ''}`
            // the activity feed is seen by everyone, so don't leak the text of a targeted announcement
            : kind === 'announcements' && doc.audience !== 'all' ? `for ${doc.audience === 'admin' ? 'admins' : doc.audience === 'editor' ? 'editors and admins' : 'viewers'}`
            : doc.name || doc.tag || doc.title || id) as string;
      const summary = existing ? `Updated ${singular(kind)} “${label}”` : `Added ${singular(kind)} “${label}”`;
      this.log(u, existing ? 'update' : 'create', kind, id, summary + (kind === 'orders' ? ` (${doc.number})` : ''));
    }
    if (kind === 'settings' && !opts.quiet) this.log(u, 'update', 'settings', 'app', 'Updated app settings');
    return doc;
  }

  cascadeRename(kind: 'manufacturers' | 'vendors' | 'machines' | 'welders', from: string, to: string) {
    const now = Date.now();
    for (const p of this.allDocs<Part>('parts')) {
      let changed = false;
      if (kind === 'manufacturers' && p.manufacturer === from) { p.manufacturer = to; changed = true; }
      if (kind === 'vendors' && p.vendor === from) { p.vendor = to; changed = true; }
      if (kind === 'machines' && p.machines?.includes(from)) { p.machines = p.machines.map((x) => (x === from ? to : x)); changed = true; }
      if (changed) { p.updatedAt = now; this.putDoc('parts', p as unknown as Record<string, unknown>); this.broadcast({ t: 'upsert', kind: 'parts', doc: p }); }
    }
    if (kind === 'machines') {
      for (const e of this.allDocs<Equipment>('equipment')) {
        if (e.machine === from) { e.machine = to; e.updatedAt = now; this.putDoc('equipment', e as unknown as Record<string, unknown>); this.broadcast({ t: 'upsert', kind: 'equipment', doc: e }); }
      }
      for (const l of this.allDocs<PmLog>('pms')) {
        if (l.machine === from) { l.machine = to; l.updatedAt = now; this.putDoc('pms', l as unknown as Record<string, unknown>); this.broadcast({ t: 'upsert', kind: 'pms', doc: l }); }
      }
      for (const k of ['downtime', 'cores', 'welders'] as const) {
        for (const d of this.allDocs<{ id: string; machine?: string; updatedAt?: number }>(k)) {
          if (d.machine === from) { d.machine = to; d.updatedAt = now; this.putDoc(k, d as unknown as Record<string, unknown>); this.broadcast({ t: 'upsert', kind: k, doc: d }); }
        }
      }
    }
    if (kind === 'welders') {
      // horns & anvils are "installed on" a welder; downtime can name a welder
      for (const e of this.allDocs<Equipment>('equipment')) {
        if ((e.type === 'horn' || e.type === 'anvil') && (e.machine === from || e.history?.some((h) => h.machine === from))) {
          if (e.machine === from) e.machine = to;
          e.history = e.history?.map((h) => (h.machine === from ? { ...h, machine: to } : h));
          e.updatedAt = now; this.putDoc('equipment', e as unknown as Record<string, unknown>); this.broadcast({ t: 'upsert', kind: 'equipment', doc: e });
        }
      }
      for (const d of this.allDocs<{ id: string; welder?: string; updatedAt?: number }>('downtime')) {
        if (d.welder === from) { d.welder = to; d.updatedAt = now; this.putDoc('downtime', d as unknown as Record<string, unknown>); this.broadcast({ t: 'upsert', kind: 'downtime', doc: d }); }
      }
    }
  }

  remove(c: Ctx, kind: DocKind, id: string) {
    const u = this.need(c, kind === 'mechanics' || kind === 'announcements' ? 'admin' : 'editor');
    if (kind === 'settings') throw new HttpError(400, 'Settings cannot be deleted.');
    const existing = this.getDoc<Record<string, unknown>>(kind, id);
    if (!existing) return { ok: true };
    this.captureBefore(kind, id);
    this.sql.exec(`DELETE FROM docs WHERE kind=? AND id=?`, kind, id);
    // the photo is kept for a few days (daily cleanup removes unused photos) so Undo can bring the part back with it
    this.broadcast({ t: 'delete', kind, id });
    this.log(u, 'delete', kind, id, `Deleted ${singular(kind)} “${kind === 'announcements' && existing.audience && existing.audience !== 'all' ? 'targeted message' : kind === 'pms' ? `${existing.type} PM on ${existing.machine} (${existing.date})` : existing.name || existing.tag || existing.title || (existing.text ? String(existing.text).slice(0, 60) : '') || id}”`);
    return { ok: true };
  }

  adjust(c: Ctx, id: string, b: Record<string, unknown>) {
    const u = this.need(c, 'editor');
    const p = this.getDoc<Part>('parts', id);
    if (!p) throw new HttpError(404, 'Part not found (it may have been deleted).');
    const mode = String(b.mode || 'use');
    const qty = Number(b.qty);
    if (!Number.isFinite(qty) || (mode !== 'set' && qty <= 0) || qty < 0) throw new HttpError(400, 'Enter a valid quantity.');
    const before = stockStatus(p);
    const old = Number(p.qty) || 0;
    const next = mode === 'use' ? old - qty : mode === 'receive' ? old + qty : qty;
    if (next < 0) throw new HttpError(400, `Only ${old} ${p.unit || 'ea'} in stock.`);
    p.qty = next;
    p.updatedAt = Date.now();
    p.updatedBy = u.name;
    this.putDoc('parts', p as unknown as Record<string, unknown>);
    this.broadcast({ t: 'upsert', kind: 'parts', doc: p });
    const kind = mode === 'use' ? 'use' : mode === 'receive' ? 'receive' : 'adjust';
    this.movement(u, p, next - old, kind, (b.machine as string) || null, (b.note as string) || null);
    const verb = mode === 'use' ? `Took ${qty}` : mode === 'receive' ? `Received ${qty}` : `Counted ${qty} (was ${old})`;
    this.log(u, kind, 'parts', id, `${verb} ${p.unit || 'ea'} · ${p.name}${b.machine ? ` → ${b.machine}` : ''}`);
    this.stockAlert(before, p);
    return p;
  }

  /**
   * Every sonic welder has exactly one horn and one anvil. Putting `e` on `welder` takes the horn/anvil
   * that is on it now off (back to spares) and records why on its history.
   */
  replaceOnWelder(u: AuthUser | null, e: Equipment, welder: string, at: number, reason: string, note: string) {
    if (e.type !== 'horn' && e.type !== 'anvil') return;
    for (const o of this.allDocs<Equipment>('equipment')) {
      if (o.id === e.id || o.type !== e.type || o.status !== 'installed' || o.machine !== welder) continue;
      syncHistory(o, at);
      const open = o.history?.find((h) => !h.removedAt);
      const d = o.installedAt ? Math.max(0, Math.round((at - o.installedAt) / DAY)) : 0;
      if (open) { open.removedAt = at; open.reason = reason || 'Replaced'; open.note = note || `Replaced by ${e.tag}`; }
      o.status = 'spare'; o.machine = ''; o.position = ''; o.installedAt = null; o.lastServiceAt = null;
      o.updatedAt = Date.now(); o.updatedBy = u?.name ?? 'System';
      this.putDoc('equipment', o as unknown as Record<string, unknown>);
      this.broadcast({ t: 'upsert', kind: 'equipment', doc: o });
      this.log(u, 'remove', 'equipment', o.id, `${EQUIPMENT_LABEL[o.type].one} ${o.tag} taken off ${welder} after ${d} day${d === 1 ? '' : 's'} (${reason || 'replaced'}) — replaced by ${e.tag}`);
    }
  }

  equipmentAction(c: Ctx, id: string, b: Record<string, unknown>) {
    const u = this.need(c, 'editor');
    const e = this.getDoc<Equipment>('equipment', id);
    if (!e) throw new HttpError(404, 'Item not found.');
    const at = Number(b.at) || Date.now();
    const action = String(b.action);
    const kindLabel = EQUIPMENT_LABEL[e.type]?.one || 'Item';
    const reason = String(b.reason || '').slice(0, 60);
    const note = String(b.note || '').slice(0, 500);
    syncHistory(e, at); // make sure the current stretch on a machine is on record
    const closeStint = (why: string) => { const open = e.history?.find((h) => !h.removedAt); if (open) { open.removedAt = at; open.reason = why || open.reason; if (note) open.note = note; } };
    const openStint = () => { e.history = [...(e.history || []), { machine: e.machine!, position: e.position || '', installedAt: at }]; };
    const days = (t?: number | null) => (t ? Math.max(0, Math.round((at - t) / DAY)) : 0);
    let summary = '';
    switch (action) {
      case 'install':
        if (!b.machine) throw new HttpError(400, 'Choose a machine.');
        closeStint(reason);
        // a welder holds one horn and one anvil: the one already on it comes off (the reason is for that one)
        this.replaceOnWelder(u, e, String(b.machine), at, reason, note);
        e.status = 'installed'; e.machine = String(b.machine); e.position = e.type === 'knife' ? '' : String(b.position || ''); e.installedAt = at; e.lastServiceAt = null;
        openStint();
        summary = `${kindLabel} ${e.tag} installed on ${e.machine}${e.position ? ` (${e.position})` : ''}`;
        break;
      case 'move': {
        if (!b.machine) throw new HttpError(400, 'Choose a machine.');
        const from = e.machine;
        closeStint(reason || 'Moved');
        this.replaceOnWelder(u, e, String(b.machine), at, '', '');
        e.status = 'installed'; e.machine = String(b.machine); e.position = e.type === 'knife' ? '' : String(b.position || ''); e.installedAt = at; e.lastServiceAt = null;
        openStint();
        summary = `${kindLabel} ${e.tag} moved ${from ? `from ${from} ` : ''}to ${e.machine}`;
        break;
      }
      case 'remove': {
        const from = e.machine; const d = days(e.installedAt);
        closeStint(reason);
        e.status = b.to === 'repair' ? 'repair' : 'spare'; e.machine = ''; e.position = ''; e.installedAt = null; e.lastServiceAt = null;
        summary = `${kindLabel} ${e.tag} removed from ${from || 'machine'} after ${d} day${d === 1 ? '' : 's'}${reason ? ` (${reason})` : ''} → ${e.status === 'repair' ? 'repair / rebuild' : 'spares'}`;
        break;
      }
      case 'service':
        e.lastServiceAt = at;
        summary = `${kindLabel} ${e.tag} serviced / checked${e.machine ? ` on ${e.machine}` : ''}`;
        break;
      case 'retire':
        closeStint(reason);
        e.status = 'retired'; e.machine = ''; e.position = ''; e.installedAt = null;
        summary = `${kindLabel} ${e.tag} retired / scrapped${reason ? ` (${reason})` : ''}`;
        break;
      case 'spare':
        e.status = 'spare';
        summary = `${kindLabel} ${e.tag} back in spares`;
        break;
      default: throw new HttpError(400, 'Unknown action.');
    }
    if (note) summary += ` — ${note}`;
    e.updatedAt = Date.now(); e.updatedBy = u.name;
    this.putDoc('equipment', e as unknown as Record<string, unknown>);
    this.broadcast({ t: 'upsert', kind: 'equipment', doc: e });
    this.log(u, action, 'equipment', id, summary);
    return e;
  }

  receiveOrder(c: Ctx, id: string, b: Record<string, unknown>) {
    const u = this.need(c, 'editor');
    const o = this.getDoc<Record<string, unknown>>('orders', id);
    if (!o) throw new HttpError(404, 'Order not found.');
    const idx = new Set((b.items as number[] | undefined) ?? (o.items as unknown[]).map((_, i) => i));
    let n = 0;
    (o.items as Record<string, unknown>[]).forEach((it, i) => {
      if (!idx.has(i) || it.received) return;
      it.received = true;
      if (it.partId) {
        const p = this.getDoc<Part>('parts', it.partId as string);
        if (p && Number(it.qty) > 0) { this.adjust(c, p.id, { mode: 'receive', qty: Number(it.qty), note: `Received on ${o.number}` }); n++; }
      }
    });
    if ((o.items as Record<string, unknown>[]).every((it) => it.received)) o.status = 'received';
    o.updatedAt = Date.now(); o.updatedBy = u?.name ?? 'System';
    this.putDoc('orders', o);
    this.broadcast({ t: 'upsert', kind: 'orders', doc: o });
    this.log(u, 'receive', 'orders', id, `Received ${o.number} into stock (${n} part${n === 1 ? '' : 's'} restocked)`);
    return o;
  }

  importRows(c: Ctx, b: Record<string, unknown>) {
    const u = this.need(c, 'editor');
    const kind = String(b.kind || 'parts') as DocKind;
    if (!DOC_KINDS.includes(kind) || kind === 'settings') throw new HttpError(400, 'Cannot import that collection.');
    const rows = (b.rows as Record<string, unknown>[]) || [];
    if (rows.length > 5000) throw new HttpError(400, 'Import at most 5000 rows at a time.');
    const mode = b.mode === 'skip' ? 'skip' : 'update';
    const existing = this.allDocs<Record<string, unknown>>(kind);
    const key = (d: Record<string, unknown>) =>
      kind === 'parts' && d.partNumber ? `pn:${String(d.partNumber).toLowerCase()}|${String(d.manufacturer || '').toLowerCase()}`
        : kind === 'equipment' ? `tag:${String(d.tag || '').toLowerCase()}|${d.type}`
          : `name:${String(d.name || d.title || '').toLowerCase()}`;
    const byKey = new Map(existing.map((d) => [key(d), d]));
    const byId = new Map(existing.map((d) => [d.id as string, d]));
    let created = 0, updated = 0, skipped = 0;
    const errors: string[] = [];
    this.ctx.storage.transactionSync(() => {
      rows.forEach((r, i) => {
        try {
          const match: Record<string, unknown> | undefined = (r.id ? byId.get(String(r.id)) : undefined) || byKey.get(key(r));
          if (match && mode === 'skip') { skipped++; return; }
          const id = (match?.id as string) || (typeof r.id === 'string' && /^[\w-]{1,64}$/.test(r.id) ? r.id : uid());
          this.upsertDoc(u, kind, id, r, { quiet: true, note: 'Import' });
          if (match) updated++; else created++;
        } catch (e) { skipped++; if (errors.length < 20) errors.push(`Row ${i + 2}: ${(e as Error).message}`); }
      });
    });
    this.log(u, 'import', kind, null, `Imported ${kind}: ${created} added, ${updated} updated, ${skipped} skipped`);
    return { created, updated, skipped, errors };
  }

  // ------------------------------------------------------------------ queries
  movements(c: Ctx, url: URL) {
    this.need(c, 'viewer');
    const q = url.searchParams;
    const where: string[] = []; const args: SqlStorageValue[] = [];
    if (q.get('partId')) { where.push('part_id=?'); args.push(q.get('partId')!); }
    if (q.get('from')) { where.push('at>=?'); args.push(Number(q.get('from'))); }
    if (q.get('to')) { where.push('at<?'); args.push(Number(q.get('to'))); }
    if (q.get('before')) { where.push('at<?'); args.push(Number(q.get('before'))); }
    const limit = Math.min(Number(q.get('limit')) || 200, 5000);
    return this.sql.exec(
      `SELECT id, part_id AS partId, part_name AS partName, delta, qty_after AS qtyAfter, kind, machine, note, user_name AS userName, unit_cost AS unitCost, at
       FROM movements ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY at DESC LIMIT ${limit}`, ...args).toArray();
  }

  activity(c: Ctx, url: URL) {
    this.need(c, 'viewer');
    const q = url.searchParams;
    const where: string[] = []; const args: SqlStorageValue[] = [];
    if (q.get('refId')) { where.push('ref_id=?'); args.push(q.get('refId')!); }
    if (q.get('kind')) { where.push('kind=?'); args.push(q.get('kind')!); }
    if (q.get('before')) { where.push('at<?'); args.push(Number(q.get('before'))); }
    if (q.get('q')) { where.push('(summary LIKE ? OR user_name LIKE ?)'); args.push(`%${q.get('q')}%`, `%${q.get('q')}%`); }
    const limit = Math.min(Number(q.get('limit')) || 100, 1000);
    return this.sql.exec(
      `SELECT a.id, a.at, a.user_name AS userName, a.action, a.kind, a.ref_id AS refId, a.summary, a.undo_id AS undoId,
         u.undone AS undone, u.user_id AS undoUserId
       FROM activity a LEFT JOIN undo u ON u.id = a.undo_id
       ${where.length ? 'WHERE ' + where.map((w) => w.replace(/\b(ref_id|kind|at|summary|user_name)\b/g, 'a.$1')).join(' AND ') : ''} ORDER BY a.at DESC LIMIT ${limit}`, ...args).toArray();
  }

  analytics(c: Ctx, url: URL) {
    this.need(c, 'viewer');
    const from = Number(url.searchParams.get('from')) || Date.now() - 365 * DAY;
    const to = Number(url.searchParams.get('to')) || Date.now() + DAY;
    const tz = Number(url.searchParams.get('tz')) || 0; // minutes, like Date#getTimezoneOffset
    const shift = `(at/1000 - ${Math.round(tz) * 60})`;
    const monthly = this.sql.exec(`
      SELECT strftime('%Y-%m', ${shift}, 'unixepoch') AS month,
        SUM(CASE WHEN kind='use' THEN -delta ELSE 0 END) AS used,
        SUM(CASE WHEN kind='receive' THEN delta ELSE 0 END) AS received,
        SUM(CASE WHEN kind='use' THEN -delta * COALESCE(unit_cost,0) ELSE 0 END) AS usedCost,
        SUM(CASE WHEN kind='receive' THEN delta * COALESCE(unit_cost,0) ELSE 0 END) AS receivedCost,
        COUNT(*) AS events
      FROM movements WHERE at>=? AND at<? GROUP BY month ORDER BY month`, from, to).toArray();
    const topUsed = this.sql.exec(`
      SELECT part_id AS partId, MAX(part_name) AS partName, SUM(-delta) AS used, COUNT(*) AS times, SUM(-delta*COALESCE(unit_cost,0)) AS cost
      FROM movements WHERE kind='use' AND at>=? AND at<? GROUP BY part_id ORDER BY used DESC LIMIT 15`, from, to).toArray();
    const outEvents = this.sql.exec(`
      SELECT part_id AS partId, MAX(part_name) AS partName, COUNT(*) AS times, MAX(at) AS lastAt
      FROM movements WHERE qty_after<=0 AND delta<0 AND at>=? AND at<? GROUP BY part_id ORDER BY times DESC, lastAt DESC LIMIT 15`, from, to).toArray();
    const byMachine = this.sql.exec(`
      SELECT COALESCE(NULLIF(machine,''),'(not specified)') AS machine, SUM(-delta) AS used, SUM(-delta*COALESCE(unit_cost,0)) AS cost, COUNT(*) AS times
      FROM movements WHERE kind='use' AND at>=? AND at<? GROUP BY 1 ORDER BY used DESC LIMIT 15`, from, to).toArray();
    const byUser = this.sql.exec(`
      SELECT COALESCE(user_name,'?') AS userName, COUNT(*) AS times FROM movements WHERE at>=? AND at<? GROUP BY 1 ORDER BY times DESC LIMIT 10`, from, to).toArray();
    const receivedByPart = this.sql.exec(`
      SELECT part_id AS partId, SUM(delta) AS qty, SUM(delta*COALESCE(unit_cost,0)) AS cost
      FROM movements WHERE kind='receive' AND at>=? AND at<? GROUP BY part_id`, from, to).toArray();
    const usedByPart = this.sql.exec(`
      SELECT part_id AS partId, SUM(-delta) AS qty, SUM(-delta*COALESCE(unit_cost,0)) AS cost
      FROM movements WHERE kind='use' AND at>=? AND at<? GROUP BY part_id`, from, to).toArray();
    return { from, to, monthly, topUsed, outEvents, byMachine, byUser, receivedByPart, usedByPart };
  }

  report(c: Ctx, url: URL) {
    this.need(c, 'viewer');
    const from = Number(url.searchParams.get('from'));
    const to = Number(url.searchParams.get('to'));
    if (!from || !to) throw new HttpError(400, 'from/to required');
    const agg = (kind: string, sign: number) => this.sql.exec(`
      SELECT part_id AS partId, MAX(part_name) AS partName, SUM(${sign}*delta) AS qty, COUNT(*) AS times,
        SUM(${sign}*delta*COALESCE(unit_cost,0)) AS cost, GROUP_CONCAT(DISTINCT NULLIF(machine,'')) AS machines
      FROM movements WHERE kind=? AND at>=? AND at<? GROUP BY part_id ORDER BY qty DESC`, kind, from, to).toArray();
    return {
      from, to,
      used: agg('use', -1),
      received: agg('receive', 1),
      adjustments: this.sql.exec(`SELECT id, part_id AS partId, part_name AS partName, delta, qty_after AS qtyAfter, note, user_name AS userName, at FROM movements WHERE kind IN ('adjust','create') AND at>=? AND at<? ORDER BY at DESC LIMIT 300`, from, to).toArray(),
      equipment: this.sql.exec(`SELECT id, at, user_name AS userName, action, summary FROM activity WHERE kind='equipment' AND at>=? AND at<? ORDER BY at DESC LIMIT 300`, from, to).toArray(),
      orders: this.sql.exec(`SELECT id, at, user_name AS userName, action, summary FROM activity WHERE kind='orders' AND at>=? AND at<? ORDER BY at DESC LIMIT 200`, from, to).toArray(),
      totals: this.sql.exec(`SELECT COUNT(*) AS events, COUNT(DISTINCT user_name) AS people FROM movements WHERE at>=? AND at<?`, from, to).one(),
    };
  }

  // ------------------------------------------------------------------ images
  async saveImage(req: Request, userId: string) {
    const form = await req.formData();
    const full = form.get('full') as unknown as File | null;
    const thumb = form.get('thumb') as unknown as File | null;
    if (!full || typeof full === 'string') throw new HttpError(400, 'No image received.');
    if (full.size > 1_900_000) throw new HttpError(413, 'Image too large (max ~1.9 MB after compression).');
    if (thumb && typeof thumb !== 'string' && thumb.size > 300_000) throw new HttpError(413, 'Thumbnail too large.');
    const id = uid().replace(/-/g, '') + hex(crypto.getRandomValues(new Uint8Array(4)));
    const fullBuf = await full.arrayBuffer();
    const thumbBuf = thumb && typeof thumb !== 'string' ? await thumb.arrayBuffer() : null;
    this.sql.exec(`INSERT INTO images (id,mime,full,thumb,size,at) VALUES (?,?,?,?,?,?)`,
      id, full.type || 'image/jpeg', fullBuf, thumbBuf, fullBuf.byteLength + (thumbBuf?.byteLength || 0), Date.now());
    void userId;
    return { id };
  }
  getImage(id: string, thumb: boolean) {
    const r = this.sql.exec(`SELECT mime, full, thumb FROM images WHERE id=?`, id).toArray()[0];
    if (!r) return new Response('Not found', { status: 404 });
    const data = (thumb && r.thumb ? r.thumb : r.full) as ArrayBuffer;
    return new Response(data, { headers: { 'Content-Type': (r.mime as string) || 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' } });
  }
  uploadInfo(code: string) {
    const r = this.sql.exec(`SELECT * FROM uploads WHERE code=?`, code.toUpperCase()).toArray()[0];
    if (!r || (r.expires_at as number) < Date.now()) throw new HttpError(404, 'This upload link has expired. Create a new one on the computer.');
    return json({ label: r.label, expiresAt: r.expires_at, done: !!r.image_id });
  }
  async uploadFromPhone(code: string, req: Request) {
    code = code.toUpperCase();
    const r = this.sql.exec(`SELECT * FROM uploads WHERE code=?`, code).toArray()[0];
    if (!r || (r.expires_at as number) < Date.now()) throw new HttpError(404, 'This upload link has expired. Create a new one on the computer.');
    const { id } = await this.saveImage(req, r.user_id as string);
    this.sql.exec(`UPDATE uploads SET image_id=? WHERE code=?`, id, code);
    this.broadcast({ t: 'phoneUpload', code, imageId: id });
    return json({ ok: true, id });
  }

  // ------------------------------------------------------------------ backups
  async snapshot(includeSecrets: boolean) {
    const docs: Record<string, unknown[]> = {};
    for (const k of DOC_KINDS) docs[k] = this.allDocs(k);
    return {
      app: 'ppip', version: 1, exportedAt: Date.now(),
      users: includeSecrets
        ? this.sql.exec(`SELECT id,email,name,role,pw,active,prefs,created_at,last_login,badge,avatar FROM users`).toArray()
        : this.users(false),
      docs,
      movements: this.sql.exec(`SELECT * FROM movements ORDER BY at`).toArray(),
      activity: this.sql.exec(`SELECT * FROM activity ORDER BY at`).toArray(),
      notifications: this.sql.exec(`SELECT * FROM notifications ORDER BY at`).toArray(),
      meta: this.sql.exec(`SELECT * FROM meta`).toArray(),
    };
  }

  async createBackup(reason: string) {
    const snap = await this.snapshot(true);
    const text = JSON.stringify(snap);
    const gz = new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomCode(4)}`;
    const chunks = Math.ceil(gz.byteLength / CHUNK) || 1;
    const counts = { parts: snap.docs.parts.length, movements: snap.movements.length, equipment: snap.docs.equipment.length, orders: snap.docs.orders.length };
    this.ctx.storage.transactionSync(() => {
      for (let i = 0; i < chunks; i++) this.sql.exec(`INSERT INTO backup_chunks (backup_id,seq,data) VALUES (?,?,?)`, id, i, gz.slice(i * CHUNK, (i + 1) * CHUNK).buffer);
      this.sql.exec(`INSERT INTO backups (id,at,reason,size,chunks,counts) VALUES (?,?,?,?,?,?)`, id, Date.now(), reason, gz.byteLength, chunks, JSON.stringify(counts));
    });
    // prune old automatic backups
    const old = this.sql.exec(`SELECT id FROM backups WHERE reason='auto' ORDER BY at DESC LIMIT -1 OFFSET ${MAX_BACKUPS_AUTO}`).toArray();
    for (const o of old) this.deleteBackup(o.id as string);
    return id;
  }
  deleteBackup(id: string) {
    this.sql.exec(`DELETE FROM backup_chunks WHERE backup_id=?`, id);
    this.sql.exec(`DELETE FROM backups WHERE id=?`, id);
  }
  async readBackup(id: string): Promise<string> {
    const rows = this.sql.exec(`SELECT data FROM backup_chunks WHERE backup_id=? ORDER BY seq`, id).toArray();
    if (!rows.length) throw new HttpError(404, 'Backup not found.');
    const blob = new Blob(rows.map((r) => new Uint8Array(r.data as ArrayBuffer)));
    return await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  }

  restore(u: AuthUser, snap: Record<string, unknown>) {
    if (snap.app !== 'ppip' || !snap.docs) throw new HttpError(400, 'That file is not a PPIP backup.');
    const docs = snap.docs as Record<string, Record<string, unknown>[]>;
    const users = (snap.users as Row[]) || [];
    const hasSecrets = users.length > 0 && users.every((x) => typeof x.pw === 'string');
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`DELETE FROM docs`);
      for (const k of DOC_KINDS) for (const d of docs[k] || []) if (d && d.id) this.putDoc(k, d);
      const ins = (table: string, rows: Row[] | undefined, cols: string[]) => {
        this.sql.exec(`DELETE FROM ${table}`);
        for (const r of rows || []) this.sql.exec(`INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...cols.map((c) => (r[c] ?? null) as SqlStorageValue));
      };
      ins('movements', snap.movements as Row[], ['id', 'part_id', 'part_name', 'delta', 'qty_after', 'kind', 'machine', 'note', 'user_id', 'user_name', 'unit_cost', 'at']);
      ins('activity', snap.activity as Row[], ['id', 'at', 'user_name', 'action', 'kind', 'ref_id', 'summary']);
      ins('notifications', snap.notifications as Row[], ['id', 'at', 'level', 'title', 'body', 'link']);
      for (const r of (snap.meta as Row[]) || []) this.sql.exec(`INSERT OR REPLACE INTO meta (key,value) VALUES (?,?)`, r.key, r.value);
      if (hasSecrets) {
        this.sql.exec(`DELETE FROM users`);
        for (const r of users) this.sql.exec(`INSERT INTO users (id,email,name,role,pw,active,prefs,created_at,last_login,badge,avatar) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          r.id, r.email, r.name, r.role, r.pw, r.active ?? 1, r.prefs ?? '{}', r.created_at ?? Date.now(), r.last_login ?? null, (r.badge as string) || null, (r.avatar as string) || null);
        // never lock the restoring admin out
        if (!this.sql.exec(`SELECT id FROM users WHERE id=? AND role='admin' AND active=1`, u.id).toArray().length) {
          const me = this.sql.exec(`SELECT id FROM users WHERE lower(email)=lower(?)`, u.email).toArray()[0];
          if (me) this.sql.exec(`UPDATE users SET role='admin', active=1 WHERE id=?`, me.id as string);
        }
      }
    });
    this.log(u, 'restore', null, null, 'Restored data from a backup');
    this.broadcast({ t: 'reload' });
  }

  async backupExport(req: Request, images: boolean) {
    const key = this.env.BACKUP_KEY;
    if (!key || req.headers.get('X-Backup-Key') !== key) throw new HttpError(401, 'Backup key missing or wrong.');
    if (images) return json(this.sql.exec(`SELECT id, size, at FROM images ORDER BY at`).toArray());
    return json(await this.snapshot(true));
  }

  // ------------------------------------------------------------------ admin
  async admin(c: Ctx, req: Request, seg: string[]): Promise<Response> {
    const u = this.need(c, 'admin');
    const m = req.method;
    const [a, id, sub] = seg;

    if (a === 'users' && !id && m === 'GET') return json(this.users(true));
    if (a === 'users' && !id && m === 'POST') {
      const b = await this.body<{ name: string; email: string; role: Role; password: string; badge?: string }>(req);
      const name = String(b.name || '').trim(); const email = String(b.email || '').trim().toLowerCase();
      if (!name || !email) throw new HttpError(400, 'Name and email are required.');
      if (!ROLES.includes(b.role)) throw new HttpError(400, 'Choose a role.');
      if (!b.password || b.password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters.');
      this.assertUnique(name, email);
      const newId = uid();
      if (b.badge && !normBadge(b.badge)) throw new HttpError(400, BADGE_RULE);
      if (b.badge) { const other = this.sql.exec(`SELECT name FROM users WHERE lower(badge)=lower(?)`, normBadge(b.badge)).toArray()[0]; if (other) throw new HttpError(400, `Badge ${normBadge(b.badge)} already belongs to ${other.name}.`); }
      this.sql.exec(`INSERT INTO users (id,email,name,role,pw,active,prefs,created_at,badge) VALUES (?,?,?,?,?,1,'{}',?,?)`, newId, email, name, b.role, await hashPassword(b.password), Date.now(), b.badge ? normBadge(b.badge) : null);
      this.log(u, 'create', 'users', newId, `Created account for ${name} (${b.role})`);
      this.broadcast({ t: 'users', users: this.users(false) });
      return json(this.users(true).find((x) => x.id === newId));
    }
    if (a === 'users' && id && m === 'PATCH') {
      const b = await this.body<{ name?: string; email?: string; role?: Role; password?: string; active?: boolean; badge?: string | null; avatar?: string | null }>(req);
      const cur = this.sql.exec(`SELECT * FROM users WHERE id=?`, id).toArray()[0];
      if (!cur) throw new HttpError(404, 'User not found.');
      const name = b.name != null ? String(b.name).trim() : (cur.name as string);
      const email = b.email != null ? String(b.email).trim().toLowerCase() : (cur.email as string);
      const role = b.role ?? (cur.role as Role);
      const active = b.active ?? !!cur.active;
      if (!ROLES.includes(role)) throw new HttpError(400, 'Invalid role.');
      this.assertUnique(name, email, id);
      if (cur.role === 'admin' && (role !== 'admin' || !active)) this.assertAnotherAdmin(id);
      if (b.badge !== undefined) this.setBadge(id, b.badge);
      if (b.avatar !== undefined) this.sql.exec(`UPDATE users SET avatar=? WHERE id=?`, this.checkImage(b.avatar), id);
      this.sql.exec(`UPDATE users SET name=?, email=?, role=?, active=? WHERE id=?`, name, email, role, active ? 1 : 0, id);
      if (b.password) {
        if (b.password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters.');
        this.sql.exec(`UPDATE users SET pw=? WHERE id=?`, await hashPassword(b.password), id);
        if (id !== u.id) this.sql.exec(`DELETE FROM sessions WHERE user_id=?`, id);
      }
      if (!active) { this.sql.exec(`DELETE FROM sessions WHERE user_id=?`, id); this.kick(id); }
      else if (role !== cur.role) this.kick(id, 4002); // make their screens reload with the new permissions
      this.log(u, 'update', 'users', id, `Updated account ${name}${b.password ? ' (password reset)' : ''}`);
      this.broadcast({ t: 'users', users: this.users(false) });
      return json(this.users(true).find((x) => x.id === id));
    }
    if (a === 'users' && id && m === 'DELETE') {
      if (id === u.id) throw new HttpError(400, 'You cannot delete your own account.');
      const cur = this.sql.exec(`SELECT * FROM users WHERE id=?`, id).toArray()[0];
      if (!cur) return json({ ok: true });
      if (cur.role === 'admin') this.assertAnotherAdmin(id);
      this.sql.exec(`DELETE FROM users WHERE id=?`, id);
      this.sql.exec(`DELETE FROM sessions WHERE user_id=?`, id);
      this.kick(id);
      this.log(u, 'delete', 'users', id, `Deleted account ${cur.name}`);
      this.broadcast({ t: 'users', users: this.users(false) });
      return json({ ok: true });
    }

    // show the guided tour to one person or a whole role: next sign-in, or right away if they're online
    if (a === 'tour' && m === 'POST') {
      const b = await this.body<{ userId?: string; role?: Role | 'all' }>(req);
      const rows = b.userId ? this.sql.exec(`SELECT id, name, prefs FROM users WHERE id=?`, b.userId).toArray()
        : b.role === 'all' ? this.sql.exec(`SELECT id, name, prefs FROM users WHERE active=1`).toArray()
          : ROLES.includes(b.role as Role) ? this.sql.exec(`SELECT id, name, prefs FROM users WHERE role=? AND active=1`, b.role as string).toArray() : [];
      if (!rows.length) throw new HttpError(400, 'Nobody matches that choice.');
      let online = 0;
      for (const r of rows) {
        const prefs = { ...JSON.parse((r.prefs as string) || '{}'), tutorialDone: false };
        this.sql.exec(`UPDATE users SET prefs=? WHERE id=?`, JSON.stringify(prefs), r.id as string);
        const socks = this.ctx.getWebSockets(r.id as string);
        if (socks.length) online++;
        for (const ws of socks) { try { ws.send(JSON.stringify({ t: 'tour' })); } catch { /* closing */ } }
      }
      const who = b.userId ? String(rows[0].name) : b.role === 'all' ? 'everyone' : `all ${b.role}s`;
      this.log(u, 'update', 'users', b.userId || null, `Turned on the guided tour for ${who}`);
      return json({ count: rows.length, online });
    }

    if (a === 'system' && m === 'GET') {
      const count = (t: string, where = '') => Number(this.sql.exec(`SELECT COUNT(*) AS n FROM ${t} ${where}`).one().n);
      const img = this.sql.exec(`SELECT COUNT(*) AS n, COALESCE(SUM(size),0) AS bytes FROM images`).one();
      const bk = this.sql.exec(`SELECT COALESCE(SUM(size),0) AS bytes FROM backups`).one();
      const docsBytes = Number(this.sql.exec(`SELECT COALESCE(SUM(length(data)),0) AS b FROM docs`).one().b);
      return json({
        dbBytes: this.ctx.storage.sql.databaseSize,
        imageBytes: Number(img.bytes), imageCount: Number(img.n), backupBytes: Number(bk.bytes), docsBytes,
        counts: {
          parts: count('docs', `WHERE kind='parts'`), equipment: count('docs', `WHERE kind='equipment'`), orders: count('docs', `WHERE kind='orders'`),
          manufacturers: count('docs', `WHERE kind='manufacturers'`), vendors: count('docs', `WHERE kind='vendors'`), machines: count('docs', `WHERE kind='machines'`),
          movements: count('movements'), activity: count('activity'), notifications: count('notifications'), users: count('users'), sessions: count('sessions'),
        },
        backups: this.sql.exec(`SELECT id, at, reason, size, counts FROM backups ORDER BY at DESC`).toArray(),
        sessions: this.sql.exec(`SELECT substr(s.token,1,12) AS id, s.created_at AS createdAt, s.last_used AS lastUsed, s.expires_at AS expiresAt, s.agent, u.name AS userName
          FROM sessions s LEFT JOIN users u ON u.id=s.user_id WHERE s.expires_at>? ORDER BY s.last_used DESC`, Date.now()).toArray(),
        online: this.presence(),
        connections: this.ctx.getWebSockets().length,
        offsiteBackupConfigured: !!this.env.BACKUP_KEY,
        limits: { storageBytes: 5 * 1024 ** 3, note: 'Cloudflare free plan: 5 GB SQLite Durable Object storage, 100,000 requests/day.' },
      });
    }
    if (a === 'sessions' && id && m === 'DELETE') {
      this.sql.exec(`DELETE FROM sessions WHERE substr(token,1,12)=?`, id);
      return json({ ok: true });
    }
    if (a === 'backups' && !id && m === 'POST') { const bid = await this.createBackup('manual'); this.log(u, 'backup', null, null, 'Created a manual backup'); return json({ id: bid }); }
    if (a === 'backups' && id && !sub && m === 'GET') {
      return new Response(await this.readBackup(id), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="ppip-backup-${id}.json"` } });
    }
    if (a === 'backups' && id && sub === 'restore' && m === 'POST') {
      const text = await this.readBackup(id);
      await this.createBackup('pre-restore');
      this.restore(u, JSON.parse(text));
      return json({ ok: true });
    }
    if (a === 'backups' && id && m === 'DELETE') { this.deleteBackup(id); return json({ ok: true }); }
    if (a === 'restore' && m === 'POST') {
      const snap = await this.body(req);
      await this.createBackup('pre-restore');
      this.restore(u, snap);
      return json({ ok: true });
    }
    // Erase ALL data (parts, history, PMs, knives/rollers, orders, photos…). Keeps user accounts, settings and backups.
    if (a === 'erase' && m === 'POST') {
      const b = await this.body<{ password?: string; confirm?: string }>(req);
      if (b.confirm !== 'DELETE ALL DATA') throw new HttpError(400, 'Confirmation text does not match.');
      const row = this.sql.exec(`SELECT pw FROM users WHERE id=?`, u.id).one();
      if (!(await verifyPassword(b.password || '', row.pw as string))) throw new HttpError(400, 'Your password is not correct.');
      const backupId = await this.createBackup('pre-erase');
      const now = Date.now();
      this.ctx.storage.transactionSync(() => {
        this.sql.exec(`DELETE FROM docs WHERE kind<>'settings'`);
        for (const t of ['movements', 'activity', 'notifications', 'uploads']) this.sql.exec(`DELETE FROM ${t}`);
        // accounts are kept, so keep their profile pictures too
        this.sql.exec(`DELETE FROM images WHERE id NOT IN (SELECT avatar FROM users WHERE avatar IS NOT NULL)`);
        this.sql.exec(`INSERT OR REPLACE INTO meta (key,value) VALUES ('orderSeq','0')`);
        for (const mf of SEED_MANUFACTURERS) this.putDoc('manufacturers', { id: uid(), ...mf, createdAt: now, updatedAt: now });
        for (const v of SEED_VENDORS) this.putDoc('vendors', { id: uid(), ...v, createdAt: now, updatedAt: now });
      });
      this.log(u, 'delete', null, null, `Erased all data (a backup was saved first: ${backupId})`);
      this.broadcast({ t: 'reload' });
      return json({ ok: true, backupId });
    }
    if (a === 'demo' && m === 'POST') {
      if (this.allDocs('parts').length > 0) throw new HttpError(400, 'Demo data can only be loaded into an empty database.');
      const d = demoData();
      for (const k of Object.keys(d.docs) as DocKind[]) {
        const byName = new Map(this.allDocs<{ id: string; name?: string }>(k).filter((x) => x.name).map((x) => [x.name!.toLowerCase(), x.id]));
        for (const doc of d.docs[k] || []) {
          // reuse built-in suppliers / machines with the same name instead of duplicating them
          const existingId = typeof doc.name === 'string' ? byName.get(doc.name.toLowerCase()) : undefined;
          const saved = this.upsertDoc(u, k, existingId || (doc.id as string), { ...doc, id: undefined }, { quiet: true });
          // keep the sample note's own author / time instead of "you, just now"
          if (k === 'notes' && saved) this.putDoc(k, { ...saved, author: doc.author, createdAt: doc.createdAt, doneBy: doc.doneBy || '', doneAt: doc.doneAt || null });
        }
      }
      for (const mv of d.movements) {
        this.sql.exec(`INSERT INTO movements (id,part_id,part_name,delta,qty_after,kind,machine,note,user_id,user_name,unit_cost,at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          uid(), mv.partId, mv.partName, mv.delta, mv.qtyAfter, mv.kind, mv.machine, null, null, mv.userName, mv.unitCost, mv.at);
      }
      this.log(u, 'import', null, null, 'Loaded demo data');
      this.broadcast({ t: 'reload' });
      return json({ ok: true });
    }
    if (a === 'notifications' && m === 'DELETE') { this.sql.exec(`DELETE FROM notifications`); this.broadcast({ t: 'reload' }); return json({ ok: true }); }
    throw new HttpError(404, 'Not found.');
  }

  assertUnique(name: string, email: string, exceptId = '') {
    const dup = this.sql.exec(`SELECT name, email FROM users WHERE id<>? AND (lower(name)=lower(?) OR lower(email)=lower(?))`, exceptId, name, email).toArray()[0];
    if (dup) throw new HttpError(400, (dup.email as string).toLowerCase() === email.toLowerCase() ? 'That email is already used.' : 'That name is already used (names are used to sign in, so they must be unique).');
  }
  assertAnotherAdmin(exceptId: string) {
    const n = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM users WHERE role='admin' AND active=1 AND id<>?`, exceptId).one().n);
    if (n === 0) throw new HttpError(400, 'There must always be at least one active admin.');
  }
  kick(userId: string, code = 4001) {
    for (const ws of this.ctx.getWebSockets(userId)) { try { ws.close(code, code === 4001 ? 'signed out' : 'role changed'); } catch { /* ignore */ } }
  }

  // ------------------------------------------------------------------ daily cron
  async daily() {
    const now = Date.now();
    await this.createBackup('auto');
    this.sql.exec(`DELETE FROM sessions WHERE expires_at<?`, now);
    this.sql.exec(`DELETE FROM uploads WHERE expires_at<?`, now - DAY);
    this.sql.exec(`DELETE FROM notifications WHERE at<?`, now - 120 * DAY);
    this.sql.exec(`DELETE FROM undo WHERE at<?`, now - UNDO_DAYS * DAY);
    // remove images nobody references any more (older than 2 days so in-progress edits are safe)
    // (part photos, photos on shift notes / downtime, and everyone's profile picture)
    const used = new Set<string>([
      ...(['parts', 'notes', 'downtime'] as const).flatMap((k) => this.allDocs<{ imageId?: string }>(k).map((d) => d.imageId || '')),
      ...this.sql.exec(`SELECT avatar FROM users WHERE avatar IS NOT NULL`).toArray().map((r) => r.avatar as string),
    ].filter(Boolean));
    for (const r of this.sql.exec(`SELECT id FROM images WHERE at<?`, now - 2 * DAY).toArray()) {
      if (!used.has(r.id as string)) this.sql.exec(`DELETE FROM images WHERE id=?`, r.id as string);
    }
    // Machine PMs due today or overdue
    const s = this.settings();
    const logs = this.allDocs<PmLog>('pms');
    const today = fmtDay(new Date(now));
    const due = this.allDocs<Machine>('machines').filter((m) => m.pmTracked)
      .map((m) => machinePmState(m, logs, today)).filter((x) => x.status === 'overdue' || x.status === 'today');
    if (due.length) {
      this.notify(due.some((x) => x.status === 'overdue') ? 'danger' : 'warn', `PM due: ${due.length} machine${due.length > 1 ? 's' : ''}`,
        due.slice(0, 6).map((x) => `${x.machine} (${x.nextType}${x.status === 'overdue' ? `, ${-(x.daysLeft || 0)}d overdue` : ''})`).join(', '), '#/pms');
    }
    const parts = this.allDocs<Part>('parts');
    const out = parts.filter((p) => stockStatus(p) === 'out').length;
    const low = parts.filter((p) => stockStatus(p) === 'low').length;
    if (new Date(now).getUTCDay() === (s.weeklyReportDay ?? 1)) {
      this.notify('info', 'Weekly usage report is ready', `${out} out of stock · ${low} running low. Open Reports to view or print.`, '#/reports');
    }
  }
}

const BADGE_RULE = 'Enter the badge ID exactly as it is on the badge (letters, numbers and symbols like AB-1234 are fine).';
/**
 * Keep the install → pull history in step with the item's current state:
 * an installed item always has one open stretch for its machine; anything else has none open.
 */
function syncHistory(e: Equipment, now: number) {
  const h = Array.isArray(e.history) ? e.history.filter((x) => x && x.machine && x.installedAt) : [];
  const open = h.find((x) => !x.removedAt);
  if (e.status === 'installed' && e.machine) {
    if (!open) h.push({ machine: e.machine, position: e.position || '', installedAt: e.installedAt || now });
    else { open.machine = e.machine; open.position = e.position || ''; if (e.installedAt) open.installedAt = e.installedAt; }
  } else if (open) open.removedAt = now;
  h.sort((a, b) => a.installedAt - b.installedAt);
  e.history = h;
}

/** Badge IDs can contain any letters, numbers and symbols (e.g. "ab-1234"). Only surrounding spaces and invisible control characters are dropped. */
function normBadge(raw: string): string | null {
  const b = String(raw).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return b.length >= 1 && b.length <= 40 ? b : null;
}

function singular(kind: string) {
  return ({ parts: 'part', manufacturers: 'manufacturer', vendors: 'supplier', machines: 'machine', equipment: 'item', orders: 'order guide', pms: 'PM', mechanics: 'mechanic', welders: 'sonic welder', downtime: 'downtime entry', cores: 'crushed core', announcements: 'announcement', notes: 'shift note' } as Record<string, string>)[kind] || kind;
}
