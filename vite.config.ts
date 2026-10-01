import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build` -> dist/web (website, served by the Cloudflare Worker)
// `vite build --mode usb` -> dist/usb/index.html (one self-contained file for the USB stick)
export default defineConfig(({ mode }) => ({
  root: 'app',
  base: './',
  plugins: [react(), ...(mode === 'usb' ? [viteSingleFile()] : [])],
  publicDir: mode === 'usb' ? false : 'public',
  build: {
    outDir: mode === 'usb' ? '../dist/usb-build' : '../dist/web',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:8787', ws: true } },
  },
}));
