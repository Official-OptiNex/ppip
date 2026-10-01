// Builds the portable USB version into dist/usb/PPIP  (copy that whole folder to a USB stick).
// The server address is baked in from PPIP_SERVER_URL, e.g.
//   PPIP_SERVER_URL=https://ppip.yourname.workers.dev npm run build:usb
// (If left out, the app asks for it on the sign-in screen the first time.)
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, copyFileSync, writeFileSync, chmodSync } from 'node:fs';

const server = process.env.PPIP_SERVER_URL || '';
execSync('npx vite build --mode usb', { stdio: 'inherit', env: { ...process.env, VITE_SERVER_URL: server } });

const out = 'dist/usb/PPIP';
rmSync('dist/usb', { recursive: true, force: true });
mkdirSync(`${out}/app`, { recursive: true });
copyFileSync('dist/usb-build/index.html', `${out}/app/index.html`);
copyFileSync('app/public/icon.svg', `${out}/app/icon.svg`);
cpSync('usb', out, { recursive: true });
chmodSync(`${out}/Start PPIP (Mac).command`, 0o755);
chmodSync(`${out}/Start PPIP (Linux).sh`, 0o755);
writeFileSync(`${out}/app/server.txt`, server || '(not set - enter it on the sign-in screen)');
rmSync('dist/usb-build', { recursive: true, force: true });
console.log(`\nUSB version ready in ${out}  (server: ${server || 'ask on first sign-in'})`);
