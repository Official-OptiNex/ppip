import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  LayoutDashboard, Package, ClipboardList, Flame, CircleDot, BarChart3, FileText, Truck, Tag, ArrowLeftRight, History, ShieldCheck,
  HelpCircle, ShoppingCart, Wrench, Sun, Moon, Bell, Menu as MenuIcon, LogOut, UserCircle2, Search, Plus, X, Wifi, WifiOff, AlertTriangle, XCircle, CheckCircle2, Info, MoreHorizontal,
} from 'lucide-react';
import { useStore, logout, markNotificationsSeen, can } from '../lib/store';
import { stockStatus, matches, avatarColor, initials, timeAgo, navigate } from '../lib/util';
import { usePmStates, pmDueCount } from '../lib/pmhooks';
import { savePrefs } from '../lib/store';
import { isFileMode } from '../lib/api';
import { Thumb } from './ui';
import { QuickLogBubble } from './QuickLog';
import type { Part, Equipment, OrderGuide } from '../../../shared/types';

const NAV: { to: string; label: string; icon: ReactNode; admin?: boolean; group?: string }[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={21} /> },
  { to: '/parts', label: 'Parts', icon: <Package size={21} /> },
  { to: '/orders', label: 'Order Guides', icon: <ClipboardList size={21} /> },
  { to: '/pms', label: 'PMs', icon: <Wrench size={21} />, group: 'Maintenance' },
  { to: '/knives', label: 'Hot Knives', icon: <Flame size={21} /> },
  { to: '/rollers', label: 'Rollers', icon: <CircleDot size={21} /> },
  { to: '/analytics', label: 'Analytics', icon: <BarChart3 size={21} />, group: 'Insights' },
  { to: '/reports', label: 'Weekly Report', icon: <FileText size={21} /> },
  { to: '/activity', label: 'Activity Log', icon: <History size={21} /> },
  { to: '/suppliers', label: 'Suppliers & Lists', icon: <Truck size={21} />, group: 'Manage' },
  { to: '/labels', label: 'Print Labels', icon: <Tag size={21} /> },
  { to: '/data', label: 'Import / Export', icon: <ArrowLeftRight size={21} /> },
  { to: '/admin', label: 'Admin', icon: <ShieldCheck size={21} />, admin: true },
  { to: '/help', label: 'Help', icon: <HelpCircle size={21} /> },
];

export function isActive(to: string, path: string) {
  return to === '/' ? path === '/' : path === to || path.startsWith(to + '/');
}

