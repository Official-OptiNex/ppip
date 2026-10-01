// Usage: node scripts/hash-password.mjs "the password"
// Prints a PBKDF2-SHA256 hash in the same format the server uses (pbkdf2$iterations$saltHex$hashHex).
import { webcrypto as crypto } from 'node:crypto';

const pw = process.argv[2];
if (!pw) { console.error('Usage: node scripts/hash-password.mjs "password"'); process.exit(1); }
const ITER = 100000;
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256);
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
console.log(`pbkdf2$${ITER}$${hex(salt)}$${hex(bits)}`);
