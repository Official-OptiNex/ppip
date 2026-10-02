// First-login guided walkthrough. Highlights real parts of the screen, moving between pages.
// Restart any time: Help page or My settings → "Take the tour" (dispatches the 'ppip:tour' event).
import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, X, PartyPopper } from 'lucide-react';
import { savePrefs, useStore } from '../lib/store';
import { navigate } from '../lib/util';
import { t } from '../lib/i18n';
import { rich } from './ui';
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
    { route: '/', title: t('Welcome, {name}! 👋', { name }), body: rich('This quick tour shows you around — it takes about two minutes. Use **Next** and **Back**, or **Skip** any time. You can replay it later from the **Help** page.') },
    { route: '/', target: 'nav', title: t('The menu'), body: rich('Everything lives here: **Shift Notes**, **Parts**, **Order Guides**, **PMs**, **Hot Knives**, **Rollers**, **Sonic Welders**, **Downtime** and **Crushed Cores**. Reports, labels and more are under **More tools**. Red and orange numbers mean something needs attention. On a phone, tap **More** at the bottom.') },
    { route: '/', target: 'search', title: t('Search anything'), body: rich('Type a part name, part number, manufacturer, machine, or a knife / roller tag. Results show as you type. Shortcut: press **/** on the keyboard.') },
    { route: '/', target: 'live', title: t('Always live'), body: rich("The green **Live** dot means you're connected. Changes from anyone show up on every screen instantly — no refreshing. If the internet drops, keep working; it syncs when it's back.") },
    { route: '/', target: 'alerts', title: t('Alerts'), body: rich('The bell shows parts that are **out of stock** or **running low**, PMs that are due, and other notices.') },
    { route: '/', target: 'theme', title: t('Light or dark'), body: rich('Switch between dark and light mode here. Text size, language (English / Español) and your profile picture are in **My settings** — click your name at the bottom-left.') },
    { route: '/', target: 'tiles', title: t('Your dashboard'), body: rich("A quick overview: what's out, what's low, PMs due and open orders. Click any box to jump straight to it.") },
    { route: '/', target: 'quick-actions', editorOnly: true, title: t('Quick buttons'), body: rich('The jobs you do most, one tap away: take a part, log a PM or downtime, a crushed core, a shift note, and more.') },
    { route: '/notes', target: 'notes-add', editorOnly: true, title: t('Shift notes'), body: rich('Leave a note for the next shift. Tick **Needs follow-up** if something still has to be done; it stays orange until someone clicks **Mark done**. Messages from admins (announcements) show as a coloured bar at the top of every page.') },
    { route: '/parts', target: 'status-chips', title: t('Parts & stock colors'), body: <>{rich('**Green** = in stock · **Orange** = running low · **Red** = order now / out.')} {t('Tap a button to show only those parts.')}</> },
    { route: '/parts', target: 'parts-list', title: t('Every part in one place'), body: rich('Click a column heading to sort. Click a part to see its photo, details, order link and full history. **Take** and **Add** change the stock count and log who did it.') },
    { route: '/parts', target: 'add-part', editorOnly: true, title: t('Add a part'), body: rich('Fill in the name, number and manufacturer — the order link builds itself for most suppliers. Add a photo from the PC or take one with your phone.') },
    { route: '/parts', target: 'quicklog', editorOnly: true, title: t('Quick log'), body: rich('This button is on every page. Tap it, pick **Used** or **Received**, type the part, done — the fastest way to log parts.') },
    { route: '/pms', target: 'log-pm', title: t('Machine PMs'), body: rich('Log each weekly or monthly PM here. The next due date fills in by itself — 7 days after the last PM, and a monthly once a month. Overdue machines turn red.') },
    { route: '/knives', target: 'eq-add', title: t('Hot knives & rollers'), body: rich("See which knife or roller is on which machine and for how many days. Use **Install**, **Remove** and **Move**. Open one to see every install and pull date; **How long they last** shows the average life.") },
    { route: '/welders', target: 'welders', title: t('Sonic welders'), body: rich('Each welder has one horn and one anvil. Use **Change horn** or **Change anvil** when you swap one — the old one goes back to spares and its days are saved.') },
    { route: '/downtime', target: 'downtime-add', editorOnly: true, title: t('Downtime & glitches'), body: rich('Log every stop: machine, how many minutes, what happened and what fixed it. You will see which machines lose the most time.') },
    { route: '/cores', target: 'cores-add', editorOnly: true, title: t('Crushed cores'), body: rich('Click **Add crushed core**, scan or type the tag and press Enter. Date and time fill in by themselves.') },
    { route: '/orders', target: 'new-order', editorOnly: true, title: t('Order guides — no more handwriting'), body: rich('Type up what you need and why, then print it in the standard format. **From low stock** builds the list for you.') },
    { route: '/labels', target: 'label-size', title: t('Labels'), body: rich('Print labels on the 4×6 Zebra printer: one big label, or 2 to 12 small ones on one sheet to cut out for bins and boxes.') },
    { route: '/profile', target: 'text-size', title: t('Make it comfortable'), body: rich('Pick the text size that is easiest to read, your language and a profile picture. It is saved to your account on every computer.') },
    { route: '/', title: t("You're all set! 🎉"), body: rich("That's it. If you get stuck, the **Help** page in the menu has short how-tos and common questions, and you can replay this tour from there any time.") },
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
    // (waits until the language has been chosen, so the tour is in the right language)
    if (phase === 'ready' && me && me.prefs?.lang && !me.prefs?.tutorialDone) { setI(0); setAsRole(undefined); setOpen(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, me?.id, me?.prefs?.tutorialDone, me?.prefs?.lang]);
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
    // need room for the whole card (text + Next button); otherwise go above, or beside the highlight
    if (vh - below > 330) cardStyle = { top: below, left, maxHeight: vh - below - 12 };
    else if (above > 330) cardStyle = { bottom: vh - above, left, maxHeight: above - 12 };
    else cardStyle = { top: Math.max(12, Math.min(rect.top, vh - 360)), maxHeight: vh - Math.max(12, Math.min(rect.top, vh - 360)) - 12, left: rect.right + cardW + 24 < vw ? rect.right + 20 : Math.max(12, rect.left - cardW - 20) };
  } else if (rect) {
    cardStyle = { left: 12, right: 12, ...(rect.top > vh / 2 ? { top: 12 } : { bottom: 12 }) }; // phones: card at top/bottom, away from the highlight
  } else {
    cardStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }
  return (
    <div className="tour-root" role="dialog" aria-modal="true" aria-label={t('Guided tour')}>
      <div className="tour-block" />
      {rect ? <div className="tour-spot" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} /> : <div className="tour-dim" />}
      <div className="tour-card" style={{ width: cardW, ...cardStyle }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="small muted" style={{ fontWeight: 700 }}>{t('Step {i} of {n}', { i: index + 1, n: total })}</span>
          <button className="btn icon sm ghost" onClick={onSkip} aria-label={t('Close tour')} title={t('Close tour')}><X size={18} /></button>
        </div>
        <h2 style={{ margin: '0.2rem 0 0.5rem' }}>{index + 1 === total && <PartyPopper size={22} style={{ verticalAlign: -3, marginRight: 6 }} />}{step.title}</h2>
        <div style={{ fontSize: '1.02rem', lineHeight: 1.5 }}>{step.body}</div>
        <div className="tour-dots" aria-hidden>{Array.from({ length: total }, (_, k) => <i key={k} className={k === index ? 'on' : k < index ? 'done' : ''} />)}</div>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: '0.4rem' }}>
          {index === 0 ? <button className="btn ghost" onClick={onSkip}>{t('Skip tour')}</button> : <button className="btn" onClick={onBack}><ArrowLeft size={18} />{t('Back')}</button>}
          <button className="btn primary lg" onClick={onNext} autoFocus>{index + 1 === total ? t('Finish') : index === 0 ? t("Let's go") : t('Next')}{index + 1 < total && <ArrowRight size={18} />}</button>
        </div>
      </div>
    </div>
  );
}