export function Layout({ path, children }: { path: string; children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const me = useStore((s) => s.me);
  const settings = useStore((s) => s.settings);
  const parts = useStore((s) => s.docs.parts);
  const pmStates = usePmStates();
  const pmDue = pmDueCount(pmStates);
  const pmOverdue = pmStates.some((s) => s.status === 'overdue');
  const counts = useMemo(() => {
    let low = 0, out = 0;
    for (const p of Object.values(parts)) { const st = stockStatus(p); if (st === 'low') low++; else if (st === 'out' || st === 'order') out++; }
    return { low, out };
  }, [parts]);
  useEffect(() => setNavOpen(false), [path]);

  let lastGroup: string | undefined;
  return (
    <div className="shell">
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
      <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-logo">{(settings.printTemplate?.logoText || 'PPIP').slice(0, 4)}</div>
          <div className="grow">
            <div className="brand-name ellipsis">Parts & PM</div>
            <div className="brand-sub ellipsis">{settings.companyName || 'Inventory'}</div>
          </div>
          <button className="btn icon ghost mobile-only" onClick={() => setNavOpen(false)} aria-label="Close menu"><X /></button>
        </div>
        <nav className="nav" data-tour="nav">
          {NAV.filter((n) => !n.admin || me?.role === 'admin').map((n) => {
            const header = n.group && n.group !== lastGroup ? <div className="nav-label" key={`g-${n.group}`}>{n.group}</div> : null;
            if (n.group) lastGroup = n.group;
            const badge = n.to === '/parts' ? (counts.out ? <span className="count danger" title="Out of stock or order now">{counts.out}</span> : counts.low ? <span className="count warn" title="Running low">{counts.low}</span> : null)
              : n.to === '/pms' && pmDue ? <span className={`count ${pmOverdue ? 'danger' : 'warn'}`} title="PMs due">{pmDue}</span> : null;
            return [header, (
              <a key={n.to} href={`#${n.to}`} className={isActive(n.to, path) ? 'active' : ''} aria-current={isActive(n.to, path) ? 'page' : undefined}>
                {n.icon}<span>{n.label}</span>{badge}
              </a>
            )];
          })}
        </nav>
        <div className="sidebar-foot">
          <a className="btn block ghost" href="#/profile" style={{ justifyContent: 'flex-start' }}>
            <span className="avatar" style={{ background: avatarColor(me?.name || '') }}>{initials(me?.name || '')}</span>
            <span className="grow ellipsis" style={{ textAlign: 'left' }}>{me?.name}<br /><span className="small muted" style={{ textTransform: 'capitalize' }}>{me?.role}</span></span>
          </a>
        </div>
      </aside>

      <div className="main">
        <header className="topbar no-print">
          <button className="btn icon ghost mobile-only" onClick={() => setNavOpen(true)} aria-label="Open menu"><MenuIcon /></button>
          <GlobalSearch />
          <div className="row" style={{ gap: '0.5rem' }}>
            <ConnectionPill />
            <Presence />
            <ThemeToggle />
            <Notifications />
            {can.edit() && <button className="btn primary desktop-only" onClick={() => navigate('/parts/new')}><Plus size={20} />Add part</button>}
          </div>
        </header>
        <main className="content" id="main">{children}</main>
      </div>

      <QuickLogBubble />
      <nav className="bottom-nav no-print" aria-label="Quick navigation">
        <a href="#/" className={path === '/' ? 'active' : ''}><LayoutDashboard size={22} />Home</a>
        <a href="#/parts" className={isActive('/parts', path) ? 'active' : ''}><Package size={22} />Parts</a>
        <a href="#/knives" className={isActive('/knives', path) ? 'active' : ''}><Flame size={22} />Knives</a>
        <a href="#/pms" className={isActive('/pms', path) ? 'active' : ''}><Wrench size={22} />PMs</a>
        <button onClick={() => setNavOpen(true)}><MoreHorizontal size={22} />More</button>
      </nav>
    </div>
  );
}

function ThemeToggle() {
  const theme = useStore((s) => s.me?.prefs?.theme);
  const dark = theme !== 'light' && (theme !== 'system' || matchMedia('(prefers-color-scheme: dark)').matches);
  return (
    <button className="btn icon ghost" data-tour="theme" onClick={() => savePrefs({ theme: dark ? 'light' : 'dark' })}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'}>
      {dark ? <Sun size={22} /> : <Moon size={22} />}
    </button>
  );
}

function ConnectionPill() {
  const conn = useStore((s) => s.conn);
  const outbox = useStore((s) => s.outbox.length);
  const label = conn === 'live' ? 'Live' : conn === 'connecting' ? 'Connecting…' : 'Offline';
  const title = conn === 'live' ? 'Connected — changes from everyone appear instantly.' : conn === 'offline' ? 'No connection. You can keep working; changes sync when the connection returns.' : 'Reconnecting to the server…';
  return (
    <span className={`conn ${conn}`} title={title} role="status" data-tour="live">
      {conn === 'offline' ? <WifiOff size={16} /> : conn === 'live' ? <span className="dot" /> : <Wifi size={16} />}
      <span className="desktop-only">{label}{isFileMode ? ' · USB' : ''}</span>
      {outbox > 0 && <span title="Changes waiting to sync">· {outbox} to sync</span>}
    </span>
  );
}

function Presence() {
  const online = useStore((s) => s.online);
  const me = useStore((s) => s.me);
  const others = online.filter((o) => o.id !== me?.id);
  if (!others.length) return null;
  return (
    <div className="avatars desktop-only" title={`Also online: ${others.map((o) => o.name).join(', ')}`}>
      {others.slice(0, 4).map((o) => <span key={o.id} className="avatar" style={{ background: avatarColor(o.name) }}>{initials(o.name)}</span>)}
      {others.length > 4 && <span className="avatar" style={{ background: 'var(--muted)' }}>+{others.length - 4}</span>}
    </div>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const notifications = useStore((s) => s.notifications);
  const seen = useStore((s) => s.notifSeen);
  const parts = useStore((s) => s.docs.parts);
  const pmStates = usePmStates();
  const ref = useRef<HTMLDivElement>(null);
  const unread = notifications.filter((n) => n.at > seen).length;
  const attention = useMemo(() => {
    const list = Object.values(parts);
    const out = list.filter((p) => stockStatus(p) === 'out').length;
    const order = list.filter((p) => stockStatus(p) === 'order').length;
    const low = list.filter((p) => stockStatus(p) === 'low').length;
    return { out, order, low, due: pmDueCount(pmStates) };
  }, [parts, pmStates]);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', on);
    return () => document.removeEventListener('mousedown', on);
  }, [open]);
  const toggle = () => { if (!open && unread) markNotificationsSeen(); setOpen(!open); };
  const Icon = (l: string) => l === 'danger' ? <XCircle size={19} /> : l === 'warn' ? <AlertTriangle size={19} /> : l === 'success' ? <CheckCircle2 size={19} /> : <Info size={19} />;
  const badge = unread || attention.out + attention.order;
  return (
    <div className="pop-anchor" ref={ref} data-tour="alerts">
      <button className="btn icon ghost" onClick={toggle} aria-label={`Notifications${badge ? ` (${badge})` : ''}`} style={{ position: 'relative' }}>
        <Bell size={22} />
        {badge > 0 && <span className="badge-dot">{badge > 99 ? '99+' : badge}</span>}
      </button>
      {open && (
        <div className="popover" onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setOpen(false); }}>
          <div className="card-head"><h3>Alerts & notifications</h3></div>
          <div className="list" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
            {attention.out > 0 && <a className="list-item" href="#/parts?status=out"><span className="li-icon danger"><XCircle size={19} /></span><div className="grow"><b>{attention.out} part{attention.out > 1 ? 's' : ''} out of stock</b><div className="small muted">Tap to see the list and reorder</div></div></a>}
            {attention.order > 0 && <a className="list-item" href="#/parts?status=order"><span className="li-icon danger"><ShoppingCart size={19} /></span><div className="grow"><b>{attention.order} part{attention.order > 1 ? 's' : ''} need ordering now</b><div className="small muted">Almost gone — order today</div></div></a>}
            {attention.low > 0 && <a className="list-item" href="#/parts?status=low"><span className="li-icon warn"><AlertTriangle size={19} /></span><div className="grow"><b>{attention.low} part{attention.low > 1 ? 's' : ''} running low</b><div className="small muted">At or below the reorder point</div></div></a>}
            {attention.due > 0 && <a className="list-item" href="#/pms"><span className="li-icon warn"><Wrench size={19} /></span><div className="grow"><b>{attention.due} machine PM{attention.due > 1 ? 's' : ''} due</b><div className="small muted">Overdue or due today</div></div></a>}
            {notifications.length === 0 && !attention.out && !attention.low && <div className="empty small">No notifications yet.</div>}
            {notifications.slice(0, 40).map((n) => {
              const inner = <>
                <span className={`li-icon ${n.level}`}>{Icon(n.level)}</span>
                <div className="grow">
                  <div style={{ fontWeight: n.at > seen ? 800 : 600 }}>{n.title}</div>
                  {n.body && <div className="small muted">{n.body}</div>}
                  <div className="small muted">{timeAgo(n.at)}</div>
                </div>
              </>;
              return n.link ? <a key={n.id} className="list-item" href={n.link}>{inner}</a> : <div key={n.id} className="list-item">{inner}</div>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const parts = useStore((s) => s.docs.parts);
  const equipment = useStore((s) => s.docs.equipment);
  const orders = useStore((s) => s.docs.orders);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); inputRef.current?.focus(); setOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', on);
    return () => document.removeEventListener('mousedown', on);
  }, [open]);

  const results = useMemo(() => {
    if (!q.trim()) return { parts: [] as Part[], eq: [] as Equipment[], orders: [] as OrderGuide[] };
    return {
      parts: Object.values(parts).filter((p) => matches(q, p.name, p.partNumber, p.manufacturer, p.vendorPartNumber, p.location, p.category, p.description, p.machines?.join(' '))).slice(0, 8),
      eq: Object.values(equipment).filter((e) => matches(q, e.tag, e.machine, e.position, e.type === 'knife' ? 'hot knife' : 'roller', e.notes)).slice(0, 5),
      orders: Object.values(orders).filter((o) => matches(q, o.number, o.title, o.requestedBy, o.items.map((i) => `${i.name} ${i.partNumber}`).join(' '))).slice(0, 4),
    };
  }, [q, parts, equipment, orders]);
  const flat = [
    ...results.parts.map((p) => `/parts/${p.id}`),
    ...results.eq.map((e) => `/${e.type === 'knife' ? 'knives' : 'rollers'}?open=${e.id}`),
    ...results.orders.map((o) => `/orders/${o.id}`),
  ];
  const go = (to: string) => { navigate(to); setOpen(false); setQ(''); inputRef.current?.blur(); };
  let idx = -1;

  return (
    <div className="grow pop-anchor" ref={wrap} style={{ maxWidth: 640 }} data-tour="search">
      <div className="input-wrap">
        <Search size={20} />
        <input ref={inputRef} className="input" value={q} placeholder="Search parts, part #, knives, rollers, orders…" aria-label="Search everything"
          style={{ minHeight: '2.9rem' }}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }} onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter') { if (flat[active]) go(flat[active]); else if (q.trim()) go(`/parts?q=${encodeURIComponent(q)}`); }
            else if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
          }} />
        {!q && <span className="kbd-hint desktop-only" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>/</span>}
      </div>
      {open && q.trim() && (
        <div className="popover search-results" style={{ left: 0, right: 'auto', width: '100%', minWidth: 'min(520px, 94vw)' }}>
          {flat.length === 0 && <div className="empty small">No matches for “{q}”.</div>}
          {results.parts.length > 0 && <div className="search-group">Parts</div>}
          {results.parts.map((p) => {
            idx++; const i = idx; const st = stockStatus(p);
            return (
              <button key={p.id} className="list-item" style={{ background: active === i ? 'var(--primary-soft)' : undefined }} onMouseEnter={() => setActive(i)} onClick={() => go(`/parts/${p.id}`)}>
                <Thumb id={p.imageId} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontWeight: 700 }}>{p.name}</div>
                  <div className="small muted ellipsis">{[p.partNumber, p.manufacturer, p.location].filter(Boolean).join(' · ')}</div>
                </div>
                <span className={`qty-big ${st}`}>{p.qty}</span>
              </button>
            );
          })}
          {results.eq.length > 0 && <div className="search-group">Hot knives & rollers</div>}
          {results.eq.map((e) => {
            idx++; const i = idx;
            return (
              <button key={e.id} className="list-item" style={{ background: active === i ? 'var(--primary-soft)' : undefined }} onMouseEnter={() => setActive(i)} onClick={() => go(`/${e.type === 'knife' ? 'knives' : 'rollers'}?open=${e.id}`)}>
                <span className="li-icon">{e.type === 'knife' ? <Flame size={19} /> : <CircleDot size={19} />}</span>
                <div className="grow"><b>{e.tag}</b><div className="small muted">{e.machine ? `${e.machine}${e.position ? ` · ${e.position}` : ''}` : e.status}</div></div>
              </button>
            );
          })}
          {results.orders.length > 0 && <div className="search-group">Order guides</div>}
          {results.orders.map((o) => {
            idx++; const i = idx;
            return (
              <button key={o.id} className="list-item" style={{ background: active === i ? 'var(--primary-soft)' : undefined }} onMouseEnter={() => setActive(i)} onClick={() => go(`/orders/${o.id}`)}>
                <span className="li-icon"><ClipboardList size={19} /></span>
                <div className="grow"><b>{o.number}</b> · {o.title}<div className="small muted">{o.items.length} items · {o.status}</div></div>
              </button>
            );
          })}
          {results.parts.length > 0 && <a className="list-item small" href={`#/parts?q=${encodeURIComponent(q)}`} onClick={() => { setOpen(false); setQ(''); }}>See all matching parts →</a>}
        </div>
      )}
    </div>
  );
}

export function UserMenuLinks() {
  return (
    <>
      <a href="#/profile"><UserCircle2 size={19} />My settings</a>
      <button className="danger" onClick={() => logout()}><LogOut size={19} />Sign out</button>
    </>
  );
}
