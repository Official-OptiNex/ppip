# Setup guide (about 20 minutes, all free)

You need:

- a **GitHub** account (you already have one; this repo is private)
- a **Cloudflare** account. It's free, and no credit card is needed for anything here.

This does **not** use MongoDB, Render, Supabase, Firebase or Microsoft 365. Cloudflare's free plan stores the data permanently. It doesn't expire and it doesn't pause when nobody uses it.

---

## 1. Create a Cloudflare account

Go to <https://dash.cloudflare.com/sign-up> and sign up (a personal email is fine). Verify your email.

## 2. Put the site online (connect this GitHub repo)

1. In the Cloudflare dashboard: **Workers & Pages** → **Create** → **Import a repository** (it might say "Connect to Git").
2. Connect your GitHub account and choose the **ppip** repository.
3. Use these build settings:
   - **Build command:** `npm run build:web`
   - **Deploy command:** `npx wrangler deploy`
   - Root directory: *(leave empty)*
4. Click **Deploy**. After a minute or two you get an address like **`https://ppip.<your-name>.workers.dev`**. That's your site.

From now on, every change pushed to the `main` branch deploys automatically.

> **Alternative (GitHub Actions instead of Cloudflare's Git integration):** create a Cloudflare API token (My Profile → API Tokens → *Edit Cloudflare Workers* template). In GitHub, go to repo → Settings → Secrets and variables → Actions and add the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The included `.github/workflows/deploy.yml` then deploys on every push to `main`. Use **one** of the two methods, not both.

## 3. First sign-in

Open your site and sign in with the admin account:

- **Email or name:** `faciano.nicholas@gmail.com` (or just `Nick`)
- **Password:** the one you chose

⚠️ That password was written in a chat, so **change it right away**: click your name (bottom-left) → *Change password*.

Then:

1. **Admin → Settings**: set your plant name, department, default knife/roller PM intervals and the day the weekly report starts. Also paste your site address into **Website address**, which QR codes and USB sticks use.
2. **Admin → Users → Add person** for each coworker. Pick **Viewer**, **Editor** or **Admin**. A password is generated for you. Copy the login details and hand them over privately.
3. **Suppliers & Lists**: add your machines, suppliers, categories and storage locations. You can also add them as you go.
4. **Import / Export → Import parts**: bring in an existing spreadsheet, or add parts one by one.
   *(Want to try it out first? Admin → Storage & usage → **Load demo data** fills an empty database with samples. Only do this before adding real parts. If you do use it, restore a backup or delete the demo items afterwards.)*

## 4. Off-site nightly backups (recommended, 5 minutes)

The app already keeps a backup inside the database every day. This step also puts a copy in your private GitHub repo, so the data survives even if the Cloudflare account were lost.

1. Make up a long random password (the "backup key"), e.g. 30+ random characters.
2. **Cloudflare:** Workers & Pages → *ppip* → **Settings → Variables and Secrets** → **Add** → type **Secret**, name `BACKUP_KEY`, value = your key → Deploy.
3. **GitHub:** repo → Settings → **Secrets and variables → Actions**:
   - **Secrets** tab → *New repository secret*: `BACKUP_KEY` = the same key
   - **Variables** tab → *New repository variable*: `PPIP_SERVER_URL` = `https://ppip.<your-name>.workers.dev`
4. GitHub → **Actions** → *Nightly backup* → **Run workflow** to test it. A `backups` branch appears with `data/latest.json` and your photos.

Admin → Backups shows a green check once the key is set.

**To restore:** Admin → Backups → pick a daily snapshot → *Restore*, or *Restore from a file* using `data/latest.json` from the `backups` branch. A safety copy is always made first, so a restore can be undone.

## 5. USB stick version (no install)

1. Build it. Either:
   - **Easiest:** if you set up GitHub Actions deploy (step 2 alternative) and the `PPIP_SERVER_URL` variable (step 4), open GitHub → Actions → latest *Deploy* run → download **PPIP-USB**.
   - **Or on any PC with Node.js installed:** `PPIP_SERVER_URL=https://ppip.<your-name>.workers.dev npm run build:usb` (on Windows PowerShell: `$env:PPIP_SERVER_URL="https://..."; npm run build:usb`).
2. Copy the **`PPIP`** folder onto a USB stick.
3. On any PC, double-click **`Start PPIP (Windows).bat`**. It opens in its own Edge window (Edge is on every Windows PC), and nothing is installed.

The USB version talks to the same online database, so every stick and browser is always in sync, live. If a PC has no internet, it still opens and shows the last data it saw. Changes made offline are queued and sent automatically when it reconnects. Each person's sign-in is saved on the stick (in `.browser-profile`).

## 6. Phones

Open the site on your phone and sign in. For an app icon:

- **iPhone (Safari):** Share → *Add to Home Screen*
- **Android (Chrome):** ⋮ → *Add to Home screen* / *Install app*

Printed QR labels (*Print Labels* page) open the part straight on a phone.

## 7. Optional: nicer address

In Cloudflare, you can attach a custom domain (Workers → *ppip* → Settings → Domains & Routes). This needs a domain you own (~$10/yr), so it's optional. The free `*.workers.dev` address works fine.

---

## Free-plan limits (you won't come close)

| Resource | Free allowance | Typical use (9 screens all day) |
|---|---|---|
| Worker requests | 100,000 / day | a few thousand |
| Durable Object storage | 5 GB | a few MB of data, plus ~200 KB per photo |
| Static page loads | unlimited | — |
| Live connections | hibernate when idle, so no cost | — |
| GitHub Actions (private repo) | 2,000 min / month | ~1 min / day for backups |

Admin → **Storage & usage** shows exactly how much you're using.

## Security notes

- Only people with an account can see anything. The site is marked "noindex" so search engines skip it.
- Passwords are stored as PBKDF2 hashes, never in plain text. After 8 wrong tries, that login is locked for 15 minutes.
- Admins can see and sign out any signed-in device (Admin → Storage & usage).
- Deactivating a user signs them out everywhere instantly.
- Part photos load by a long random link (like a shared Google Photos link) so they can appear on labels and printouts. Don't upload anything secret as a part photo.

## Troubleshooting

| Problem | Fix |
|---|---|
| Top bar says **Offline** | Check the internet. You can keep working, and changes sync automatically. |
| **"… to sync"** never clears | Something was rejected (e.g. the part was deleted meanwhile). A red message explains which. |
| Forgot password | An admin resets it: Admin → Users → Edit → Reset password. |
| USB asks for "Server address" | Enter your site address (`https://ppip.<name>.workers.dev`). |
| Phone photo QR opens the wrong address | Set **Admin → Settings → Website address**. |
