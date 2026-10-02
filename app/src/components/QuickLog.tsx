// Floating "quick log" bubble (bottom-right on every page): pick Used / Received, find the part, log it.
import { useMemo, useRef, useState } from 'react';
import { Zap, PackageMinus, PackagePlus, Clock } from 'lucide-react';
import type { Part } from '../../../shared/types';
import { useCanEdit, useStore } from '../lib/store';
import { safeGet, safeSet } from '../lib/api';
import { matches, stockStatus } from '../lib/util';
import { Modal, SearchInput, Seg, Thumb, Empty } from './ui';
import { StockDialog } from './PartDialogs';
import { t } from '../lib/i18n';

type Mode = 'use' | 'receive';
const RECENT_KEY = 'ppip.quicklog.recent';

function recentIds(): string[] {
  try { return JSON.parse(safeGet(RECENT_KEY) || '[]'); } catch { return []; }
}
function remember(id: string) {
  safeSet(RECENT_KEY, JSON.stringify([id, ...recentIds().filter((x) => x !== id)].slice(0, 6)));
}

export function QuickLogBubble() {
  const canEdit = useCanEdit();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<{ part: Part; mode: Mode } | null>(null);
  if (!canEdit) return null;
  return (
    <>
      <button className="fab no-print" data-tour="quicklog" onClick={() => setOpen(true)} aria-label={t('Quick log: parts used or received')} title={t('Quick log — parts used / received')}>
        <Zap size={26} />
        <span className="fab-label">{t('Quick log')}</span>
      </button>
      {open && <QuickLogPicker onClose={() => setOpen(false)} onPick={(part, mode) => { remember(part.id); setOpen(false); setPicked({ part, mode }); }} />}
      {picked && <StockDialog part={picked.part} mode={picked.mode} onClose={() => setPicked(null)} />}
    </>
  );
}

function QuickLogPicker({ onClose, onPick }: { onClose: () => void; onPick: (p: Part, mode: Mode) => void }) {
  const parts = useStore((s) => s.docs.parts);
  const [mode, setMode] = useState<Mode>('use');
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const list = useMemo(() => {
    const all = Object.values(parts).filter((p) => !p.decommissioned);
    if (!q.trim()) {
      const byId = new Map(all.map((p) => [p.id, p]));
      return recentIds().map((id) => byId.get(id)).filter((p): p is Part => !!p);
    }
    return all
      .filter((p) => matches(q, p.name, p.partNumber, p.manufacturer, p.vendorPartNumber, p.location, p.category, p.machines?.join(' ')))
      .sort((a, b) => {
        // exact part-number hits first, then by name
        const pa = (a.partNumber || '').toLowerCase() === q.trim().toLowerCase() ? 0 : 1;
        const pb = (b.partNumber || '').toLowerCase() === q.trim().toLowerCase() ? 0 : 1;
        return pa - pb || a.name.localeCompare(b.name);
      })
      .slice(0, 30);
  }, [parts, q]);

  const choose = (p?: Part) => {
    if (!p) return;
    if (mode === 'use' && p.qty <= 0) return;
    onPick(p, mode);
  };

  return (
    <Modal title="Quick log" icon={<Zap color="var(--primary)" />} onClose={onClose}>
      <div className="stack">
        <Seg value={mode} onChange={(m) => { setMode(m); inputRef.current?.focus(); }} options={[
          { id: 'use', label: <span className="row" style={{ gap: 6 }}><PackageMinus size={18} />{t('Used / took parts')}</span> },
          { id: 'receive', label: <span className="row" style={{ gap: 6 }}><PackagePlus size={18} />{t('Received parts')}</span> },
        ]} />
        <SearchInput inputRef={inputRef} value={q} autoFocus placeholder="Type part name or part #…"
          onChange={(v) => { setQ(v); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, list.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); choose(list[active]); }
          }} />
        {!q.trim() && list.length > 0 && <div className="small muted row" style={{ gap: 6 }}><Clock size={15} />{t('Recently logged on this device')}</div>}
        {list.length === 0 ? (
          q.trim() ? <Empty title="No matching parts">{t('Check the spelling or try the part number.')}</Empty>
            : <div className="muted center" style={{ padding: '1rem 0' }}>{t('Start typing to find a part.')}</div>
        ) : (
          <div className="card list" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
            {list.map((p, i) => {
              const st = stockStatus(p);
              const disabled = mode === 'use' && p.qty <= 0;
              return (
                <button key={p.id} className="list-item" disabled={disabled} onClick={() => choose(p)} onMouseEnter={() => setActive(i)}
                  style={{ alignItems: 'center', background: i === active ? 'var(--primary-soft)' : undefined, opacity: disabled ? 0.55 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
                  <Thumb id={p.imageId} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="ellipsis" style={{ fontWeight: 700 }}>{p.name}</div>
                    <div className="small muted ellipsis">{[p.partNumber, p.location].filter(Boolean).join(' · ')}{disabled ? ` · ${t('none in stock')}` : ''}</div>
                  </div>
                  <span className={`qty-big ${st}`}>{p.qty}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
