// "Process Engineer" logo: a gear (machines & maintenance) with a rising process line (continuous improvement).
import { useId } from 'react';

export const APP_NAME = 'Process Engineer';

export function Logo({ size = 40, title = APP_NAME }: { size?: number | string; title?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title} style={{ flex: 'none', display: 'block' }}>
      <defs>
        <linearGradient id={`pe-bg-${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1a4fa3" /><stop offset="1" stopColor="#2f86e6" /></linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#pe-bg-${id})`} />
      <path d="M25.04,15.18 L27.44,14.38 L28.20,9.32 L35.80,9.32 L36.56,14.38 L38.97,15.19 L41.24,16.32 L45.36,13.28 L50.72,18.64 L47.68,22.76 L48.82,25.04 L49.62,27.44 L54.68,28.20 L54.68,35.80 L49.62,36.56 L48.81,38.97 L47.68,41.24 L50.72,45.36 L45.36,50.72 L41.24,47.68 L38.96,48.82 L36.56,49.62 L35.80,54.68 L28.20,54.68 L27.44,49.62 L25.03,48.81 L22.76,47.68 L18.64,50.72 L13.28,45.36 L16.32,41.24 L15.18,38.96 L14.38,36.56 L9.32,35.80 L9.32,28.20 L14.38,27.44 L15.19,25.03 L16.32,22.76 L13.28,18.64 L18.64,13.28 L22.76,16.32 Z" fill="#fff" />
      <circle cx="32" cy="32" r="12.2" fill={`url(#pe-bg-${id})`} />
      <path d="M22.5 38.2 L28.4 32.3 L32.6 35.9 L40.6 26.4" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M36.2 26 L41.1 25.9 L41 30.8" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
