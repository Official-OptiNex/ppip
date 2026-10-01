// Used by .github/workflows/backup.yml — downloads a full backup + any new photos.
// Usage: PPIP_SERVER_URL=https://... BACKUP_KEY=... node scripts/offsite-backup.mjs <outDir>
import { mkdirSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const base = (process.env.PPIP_SERVER_URL || '').replace(/\/+$/, '');
const key = process.env.BACKUP_KEY;
const out = process.argv[2] || 'backup-out';
if (!base || !key) { console.error('Set PPIP_SERVER_URL and BACKUP_KEY'); process.exit(1); }
const headers = { 'X-Backup-Key': key };

const res = await fetch(`${base}/api/backup/export`, { headers });
if (!res.ok) { console.error('Export failed', res.status, await res.text()); process.exit(1); }
const data = await res.json();
mkdirSync(join(out, 'data'), { recursive: true });
const day = new Date().toISOString().slice(0, 10);
const text = JSON.stringify(data, null, 1);
writeFileSync(join(out, 'data', 'latest.json'), text);
writeFileSync(join(out, 'data', `${day}.json`), text);
// keep the last 60 dated files (older ones remain in git history)
const dated = readdirSync(join(out, 'data')).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
for (const f of dated.slice(0, Math.max(0, dated.length - 60))) rmSync(join(out, 'data', f));
console.log(`Saved data: ${data.docs.parts.length} parts, ${data.movements.length} history rows`);

const imgs = await (await fetch(`${base}/api/backup/images`, { headers })).json();
mkdirSync(join(out, 'images'), { recursive: true });
let n = 0;
for (const img of imgs) {
  const file = join(out, 'images', `${img.id}.jpg`);
  if (existsSync(file)) continue;
  const r = await fetch(`${base}/api/images/${img.id}`);
  if (r.ok) { writeFileSync(file, Buffer.from(await r.arrayBuffer())); n++; }
}
writeFileSync(join(out, 'README.md'), `# PPIP backups\n\nNightly copy of all data. To restore: Admin → Backups → **Restore from a file** → pick \`data/latest.json\` (or a dated file).\nPhotos are in \`images/\`.\n\nLast run: ${new Date().toISOString()}\n`);
console.log(`Photos: ${imgs.length} total, ${n} new`);
