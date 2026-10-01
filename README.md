# PPIP — Parts & PM

A private, live-updating web app for a maintenance / process engineering department:

- **Parts inventory**: search, sort, filter; green / orange / red stock status; photos; order links; decommission.
- **Stock tracking**: one-click Take / Receive / Count, with a full history of who did what.
- **Alerts**: in-app notifications (plus optional Windows / phone pop-ups) when a part runs low or runs out, and when a knife or roller PM is due.
- **Order guides**: type up parts requests, then print them in your own format (the layout is editable). You can build one from low stock in one click and receive it back into stock.
- **Machine PMs**: log weekly / monthly PMs (machine, date, who did it). The next due date is automatic: 7 days after the last PM of any type, plus a monthly PM once a month. Shows overdue / due-today alerts, history, and per-machine settings.
- **Hot knives and rollers**: which machine each one is on and how long it's been there, with a "by machine" view and full history.
- **Quick log bubble**: a button on every page to log parts used or received in a few taps.
- **Analytics and reports**: most-used parts, monthly usage and cost, parts that often run out, usage by machine, supplier tracking (preferred supplier, lead time, spend), and a weekly/monthly report you can print.
- **Suppliers and manufacturers**: ~110 manufacturers and ~30 suppliers pre-loaded, with **automatic order links** built from the part number wherever the site's search link is known (all editable).
- **Import / export**: Excel (.xlsx) and CSV import with automatic column matching, plus Excel, CSV and full JSON export.
- **QR labels**: 4×6 thermal labels (e.g. Zebra GK420d, tall or sideways) or a letter sheet; scanning one with a phone opens that part.
- **Phone photos**: on a PC, click "Take photo with phone", scan the QR code, snap a picture, and it appears on the PC.
- **Accounts**: Viewer, Editor and Admin roles. The admin panel covers users, storage and usage, signed-in devices, backups and settings.
- **Easy to read**: large text by default, a Standard / Large / Extra-large text size per person, and a one-click light / dark switch (dark by default).
- **Works everywhere**: any browser, phones (can be installed like an app), and a **portable USB version** that needs no install. All of them share the same live data.
- **Offline-tolerant**: if the internet drops, you can keep working. Changes are queued and sync when the connection returns.
- **Backups**: an automatic daily snapshot (21 days kept), an optional nightly off-site copy to this private GitHub repo, and a one-click download or restore.

**Cost: $0.** It runs entirely on Cloudflare's free plan and GitHub's free plan. The data never expires and nothing "goes to sleep".

➡️ **Setup instructions: [docs/SETUP.md](docs/SETUP.md)**

## How it works

```
 Browsers / phones / USB sticks  ──HTTPS + WebSocket──►  Cloudflare Worker (free)
                                                             │  serves the web app (static files)
                                                             ▼
                                                  Durable Object "Store" (free, SQLite)
                                                   • the entire database (5 GB free)
                                                   • pushes every change to all open screens instantly
                                                   • daily backup snapshot (cron)
                                                             │
                              GitHub Action (nightly) ◄──────┘ off-site copy → "backups" branch
```

| Piece | Tech |
|---|---|
| Web app | React + TypeScript + Vite, custom CSS (no heavy UI frameworks, so it loads fast) |
| Server | Cloudflare Worker + one SQLite-backed Durable Object (`worker/store.ts`) |
| Live sync | WebSockets with hibernation (idle connections cost nothing) |
| Auth | Email **or** name plus password (PBKDF2-hashed), bearer session tokens, lockout after repeated failures |
| Photos | Resized in the browser (~150–300 KB), stored in the database |
| USB | The whole app in one HTML file plus launchers for Edge/Chrome in "app" mode |

## Project layout

```
app/            web app (React)          → npm run build:web → dist/web
  src/pages/    one file per screen
  src/lib/      api client, live store, helpers
worker/         Cloudflare Worker + Durable Object (the backend & database)
shared/         data model shared by both
usb/            USB launchers (Windows .bat, Mac .command, Linux .sh)
scripts/        build-usb, offsite-backup, hash-password
.github/        deploy + nightly backup workflows
```

## Local development

```bash
npm install
npm run dev          # builds the app and starts a local server at http://127.0.0.1:8787
# or, for instant UI reloads, in two terminals:
npx wrangler dev     # API on :8787
npm run dev:web      # UI on :5173 (proxies /api)
```

Sign in with the admin account. To fill an empty database with sample data, go to Admin → Storage & usage → **Load demo data**.

Other commands: `npm run typecheck`, `npm run build:usb` (set `PPIP_SERVER_URL`), `npm run deploy`.
