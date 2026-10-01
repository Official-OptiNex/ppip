// Reusable UI building blocks.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { X, Search, Inbox, ShoppingCart, AlertTriangle, CheckCircle2, XCircle, Archive, ArrowUpRight, Info } from 'lucide-react';
import { useStore, dismissToast } from '../lib/store';
import { STATUS_LABEL } from '../lib/util';
import type { StockStatus } from '../../../shared/types';
import { imageUrl } from '../lib/api';

export function Modal({ title, onClose, children, footer, size, icon }: {
  title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'wide' | 'xwide'; icon?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  const down = useRef(false);
  return (
    <div className="modal-back" onMouseDown={(e) => { down.current = e.target === e.currentTarget; }} onMouseUp={(e) => { if (down.current && e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${size || ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          {icon}
          <h2>{title}</h2>
          <button className="btn icon ghost" onClick={onClose} aria-label="Close"><X size={22} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ onClose, children, head }: { onClose: () => void; children: ReactNode; head: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.modal-back')) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="drawer-back" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true">
        <div className="drawer-head">
          <div className="grow">{head}</div>
          <button className="btn icon ghost" onClick={onClose} aria-label="Close"><X size={22} /></button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  );
}

// ------------------------------------------------------------ confirm dialog (promise based)
type ConfirmOpts = { title: string; body?: ReactNode; confirm?: string; danger?: boolean };
let confirmSetter: ((o: (ConfirmOpts & { resolve: (v: boolean) => void }) | null) => void) | null = null;
export function confirmDialog(o: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => confirmSetter?.({ ...o, resolve }));
}
export function ConfirmHost() {
  const [o, setO] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  useEffect(() => { confirmSetter = setO; return () => { confirmSetter = null; }; }, []);
  if (!o) return null;
  const close = (v: boolean) => { o.resolve(v); setO(null); };
  return (
    <Modal title={o.title} onClose={() => close(false)} icon={o.danger ? <AlertTriangle color="var(--danger)" /> : undefined}
      footer={<>
        <button className="btn lg" onClick={() => close(false)}>Cancel</button>
        <button className={`btn lg ${o.danger ? 'danger' : 'primary'}`} autoFocus onClick={() => close(true)}>{o.confirm || 'OK'}</button>
      </>}>
      <div style={{ fontSize: '1.05rem' }}>{o.body}</div>
    </Modal>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind || ''}`}>
          <div style={{ paddingTop: 2 }}>
            {t.kind === 'danger' ? <XCircle color="var(--danger)" /> : t.kind === 'warn' ? <AlertTriangle color="var(--warn)" /> : t.kind === 'info' ? <Info color="var(--primary)" /> : <CheckCircle2 color="var(--ok)" />}
          </div>
          <div className="grow">
            <div className="t-title">{t.title}</div>
            {t.body && <div className="t-body">{t.body}</div>}
            {t.link && <a href={t.link} className="small" onClick={() => dismissToast(t.id)}>Open <ArrowUpRight size={14} style={{ verticalAlign: -2 }} /></a>}
          </div>
          <button className="btn icon sm ghost" onClick={() => dismissToast(t.id)} aria-label="Dismiss"><X size={18} /></button>
        </div>
      ))}
    </div>
  );
}

export function Field({ label, children, hint, required, className }: { label: ReactNode; children: ReactNode; hint?: ReactNode; required?: boolean; className?: string }) {
  return (
    <div className={`field ${className || ''}`}>
      <label>{label}{required && <span className="req"> *</span>}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, autoFocus, inputRef, onKeyDown }: {
  value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; inputRef?: React.Ref<HTMLInputElement>; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="input-wrap grow">
      <Search size={20} />
      <input ref={inputRef} className="input" type="search" value={value} placeholder={placeholder || 'Search…'} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} style={{ minHeight: '3rem', fontSize: '1.05rem' }} />
      {value && <button className="btn icon sm ghost clear" onClick={() => onChange('')} aria-label="Clear search"><X size={18} /></button>}
    </div>
  );
}

/** Text input with a dropdown of suggestions; free text is always allowed. */
export function Combobox({ value, onChange, options, placeholder, onPick, renderSub, className, autoFocus, id }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder?: string; onPick?: (v: string) => void;
  renderSub?: (v: string) => ReactNode; className?: string; autoFocus?: boolean; id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const filtered = useMemo(() => {
    const q = value.toLowerCase().trim();
    // once the box exactly matches a choice, hide the list so it doesn't cover the next field (clear the box to see all again)
    if (q && options.some((o) => o.toLowerCase() === q)) return [];
    const list = !q ? options : options.filter((o) => o.toLowerCase().includes(q));
    return list.slice(0, 60);
  }, [value, options]);
  const pick = (v: string) => { onChange(v); onPick?.(v); setOpen(false); };
  return (
    <div className={`combo ${className || ''}`}>
      <input id={id} className="input" value={value} placeholder={placeholder} autoFocus={autoFocus} autoComplete="off" role="combobox" aria-expanded={open} aria-controls={listId}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !filtered.length) { if (e.key === 'ArrowDown') setOpen(true); return; }
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && filtered[active] && filtered[active] !== value) { e.preventDefault(); pick(filtered[active]); }
          else if (e.key === 'Escape') { setOpen(false); e.stopPropagation(); }
        }} />
      {open && filtered.length > 0 && (
        <div className="combo-list" id={listId} role="listbox">
          {filtered.map((o, i) => (
            <div key={o} role="option" aria-selected={i === active} className={`combo-item ${i === active ? 'active' : ''}`} onMouseDown={(e) => { e.preventDefault(); pick(o); }} onMouseEnter={() => setActive(i)}>
              <span className="ellipsis">{o}</span>{renderSub && <span className="sub">{renderSub(o)}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Multi-select as removable chips + a combobox to add more. */
export function TagInput({ values, onChange, options, placeholder }: { values: string[]; onChange: (v: string[]) => void; options: string[]; placeholder?: string }) {
  const [text, setText] = useState('');
  const add = (v: string) => { const t = v.trim(); if (t && !values.includes(t)) onChange([...values, t]); setText(''); };
  return (
    <div className="col" style={{ gap: '0.45rem' }}>
      {values.length > 0 && (
        <div className="chips">
          {values.map((v) => <span className="chip" key={v}>{v}<button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}><X size={15} /></button></span>)}
        </div>
      )}
      <div onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) { e.preventDefault(); add(text); } }}>
        <Combobox value={text} onChange={setText} options={options.filter((o) => !values.includes(o))} placeholder={placeholder || 'Type and press Enter'} onPick={add} />
      </div>
    </div>
  );
}

export function StatusPill({ status }: { status: StockStatus }) {
  const Icon = status === 'ok' ? CheckCircle2 : status === 'low' ? AlertTriangle : status === 'order' ? ShoppingCart : status === 'out' ? XCircle : Archive;
  return <span className={`pill ${status}`}><Icon size={15} />{STATUS_LABEL[status]}</span>;
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon || <Inbox size={48} />}
      <h3>{title}</h3>
      {children && <div>{children}</div>}
    </div>
  );
}

export function Thumb({ id, size, alt }: { id?: string | null; size?: 'lg'; alt?: string }) {
  const [err, setErr] = useState(false);
  return (
    <div className={`thumb ${size || ''}`}>
      {id && !err ? <img src={imageUrl(id, size !== 'lg')} alt={alt || ''} loading="lazy" onError={() => setErr(true)} /> : <PartGlyph />}
    </div>
  );
}
function PartGlyph() {
  return <svg width="55%" height="55%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3 4 7.5v9L12 21l8-4.5v-9Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></svg>;
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: ReactNode }[] }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => <button key={t.id} role="tab" aria-selected={value === t.id} className={value === t.id ? 'on' : ''} onClick={() => onChange(t.id)}>{t.label}</button>)}
    </div>
  );
}

export function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: ReactNode }[] }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => <button type="button" key={o.id} role="radio" aria-checked={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>{o.label}</button>)}
    </div>
  );
}

export function Menu({ trigger, children }: { trigger: (toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const [alignLeft, setAlignLeft] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // open toward whichever side has room (a menu near the left edge of a panel would otherwise be cut off)
    const r = ref.current?.getBoundingClientRect();
    const panel = ref.current?.closest('.drawer, .modal')?.getBoundingClientRect();
    const leftLimit = Math.max(8, panel?.left ?? 0);
    setAlignLeft(!!r && r.right - 240 < leftLimit);
    const on = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', on);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', on); document.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <div className="pop-anchor" ref={ref} onClick={(e) => e.stopPropagation()}>
      {trigger(() => setOpen((o) => !o))}
      {open && <div className="menu" style={alignLeft ? { left: 0, right: 'auto' } : undefined}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

export function NumberInput({ value, onChange, placeholder, min, step, className, id }: {
  value: number | null | undefined; onChange: (v: number | null) => void; placeholder?: string; min?: number; step?: number | 'any'; className?: string; id?: string;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => { if (value !== (text === '' ? null : Number(text))) setText(value == null ? '' : String(value)); /* eslint-disable-next-line */ }, [value]);
  return (
    <input id={id} className={`input ${className || ''}`} inputMode="decimal" type="number" step={step ?? 'any'} min={min} placeholder={placeholder} value={text}
      onChange={(e) => { setText(e.target.value); onChange(e.target.value === '' ? null : Number(e.target.value)); }} />
  );
}

export function Spinner() { return <div className="spinner" aria-label="Loading" />; }
