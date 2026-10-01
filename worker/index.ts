// Cloudflare Worker entry point.
// - /api/*  -> forwarded to the single "Store" Durable Object (database + live sync)
// - anything else -> static web app (handled by Workers Static Assets before this code runs)
import { Store } from './store';

export { Store };

export interface Env {
  STORE: DurableObjectNamespace<Store>;
  ASSETS: Fetcher;
  BACKUP_KEY?: string;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Backup-Key',
  'Access-Control-Max-Age': '86400',
};

function store(env: Env) {
  return env.STORE.get(env.STORE.idFromName('main'));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
      const res = await store(env).fetch(request);
      if (res.status === 101 || res.webSocket) return res; // WebSocket upgrade: pass through untouched
      const out = new Response(res.body, res);
      for (const [k, v] of Object.entries(CORS_HEADERS)) out.headers.set(k, v);
      return out;
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await store(env).daily();
  },
} satisfies ExportedHandler<Env>;
