// "Process Technician" logo: a white gear (the machines) with an amber wrench across it (the people who keep them running).
// Same drawing as app/public/icon.svg (browser tab / installed-app icon).
import { useId } from 'react';

export const APP_NAME = 'Process Technician';

const GEAR = 'M28.63,11.78 L29.00,6.68 L35.00,6.68 L35.37,11.78 L43.92,15.32 L47.79,11.97 L52.03,16.21 L48.68,20.08 L52.22,28.63 L57.32,29.00 L57.32,35.00 L52.22,35.37 L48.68,43.92 L52.03,47.79 L47.79,52.03 L43.92,48.68 L35.37,52.22 L35.00,57.32 L29.00,57.32 L28.63,52.22 L20.08,48.68 L16.21,52.03 L11.97,47.79 L15.32,43.92 L11.78,35.37 L6.68,35.00 L6.68,29.00 L11.78,28.63 L15.32,20.08 L11.97,16.21 L16.21,11.97 L20.08,15.32 Z';

function Wrench() {
  return (
    <g transform="rotate(45 32 32)">
      <rect x="28.6" y="27" width="6.8" height="30" rx="3.4" />
      <path d="M32 9.2 a9.8 9.8 0 1 1 -0.01 0 Z" />
    </g>
  );
}

/** The wrench's open jaw (cut out of both the wrench and the gear behind it). */
function Jaw() {
  return <g fill="#000" transform="rotate(45 32 32)"><rect x="28.7" y="5" width="6.6" height="11" rx="1.4" /></g>;
}

export function Logo({ size = 40, title = APP_NAME }: { size?: number | string; title?: string }) {
  const id = 'pt' + useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title} style={{ flex: 'none', display: 'block' }}>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#172554" /><stop offset="0.55" stopColor="#1d4ed8" /><stop offset="1" stopColor="#06b6d4" /></linearGradient>
        <linearGradient id={`${id}-w`} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#f59e0b" /><stop offset="1" stopColor="#fde047" /></linearGradient>
        <mask id={`${id}-gm`}><rect width="64" height="64" fill="#fff" /><circle cx="32" cy="32" r="12.5" fill="#000" /><g fill="#000" stroke="#000" strokeWidth="5" strokeLinejoin="round"><Wrench /></g><Jaw /></mask>
        <mask id={`${id}-wm`}><rect width="64" height="64" fill="#fff" /><Jaw /></mask>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${id}-bg)`} />
      <path d={GEAR} fill="#fff" mask={`url(#${id}-gm)`} />
      <g fill={`url(#${id}-w)`} mask={`url(#${id}-wm)`}><Wrench /></g>
    </svg>
  );
}
