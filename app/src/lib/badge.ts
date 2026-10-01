// Badge scanners act like a keyboard that types very fast, then presses Enter.
// This tells a scan apart from a person typing, so a scan works no matter which box has focus.
import { useEffect, useRef } from 'react';

const MAX_GAP_MS = 45; // scanners send each digit within a few ms; people are much slower
const MIN_LEN = 2;
const MAX_LEN = 8;

/**
 * Calls onScan(badge) when a fast burst of 2–8 digits arrives (ending in Enter, or a short pause).
 * If the burst was typed into a text box, those digits are handed back via `undo` so they can be removed.
 */
export function useBadgeScanner(onScan: (badge: string, typedInto: HTMLInputElement | null) => void, enabled = true) {
  const buf = useRef<{ digits: string; last: number; target: HTMLInputElement | null }>({ digits: '', last: 0, target: null });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cb = useRef(onScan);
  cb.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    const fire = () => {
      const { digits, target } = buf.current;
      buf.current = { digits: '', last: 0, target: null };
      if (digits.length >= MIN_LEN && digits.length <= MAX_LEN) cb.current(digits, target);
    };
    const onKey = (e: KeyboardEvent) => {
      const now = performance.now();
      const b = buf.current;
      const fast = now - b.last <= MAX_GAP_MS;
      if (/^\d$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (!fast) b.digits = '';
        b.digits += e.key;
        b.last = now;
        b.target = e.target instanceof HTMLInputElement ? e.target : null;
        clearTimeout(timer.current);
        // scanners without an Enter suffix: a fast burst followed by a pause
        if (b.digits.length >= 3) timer.current = setTimeout(() => { if (performance.now() - buf.current.last >= 150) fire(); }, 160);
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && fast && b.digits.length >= MIN_LEN) {
        e.preventDefault();
        e.stopPropagation();
        clearTimeout(timer.current);
        fire();
        return;
      }
      if (e.key !== 'Shift') { b.digits = ''; b.last = 0; clearTimeout(timer.current); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); clearTimeout(timer.current); };
  }, [enabled]);
}

/** Show only the last digits, e.g. "•••• 34". */
export function maskBadge(b?: string | null) {
  if (!b) return '';
  return b.length <= 2 ? b : `${'•'.repeat(Math.min(4, b.length - 2))} ${b.slice(-2)}`;
}
