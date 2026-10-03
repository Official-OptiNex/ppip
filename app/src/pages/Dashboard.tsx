import { useMemo, useState, type ReactNode } from 'react';
import {
  Package, XCircle, AlertTriangle, Wrench, ClipboardList, Plus, ShoppingCart, Activity as ActivityIcon, PackagePlus, ArrowRight, Timer, Cylinder,
  PackageMinus, NotebookPen, Tag, Flag, Megaphone, CheckCircle2, Sparkles,
} from 'lucide-react';
import { locale, plural, t } from '../lib/i18n';
import { fmtMinutes, startOfWeek } from './Downtime';
import { useCanEdit, useIsAdmin, useStore } from '../lib/store';
import { stockStatus, money, partValue, timeAgo, navigate, reorderQty } from '../lib/util';
import { usePmStates, pmDueCount } from '../lib/pmhooks';
import { parseDay } from '../../../shared/pm';
import { Thumb, Empty, UserAvatar } from '../components/ui';
import { StockDialog } from '../components/PartDialogs';
import { openQuickLog } from '../components/QuickLog';
import type { Part } from '../../../shared/types';

const PM_CLS = { overdue: 'danger', today: 'warn', soon: 'warn', ok: 'ok', never: 'warn' } as const;

/** Home screen: what needs doing today at the top, one-tap jobs, then the numbers and the details. */
export function Dashboard() {
  const me = useStore((s) => s.me);
  const parts = useStore((s) => s.docs.parts);
  const orders = useStore((s) => s.docs.orders);
  const settings = useStore((s) => s.settings);
  const downtime = useStore((s) => s.docs.downtime);
  const cores = useStore((s) => s.docs.cores);
  const notes = useStore((s) => s.docs.notes);
  const activity = useStore((s) => s.activity);
  const canEdit = useCanEdit();
  const isAdmin = useIsAdmin();
  const [receive, setReceive] = useState<Part | null>(null);
  const pmStates = usePmStates();
  const pmDue = pmDueCount(pmStates);
  const pmOverdue = pmStates.filter((x) => x.status === 'overdue').length;

  const d = useMemo(() => {
    const active = Object.values(parts).filter((p) => !p.decommissioned);
    const out = active.filter((p) => stockStatus(p) === 'out' || stockStatus(p) === 'order').sort((a, b) => Number(stockStatus(a) === 'order') - Number(stockStatus(b) === 'order') || Number(!!b.critical) - Number(!!a.critical) || a.name.localeCompare(b.name));
    const low = active.filter((p) => stockStatus(p) === 'low').sort((a, b) => Number(!!b.critical) - Number(!!a.critical) || a.qty - b.qty);
    const wk = startOfWeek();
    const dtWeek = Object.values(downtime).filter((x) => x.startedAt >= wk);
    const allNotes = Object.values(notes).sort((a, b) => (b.createdAt || b.updatedAt || 0) - (a.createdAt || a.updatedAt || 0));
    return {
      out, low, value: active.reduce((s, p) => s + partValue(p), 0), partCount: active.length,
      openOrders: Object.values(orders).filter((o) => !['received', 'cancelled'].includes(o.status)).length,
      dtMin: dtWeek.reduce((s, x) => s + (x.minutes || 0), 0), dtCount: dtWeek.length,
      coresWeek: Object.values(cores).filter((c) => c.at >= wk).length,
      followUps: allNotes.filter((n) => n.followUp && !n.done),
      recentNotes: allNotes.slice(0, 4),
    };
  }, [parts, orders, downtime, cores, notes]);

  const hour = new Date().getHours();
  const greet = t(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening');
  const attention = [...d.out, ...d.low];
  // the "today" strip: only the things that need someone, most urgent first
  const todo: { cls: string; icon: ReactNode; text: string; to: string }[] = [];
  if (d.out.length) todo.push({ cls: 'danger', icon: <XCircle size={18} />, text: plural(d.out.length, '{n} part to order now', '{n} parts to order now'), to: '/parts?status=reorder' });
  if (pmOverdue) todo.push({ cls: 'danger', icon: <Wrench size={18} />, text: plural(pmOverdue, '{n} PM overdue', '{n} PMs overdue'), to: '/pms' });
  else if (pmDue) todo.push({ cls: 'warn', icon: <Wrench size={18} />, text: plural(pmDue, '{n} PM due', '{n} PMs due'), to: '/pms' });
  if (d.followUps.length) todo.push({ cls: 'warn', icon: <Flag size={18} />, text: plural(d.followUps.length, '{n} shift note to follow up', '{n} shift notes to follow up'), to: '/notes?show=open' });
  if (d.low.length) todo.push({ cls: 'warn', icon: <AlertTriangle size={18} />, text: plural(d.low.length, '{n} part running low', '{n} parts running low'), to: '/parts?status=low' });

  return (
    <div className="dash">
      <section className="dash-hero">
        <div className="dash-hello">
          <h1>{greet}, {me?.name?.split(' ')[0]}</h1>
          <div className="sub">{new Date().toLocaleDateString(locale(), { weekday: 'long', month: 'long', day: 'numeric' })}{settings.companyName ? ` · ${settings.companyName}` : ''}</div>
        </div>
        <div className="dash-today" data-testid="dash-today">
          {todo.length === 0
            ? <div className="today-chip ok"><CheckCircle2 size={18} />{t('All caught up — nothing needs you right now')}</div>
            : todo.map((x) => <a key={x.to + x.text} className={`today-chip ${x.cls}`} href={`#${x.to}`}>{x.icon}{x.text}<ArrowRight size={16} /></a>)}
        </div>
      </section>

      {canEdit && (
        <section className="quick-actions no-print" data-tour="quick-actions" aria-label={t('Quick actions')}>
          <button className="qa qa-blue" onClick={() => openQuickLog('use')}><span className="qa-ic"><PackageMinus /></span>{t('Take a part')}</button>
          <button className="qa qa-green" onClick={() => openQuickLog('receive')}><span className="qa-ic"><PackagePlus /></span>{t('Receive parts')}</button>
          <a className="qa qa-purple" href="#/pms?log="><span className="qa-ic"><Wrench /></span>{t('Log a PM')}</a>
          <a className="qa qa-orange" href="#/downtime?log="><span className="qa-ic"><Timer /></span>{t('Log downtime')}</a>
          <a className="qa qa-red" href="#/cores?new"><span className="qa-ic"><Cylinder /></span>{t('Crushed core')}</a>
          <a className="qa qa-teal" href="#/notes"><span className="qa-ic"><NotebookPen /></span>{t('Shift note')}</a>
          <a className="qa qa-blue" href="#/orders/new"><span className="qa-ic"><ClipboardList /></span>{t('New order guide')}</a>
          <a className="qa qa-gray" href="#/labels"><span className="qa-ic"><Tag /></span>{t('Print labels')}</a>
          <a className="qa qa-gray" href="#/parts/new"><span className="qa-ic"><Plus /></span>{t('Add part')}</a>
          {isAdmin && <a className="qa qa-orange" href="#/admin/announcements"><span className="qa-ic"><Megaphone /></span>{t('Post announcement')}</a>}
        </section>
      )}

      <section className="stats tiles" data-tour="tiles">
        <Stat cls={d.out.length ? 'danger' : 'ok'} to="/parts?status=reorder" icon={<XCircle />} label={t('Out / order now')} value={d.out.length} sub={d.out.length ? t('need ordering now') : t('nothing out — nice')} />
        <Stat cls={d.low.length ? 'warn' : 'ok'} to="/parts?status=low" icon={<AlertTriangle />} label={t('Running low')} value={d.low.length} sub={t('at or below reorder point')} />
        <Stat cls={pmOverdue ? 'danger' : pmDue ? 'warn' : 'ok'} to="/pms" icon={<Wrench />} label={t('PMs due')} value={pmDue} sub={t('{n} more this week', { n: pmStates.filter((x) => x.daysLeft != null && x.daysLeft > 0 && x.daysLeft <= 7).length })} />
        <Stat cls={d.followUps.length ? 'warn' : 'ok'} to="/notes?show=open" icon={<Flag />} label={t('Follow-ups')} value={d.followUps.length} sub={t('open shift notes')} />
        <Stat cls={d.dtCount ? 'warn' : 'ok'} to="/downtime" icon={<Timer />} label={t('Downtime this week')} value={fmtMinutes(d.dtMin)} sub={plural(d.dtCount, '{n} stop', '{n} stops')} />
        <Stat cls="info" to="/cores" icon={<Cylinder />} label={t('Crushed cores')} value={d.coresWeek} sub={t('this week')} />
        <Stat cls="info" to="/orders" icon={<ClipboardList />} label={t('Open orders')} value={d.openOrders} sub={t('order guides in progress')} />
        <Stat cls="info" to="/parts" icon={<Package />} label={t('Parts')} value={d.partCount} sub={money(d.value)} />
      </section>

      <div className="dash-grid">
        <div className="dash-col">
          <div className="card">
            <div className="card-head">
              <h3><ShoppingCart size={19} className="h-ic" />{t('Needs attention')}</h3>
              {attention.length > 0 && canEdit && <a className="btn sm primary" href="#/orders/new?from=low"><ShoppingCart size={16} />{t('Order all')}</a>}
            </div>
            {attention.length === 0 ? <Empty icon={<Package size={40} />} title="All stocked up">{t('No parts are low or out.')}</Empty> : (
              <div className="list">
                {attention.slice(0, 6).map((p) => (
                  <div key={p.id} className="list-item" style={{ cursor: 'pointer', alignItems: 'center' }} onClick={() => navigate(`/parts/${p.id}`)}>
                    <Thumb id={p.imageId} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="ellipsis" style={{ fontWeight: 700 }}>{p.name}</div>
                      <div className="small muted ellipsis">{[p.partNumber, p.location].filter(Boolean).join(' · ')} · {t('suggest order {n}', { n: reorderQty(p) })}</div>
                    </div>
                    <span className={`pill ${stockStatus(p)}`}>{t(stockStatus(p) === 'out' ? 'Out' : stockStatus(p) === 'order' ? 'Order now' : 'Low')} · {p.qty}</span>
                    {canEdit && <button className="btn sm icon" title={t('Receive')} aria-label={t('Receive')} onClick={(e) => { e.stopPropagation(); setReceive(p); }}><PackagePlus size={18} /></button>}
                  </div>
                ))}
                {attention.length > 6 && <a className="list-item see-all" href="#/parts?status=reorder">{t('See all {n}', { n: attention.length })} <ArrowRight size={16} /></a>}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head"><h3><Wrench size={19} className="h-ic" />{t('Machine PMs')}</h3><a className="btn sm" href="#/pms">{t('Open')}</a></div>
            {pmStates.length === 0 ? <Empty icon={<Wrench size={40} />} title="No PMs set up">{t('Turn on PM tracking for machines on the PMs page.')} <a href="#/pms/setup">{t('Set up PMs')}</a></Empty> : (
              <div className="list">
                {pmStates.slice(0, 6).map((st) => (
                  <a key={st.machine} className="list-item" href={canEdit ? `#/pms?log=${encodeURIComponent(st.machine)}` : '#/pms'} style={{ alignItems: 'center' }}>
                    <span className={`li-icon ${PM_CLS[st.status]}`}><Wrench size={18} /></span>
                    <div className="grow">
                      <b>{st.machine}</b>
                      <div className="small muted">{st.status === 'never' ? t('No PM logged yet') : t(st.nextType === 'monthly' ? 'Monthly PM due {date}' : 'Weekly PM due {date}', { date: parseDay(st.nextDue!).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' }) })}</div>
                    </div>
                    <span className={`pill ${PM_CLS[st.status]}`}>{st.status === 'never' ? t('Due now') : st.status === 'overdue' ? t('{n}d overdue', { n: -(st.daysLeft || 0) }) : st.status === 'today' ? t('Today') : t('{n}d', { n: st.daysLeft })}</span>
                  </a>
                ))}
                {pmStates.length > 6 && <a className="list-item see-all" href="#/pms">{t('See all {n}', { n: pmStates.length })} <ArrowRight size={16} /></a>}
              </div>
            )}
          </div>
        </div>

        <div className="dash-col">
          <div className="card">
            <div className="card-head"><h3><NotebookPen size={19} className="h-ic" />{t('Shift notes')}</h3><a className="btn sm" href="#/notes">{t('Open')}</a></div>
            {d.recentNotes.length === 0 ? <Empty icon={<NotebookPen size={40} />} title="No shift notes yet">{canEdit && <a href="#/notes">{t('Leave a note for the next shift')}</a>}</Empty> : (
              <div className="list">
                {(d.followUps.length ? [...d.followUps.slice(0, 3), ...d.recentNotes.filter((n) => !(n.followUp && !n.done))].slice(0, 4) : d.recentNotes).map((n) => (
                  <a key={n.id} className="list-item" href="#/notes">
                    <UserAvatar name={n.author} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="clamp-2">{n.text}</div>
                      <div className="small muted">{[n.author, n.machine, timeAgo(n.createdAt || n.updatedAt)].filter(Boolean).join(' · ')}</div>
                    </div>
                    {n.followUp && !n.done && <span className="pill warn"><Flag size={13} /></span>}
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head"><h3><Sparkles size={19} className="h-ic" />{t('Live activity')}</h3><a className="btn sm" href="#/activity"><ActivityIcon size={16} />{t('All')}</a></div>
            {activity.length === 0 ? <Empty title="No activity yet" /> : (
              <div className="list">
                {activity.slice(0, 7).map((a) => (
                  <div key={a.id} className="list-item">
                    <UserAvatar name={a.userName} size={30} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="clamp-2">{a.summary}</div>
                      <div className="small muted">{a.userName} · {timeAgo(a.at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {receive && <StockDialog part={receive} mode="receive" onClose={() => setReceive(null)} />}
    </div>
  );
}

function Stat({ cls, to, icon, label, value, sub }: { cls: string; to: string; icon: ReactNode; label: string; value: ReactNode; sub: ReactNode }) {
  return (
    <a className={`tile stat ${cls}`} href={`#${to}`}>
      <span className="stat-ic">{icon}</span>
      <span className="stat-body">
        <span className="t-label">{label}</span>
        <span className="t-value">{value}</span>
        <span className="t-sub">{sub}</span>
      </span>
    </a>
  );
}
