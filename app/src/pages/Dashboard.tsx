import { useMemo, useState } from 'react';
import { Package, XCircle, AlertTriangle, Wrench, ClipboardList, Plus, ShoppingCart, Activity as ActivityIcon, PackagePlus, ArrowRight, Timer, Cylinder } from 'lucide-react';
import { locale, plural, t } from '../lib/i18n';
import { fmtMinutes, startOfWeek } from './Downtime';
import { useCanEdit, useStore } from '../lib/store';
import { stockStatus, money, partValue, timeAgo, navigate, reorderQty } from '../lib/util';
import { usePmStates, pmDueCount } from '../lib/pmhooks';
import { parseDay } from '../../../shared/pm';

const PM_CLS = { overdue: 'danger', today: 'warn', soon: 'warn', ok: 'ok', never: 'warn' } as const;
import { Thumb, Empty } from '../components/ui';
import { StockDialog } from '../components/PartDialogs';
import type { Part } from '../../../shared/types';

export function Dashboard() {
  const me = useStore((s) => s.me);
  const parts = useStore((s) => s.docs.parts);
  const equipment = useStore((s) => s.docs.equipment);
  const orders = useStore((s) => s.docs.orders);
  const settings = useStore((s) => s.settings);
  const downtime = useStore((s) => s.docs.downtime);
  const cores = useStore((s) => s.docs.cores);
  const activity = useStore((s) => s.activity);
  const canEdit = useCanEdit();
  const [receive, setReceive] = useState<Part | null>(null);
  const pmStates = usePmStates();
  const pmDue = pmDueCount(pmStates);

  const d = useMemo(() => {
    const list = Object.values(parts);
    const active = list.filter((p) => !p.decommissioned);
    const out = active.filter((p) => stockStatus(p) === 'out' || stockStatus(p) === 'order').sort((a, b) => Number(stockStatus(a) === 'order') - Number(stockStatus(b) === 'order') || Number(!!b.critical) - Number(!!a.critical) || a.name.localeCompare(b.name));
    const low = active.filter((p) => stockStatus(p) === 'low').sort((a, b) => Number(!!b.critical) - Number(!!a.critical) || a.qty - b.qty);
    const value = active.reduce((s, p) => s + partValue(p), 0);
    const openOrders = Object.values(orders).filter((o) => !['received', 'cancelled'].includes(o.status));
    const wk = startOfWeek();
    const dtWeek = Object.values(downtime).filter((x) => x.startedAt >= wk);
    return {
      active: active.length, out, low, value, openOrders,
      dtMin: dtWeek.reduce((s, x) => s + (x.minutes || 0), 0), dtCount: dtWeek.length,
      coresWeek: Object.values(cores).filter((c) => c.at >= wk).length,
    };
  }, [parts, equipment, orders, settings, downtime, cores]);

  const hour = new Date().getHours();
  const greet = t(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening');
  const attention = [...d.out, ...d.low];

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>{greet}, {me?.name?.split(' ')[0]}</h1>
          <div className="sub">{new Date().toLocaleDateString(locale(), { weekday: 'long', month: 'long', day: 'numeric' })} · {settings.companyName}</div>
        </div>
        {canEdit && (
          <div className="btn-group">
            <button className="btn lg" onClick={() => navigate('/orders/new')}><ClipboardList />{t('New order guide')}</button>
            <button className="btn primary lg" onClick={() => navigate('/parts/new')}><Plus />{t('Add part')}</button>
          </div>
        )}
      </div>

      <div className="tiles" data-tour="tiles">
        <a className={`tile ${d.out.length ? 'danger' : 'ok'}`} href="#/parts?status=reorder"><span className="t-label"><XCircle size={18} />{t('Out / order now')}</span><span className="t-value">{d.out.length}</span><span className="t-sub">{d.out.length ? t('need ordering now') : t('nothing out — nice')}</span></a>
        <a className={`tile ${d.low.length ? 'warn' : 'ok'}`} href="#/parts?status=low"><span className="t-label"><AlertTriangle size={18} />{t('Running low')}</span><span className="t-value">{d.low.length}</span><span className="t-sub">{t('at or below reorder point')}</span></a>
        <a className={`tile ${pmStates.some((x) => x.status === 'overdue') ? 'danger' : pmDue ? 'warn' : 'ok'}`} href="#/pms"><span className="t-label"><Wrench size={18} />{t('PMs due')}</span><span className="t-value">{pmDue}</span><span className="t-sub">{t('{n} more this week', { n: pmStates.filter((x) => x.daysLeft != null && x.daysLeft > 0 && x.daysLeft <= 7).length })}</span></a>
        <a className="tile" href="#/orders"><span className="t-label"><ClipboardList size={18} />{t('Open orders')}</span><span className="t-value">{d.openOrders.length}</span><span className="t-sub">{t('order guides in progress')}</span></a>
        <a className={`tile ${d.dtCount ? 'warn' : 'ok'}`} href="#/downtime"><span className="t-label"><Timer size={18} />{t('Downtime this week')}</span><span className="t-value">{fmtMinutes(d.dtMin)}</span><span className="t-sub">{plural(d.dtCount, '{n} stop', '{n} stops')}</span></a>
        <a className="tile" href="#/cores"><span className="t-label"><Cylinder size={18} />{t('Crushed cores')}</span><span className="t-value">{d.coresWeek}</span><span className="t-sub">{t('this week')}</span></a>
      </div>

      <div className="grid-cards">
        <div className="card">
          <div className="card-head">
            <h3>{t('Needs attention')}</h3>
            {attention.length > 0 && canEdit && <a className="btn sm" href="#/orders/new?from=low"><ShoppingCart size={16} />{t('Order all')}</a>}
          </div>
          {attention.length === 0 ? <Empty icon={<Package size={40} />} title="All stocked up">{t('No parts are low or out.')}</Empty> : (
            <div className="list">
              {attention.slice(0, 8).map((p) => (
                <div key={p.id} className="list-item" style={{ cursor: 'pointer', alignItems: 'center' }} onClick={() => navigate(`/parts/${p.id}`)}>
                  <Thumb id={p.imageId} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="ellipsis" style={{ fontWeight: 700 }}>{p.name}</div>
                    <div className="small muted ellipsis">{[p.partNumber, p.location].filter(Boolean).join(' · ')} · {t('suggest order {n}', { n: reorderQty(p) })}</div>
                  </div>
                  <span className={`pill ${stockStatus(p)}`}>{t(stockStatus(p) === 'out' ? 'Out' : stockStatus(p) === 'order' ? 'Order now' : 'Low')} · {p.qty}</span>
                  {canEdit && <button className="btn sm icon" title={t('Receive')} onClick={(e) => { e.stopPropagation(); setReceive(p); }}><PackagePlus size={18} /></button>}
                </div>
              ))}
              {attention.length > 8 && <a className="list-item" href="#/parts?status=reorder">{t('See all {n}', { n: attention.length })} <ArrowRight size={16} /></a>}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head"><h3>{t('Machine PMs')}</h3><a className="btn sm" href="#/pms">{t('Open')}</a></div>
          {pmStates.length === 0 ? <Empty icon={<Wrench size={40} />} title="No PMs set up">{t('Turn on PM tracking for machines on the PMs page.')} <a href="#/pms/setup">{t('Set up PMs')}</a></Empty> : (
            <div className="list">
              {pmStates.slice(0, 8).map((st) => (
                <a key={st.machine} className="list-item" href={canEdit ? `#/pms?log=${encodeURIComponent(st.machine)}` : '#/pms'} style={{ alignItems: 'center' }}>
                  <span className={`li-icon ${PM_CLS[st.status]}`}><Wrench size={18} /></span>
                  <div className="grow">
                    <b>{st.machine}</b>
                    <div className="small muted">{st.status === 'never' ? t('No PM logged yet') : t(st.nextType === 'monthly' ? 'Monthly PM due {date}' : 'Weekly PM due {date}', { date: parseDay(st.nextDue!).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' }) })}</div>
                  </div>
                  <span className={`pill ${PM_CLS[st.status]}`}>{st.status === 'never' ? t('Due now') : st.status === 'overdue' ? t('{n}d overdue', { n: -(st.daysLeft || 0) }) : st.status === 'today' ? t('Today') : t('{n}d', { n: st.daysLeft })}</span>
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head"><h3>{t('Live activity')}</h3><a className="btn sm" href="#/activity"><ActivityIcon size={16} />{t('All')}</a></div>
          {activity.length === 0 ? <Empty title="No activity yet" /> : (
            <div className="list">
              {activity.slice(0, 9).map((a) => (
                <div key={a.id} className="list-item">
                  <div className="grow">
                    <div>{a.summary}</div>
                    <div className="small muted">{a.userName} · {timeAgo(a.at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {receive && <StockDialog part={receive} mode="receive" onClose={() => setReceive(null)} />}
    </div>
  );
}
