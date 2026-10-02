// First-login guided walkthrough. Highlights real parts of the screen, moving between pages.
// Restart any time: Help page or My settings → "Take the tour" (dispatches the 'ppip:tour' event).
import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, X, PartyPopper } from 'lucide-react';
import { savePrefs, useStore } from '../lib/store';
import { navigate } from '../lib/util';
import type { Role } from '../../../shared/types';

interface Step {
  route?: string; // page to show for this step
  target?: string; // data-tour="…" element to highlight (centered card if missing, e.g. on phones)
  title: string;
  body: ReactNode;
  editorOnly?: boolean;
}

/** Open the tour now. `asRole` previews the version a viewer / editor sees (handy when showing someone). */
export function startTour(asRole?: Role) { window.dispatchEvent(new CustomEvent('ppip:tour', { detail: { role: asRole } })); }

function steps(name: string): Step[] {
  return [
    { route: '/', title: `Welcome, ${name}! 👋`, body: <>This quick tour shows you around — it takes about two minutes. Use <b>Next</b> and <b>Back</b>, or <b>Skip</b> any time. You can replay it later from the <b>Help</b> page.</> },
    { route: '/', target: 'nav', title: 'The menu', body: <>Everything lives here: <b>Parts</b>, <b>Order Guides</b>, <b>PMs</b>, <b>Hot Knives</b>, <b>Rollers</b>, reports and more. Red and orange numbers mean something needs attention. On a phone, tap <b>More</b> at the bottom to open it.</> },
    { route: '/', target: 'search', title: 'Search anything', body: <>Type a part name, part number, manufacturer, machine, knife or roller tag. Results show as you type. Shortcut: press <b>/</b> on the keyboard.</> },
    { route: '/', target: 'live', title: 'Always live', body: <>The green <b>Live</b> dot means you're connected. Changes from anyone show up on every screen instantly — no refreshing. If the internet drops, keep working; it syncs when it's back.</> },
    { route: '/', target: 'alerts', title: 'Alerts', body: <>The bell shows parts that are <b>out of stock</b> or <b>running low</b>, PMs that are due, and other notices.</> },
    { route: '/', target: 'theme', title: 'Light or dark', body: <>Switch between dark and light mode here. Bigger text is under your name (bottom-left) → <b>Text size</b>.</> },
    { route: '/', target: 'tiles', title: 'Your dashboard', body: <>A quick overview: what's out, what's low, PMs due and open orders. Click any box to jump straight to it.</> },
    { route: '/parts', target: 'status-chips', title: 'Parts & stock colors', body: <><b style={{ color: 'var(--ok)' }}>Green</b> = in stock · <b style={{ color: 'var(--warn)' }}>Orange</b> = running low · <b style={{ color: 'var(--danger)' }}>Red</b> = order now / out. Tap a button to show only those parts.</> },
    { route: '/parts', target: 'parts-list', title: 'Every part in one place', body: <>Click a column heading to sort. Click a part to see its photo, details, order link and full history. <b>Take</b> and <b>Add</b> change the stock count and log who did it.</> },
    { route: '/parts', target: 'add-part', editorOnly: true, title: 'Add a part', body: <>Fill in the name, number and manufacturer — the order link builds itself for most suppliers. You can add a photo from the PC or take one with your phone.</> },
    { route: '/parts', target: 'quicklog', editorOnly: true, title: 'Quick log', body: <>This button is on every page. Tap it, pick <b>Used</b> or <b>Received</b>, type the part, done — the fastest way to log parts.</> },
    { route: '/pms', target: 'log-pm', title: 'Machine PMs', body: <>Log each weekly or monthly PM here. The next due date fills in automatically — 7 days after the last PM, with a monthly once a month. Overdue machines turn red.</> },
    { route: '/knives', target: 'eq-add', title: 'Hot knives & rollers', body: <>Track which knife or roller is on which machine and how many days it's been there. Use <b>Install</b>, <b>Remove</b> and <b>Move</b> to keep it current.</> },
    { route: '/downtime', target: 'downtime-add', editorOnly: true, title: 'Downtime, welders & crushed cores', body: <>Log every stop here — machine, minutes, what happened. <b>Sonic Welders</b> tracks horns and anvils, and <b>Crushed Cores</b> logs cores by tag number.</> },
    { route: '/orders', target: 'new-order', editorOnly: true, title: 'Order guides — no more handwriting', body: <>Type up what you need and why, then print it in the standard format. <b>From low stock</b> builds the list for you.</> },
    { route: '/profile', target: 'text-size', title: 'Make it comfortable', body: <>Pick the text size that's easiest to read. It's saved to your account on every computer.</> },
    { route: '/', title: "You're all set! 🎉", body: <>That's it. If you get stuck, the <b>Help</b> page in the menu has a short how-to, and you can replay this tour from there any time.</> },
  ];
}

export function TourHost() {
  const me = useStore((s) => s.me);
  const phase = useStore((s) => s.phase);
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [asRole, setAsRole] = useState<Role | undefined>();

  // first login: open automatically once
  useEffect(() => {
    if (phase === 'ready' && me && !me.prefs?.tutorialDone) { setI(0); setAsRole(undefined); setOpen(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, me?.id, me?.prefs?.tutorialDone]);
  useEffect(() => {
    const on = (e: Event) => { setI(0); setAsRole((e as CustomEvent<{ role?: Role }>).detail?.role); setOpen(true); };
    window.addEventListener('ppip:tour', on);
    return () => window.removeEventListener('ppip:tour', on);
  }, []);

  if (!open || !me) return null;
  const canEdit = (asRole || me.role) !== 'viewer';
  const list = steps(me.name.split(' ')[0]).filter((s) => canEdit || !s.editorOnly);
  const finish = () => { setOpen(false); savePrefs({ tutorialDone: true }); navigate('/'); };
  return <TourStep key={i} step={list[i]} index={i} total={list.length} onBack={() => setI(Math.max(0, i - 1))} onNext={() => (i + 1 >= list.length ? finish() : setI(i + 1))} onSkip={finish} />;
}

function TourStep({ step, index, total, onBack, onNext, onSkip }: { step: Step; index: number; total: number; onBack: () => void; onNext: () => void; onSkip: () => void }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [ready, setReady] = useState(!step.target);

  const find = useCallback(() => {
    if (!step.target) return null;
    // first match that is actually visible (desktop and phone layouts can both carry the marker)
    for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${step.target}"]`)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return { el, r };
    }
    return null; // hidden (e.g. sidebar on a phone) -> centered card
  }, [step.target]);

  // go to the step's page, then wait for the highlighted element to appear
  useEffect(() => {
    if (step.route != null) {
      const cur = (location.hash.replace(/^#/, '') || '/').split('?')[0];
      if (cur !== step.route) navigate(step.route);
    }
    if (!step.target) { setReady(true); return; }
    let tries = 0;
    const t = setInterval(() => {
      const hit = find();
      if (hit || ++tries > 25) {
        clearInterval(t);
        if (hit) { hit.el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior }); setRect(hit.el.getBoundingClientRect()); }
        setReady(true);
      }
    }, 80);
    return () => clearInterval(t);
  }, [step, find]);

  useLayoutEffect(() => {
    if (!step.target) return;
    const update = () => { const hit = find(); setRect(hit ? hit.r : null); };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [step.target, find]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); onNext(); }
      else if (e.key === 'ArrowLeft') onBack();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onNext, onBack, onSkip]);

  if (!ready) return <div className="tour-block" />;
  const pad = 8;
  const vw = window.innerWidth, vh = window.innerHeight;
  const cardW = Math.min(400, vw - 24);
  let cardStyle: React.CSSProperties;
  if (rect && vw > 700) {
    // put the card below the highlight if there's room, otherwise above, otherwise beside
    const below = rect.bottom + pad + 16, above = rect.top - pad - 16;
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - cardW / 2), vw - cardW - 12);
    if (vh - below > 240) cardStyle = { top: below, left };
    else if (above > 240) cardStyle = { bottom: vh - above, left };
    else cardStyle = { top: Math.max(12, Math.min(rect.top, vh - 300)), left: rect.right + cardW + 24 < vw ? rect.right + 20 : Math.max(12, rect.left - cardW - 20) };
  } else if (rect) {
    cardStyle = { left: 12, right: 12, ...(rect.top > vh / 2 ? { top: 12 } : { bottom: 12 }) }; // phones: card at top/bottom, away from the highlight
  } else {
    cardStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }
  return (
    <div className="tour-root" role="dialog" aria-modal="true" aria-label="Guided tour">
      <div className="tour-block" />
      {rect ? <div className="tour-spot" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} /> : <div className="tour-dim" />}
      <div className="tour-card" style={{ width: cardW, ...cardStyle }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="small muted" style={{ fontWeight: 700 }}>Step {index + 1} of {total}</span>
          <button className="btn icon sm ghost" onClick={onSkip} aria-label="Close tour"><X size={18} /></button>
        </div>
        <h2 style={{ margin: '0.2rem 0 0.5rem' }}>{index + 1 === total && <PartyPopper size={22} style={{ verticalAlign: -3, marginRight: 6 }} />}{step.title}</h2>
        <div style={{ fontSize: '1.02rem', lineHeight: 1.5 }}>{step.body}</div>
        <div className="tour-dots" aria-hidden>{Array.from({ length: total }, (_, k) => <i key={k} className={k === index ? 'on' : k < index ? 'done' : ''} />)}</div>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: '0.4rem' }}>
          {index === 0 ? <button className="btn ghost" onClick={onSkip}>Skip tour</button> : <button className="btn" onClick={onBack}><ArrowLeft size={18} />Back</button>}
          <button className="btn primary lg" onClick={onNext} autoFocus>{index + 1 === total ? 'Finish' : index === 0 ? "Let's go" : 'Next'}{index + 1 < total && <ArrowRight size={18} />}</button>
        </div>
      </div>
    </div>
  );
}
