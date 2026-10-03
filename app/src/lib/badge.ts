// Badge scanners act like a keyboard: they "type" the whole ID very fast, then (usually) press Enter.
// Badge IDs can contain anything: letters, numbers and symbols, e.g. "ab-1234".
import { useEffect, useRef } from 'react';

/** Max time between keys for a burst to count as a scan when it lands in the wrong box (name / password). */
const SCAN_GAP_MS = 45;

/** Clean a badge ID the same way the server does (drop invisible characters and surrounding spaces). */
export function cleanBadge(raw: string) {
  return raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40);
}

/**
 * Sign-in page helper.
 * - Typing / scanning while nothing (or a non-text element) has focus goes straight into the badge box.
 * - A very fast burst + Enter that lands in the name or password box is treated as a scan:
 *   the scanned characters are taken back out of that box and used as the badge.
 * The badge box itself is left alone: the scanner types the full ID into it and its own Enter submits the form,
 * so nothing is ever submitted before the scan has finished.
 */
export function useBadgeCapture(opts: {
  enabled: boolean;
  badgeInput: React.RefObject<HTMLInputElement | null>;
  appendToBadge: (ch: string) => void;
  submitBadge: () => void;
  onScanIntoField: (badge: string, field: HTMLInputElement) => void;
}) {
  const ref = useRef(opts);
  ref.current = opts;
  const burst = useRef<{ chars: string; last: number; gaps: number[]; target: HTMLInputElement | null }>({ chars: '', last: 0, gaps: [], target: null });

  useEffect(() => {
    if (!opts.enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const o = ref.current;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      const inBadge = t === o.badgeInput.current;
      const inText = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (inBadge) return; // the badge box handles itself (full value + its own Enter)

      const printable = e.key.length === 1;
      if (!inText) {
        // nothing focused: send keys to the badge box
        if (printable) { e.preventDefault(); o.appendToBadge(e.key); o.badgeInput.current?.focus(); }
        else if (e.key === 'Enter') { e.preventDefault(); o.submitBadge(); }
        return;
      }

      // focus is in the name or password box: watch for a scanner burst
      const now = performance.now();
      const b = burst.current;
      if (printable) {
        const gap = now - b.last;
        if (gap > SCAN_GAP_MS || b.target !== t) { b.chars = ''; b.gaps = []; }
        else b.gaps.push(gap);
        b.chars += e.key; b.last = now; b.target = t as HTMLInputElement;
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const quick = now - b.last <= SCAN_GAP_MS * 2;
        if (quick && b.chars.length >= 3 && b.gaps.length === b.chars.length - 1 && b.target) {
          e.preventDefault(); e.stopPropagation();
          const field = b.target; const scanned = b.chars;
          b.chars = ''; b.gaps = []; b.target = null;
          o.onScanIntoField(scanned, field);
        }
        return;
      }
      if (e.key !== 'Shift') { b.chars = ''; b.gaps = []; }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [opts.enabled]);
}

/** Show only the last characters, e.g. "•••• 18". */
export function maskBadge(b?: string | null) {
  if (!b) return '';
  return b.length <= 2 ? b : `${'•'.repeat(Math.min(4, b.length - 2))} ${b.slice(-2)}`;
}
