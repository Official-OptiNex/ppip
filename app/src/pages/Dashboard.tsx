import { useMemo, useState } from 'react';
import { Package, XCircle, AlertTriangle, DollarSign, Flame, CircleDot, ClipboardList, Plus, FileText, ShoppingCart, Activity as ActivityIcon, PackagePlus, ArrowRight } from 'lucide-react';
import { useCanEdit, useStore } from '../lib/store';
import { stockStatus, money, partValue, pmState, timeAgo, navigate, fmtDuration, reorderQty } from '../lib/util';
import { Thumb, Empty } from '../components/ui';
import { StockDialog } from '../components/PartDialogs';
import type { Part } from '../../../shared/types';

export function Dashboard() {
  const me = useStore((s) => s.me);
  const parts = useStore((s) => s.docs.parts);
  const equipment = useStore((s) => s.docs.equipment);
  const orders = useStore((s) => s.docs.orders);
  const settings = useStore((s) => s.settings);
  const activity = useStore((s) => s.activity);
  const canEdit = useCanEdit();
  const [receive, setReceive] = useState<Part | null>(null);

  const d = useMemo(() => {
    const list = Object.values(parts);
    const active = list.filter((p) => !p.decommissioned);
    const out = active.filter((p) => stockStatus(p) === 'out').sort((a, b) => Number(!!b.critical) - Number(!!a.critical) || a.name.localeCompare(b.name));
    const low = active.filter((p) => stockStatus(p) === 'low').sort((a, b) => Number(!!b.critical) - Number(!!a.critical) || a.qty - b.qty);
    const value = active.reduce((s, p) => s + partValue(p), 0);
    const eq = Object.values(equipment).map((e) => ({ e, pm: pmState(e, settings) }));
    const due = eq.filter((x) => x.pm.state === 'due' || x.pm.state === 'soon').sort((a, b) => b.pm.pct - a.pm.pct);
    const openOrders = Object.values(orders).filter((o) => !['received', 'cancelled'].includes(o.status));
    return {
      active: active.length, out, low, value, due, openOrders,
      knivesOn: eq.filter((x) => x.e.type === 'knife' && x.e.status === 'installed').length,
      rollersOn: eq.filter((x) => x.e.type === 'roller' && x.e.status === 'installed').length,
    };
  }, [parts, equipment, orders, settings]);

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const attention = [...d.out, ...d.low];

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>{greet}, {me?.name?.split(' ')[0]}</h1>
          <div className="sub">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · {settings.companyName}</div>
        </div>
        {canEdit && (
          <div className="btn-group">
            <button className="btn lg" onClick={() => navigate('/orders/new')}><ClipboardList />New order guide</button>
            <button className="btn primary lg" onClick={() => navigate('/parts/new')}><Plus />Add part</button>
          </div>
        )}
      </div>

      <div className="tiles">
        <a className="tile info" href="#/parts"><span className="t-label"><Package size={18} />Active parts</span><span className="t-value">{d.active}</span><span className="t-sub">in the database</span></a>
        <a className={`tile ${d.out.length ? 'danger' : 'ok'}`} href="#/parts?status=out"><span className="t-label"><XCircle size={18} />Out of stock</span><span className="t-value">{d.out.length}</span><span className="t-sub">{d.out.length ? 'need ordering now' : 'nothing out — nice'}</span></a>
        <a className={`tile ${d.low.length ? 'warn' : 'ok'}`} href="#/parts?status=low"><span className="t-label"><AlertTriangle size={18} />Running low</span><span className="t-value">{d.low.length}</span><span className="t-sub">at or below reorder point</span></a>
        <a className="tile" href="#/analytics"><span className="t-label"><DollarSign size={18} />Inventory value</span><span className="t-value" style={{ fontSize: '1.6rem' }}>{money(d.value, 0)}</span><span className="t-sub">parts on the shelf</span></a>
        <a className={`tile ${d.due.some((x) => x.pm.state === 'due') ? 'warn' : ''}`} href="#/knives"><span className="t-label"><Flame size={18} />Knives / rollers</span><span className="t-value">{d.knivesOn} / {d.rollersOn}</span><span className="t-sub">{d.due.filter((x) => x.pm.state === 'due').length} PM due · {d.due.filter((x) => x.pm.state === 'soon').length} due soon</span></a>
        <a className="tile" href="#/orders"><span className="t-label"><ClipboardList size={18} />Open orders</span><span className="t-value">{d.openOrders.length}</span><span className="t-sub">order guides in progress</span></a>
      </div>

      <div className="grid-cards">
        <div className="card">
          <div className="card-head">
            <h3>Needs attention</h3>
            {attention.length > 0 && canEdit && <a className="btn sm" href="#/orders/new?from=low"><ShoppingCart size={16} />Order all</a>}
          </div>
          {attention.length === 0 ? <Empty icon={<Package size={40} />} title="All stocked up">No parts are low or out.</Empty> : (
            <div className="list">
              {attention.slice(0, 8).map((p) => (
                <div key={p.id} className="list-item" style={{ cursor: 'pointer', alignItems: 'center' }} onClick={() => navigate(`/parts/${p.id}`)}>
                  <Thumb id={p.imageId} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="ellipsis" style={{ fontWeight: 700 }}>{p.name}</div>
                    <div className="small muted ellipsis">{[p.partNumber, p.location].filter(Boolean).join(' · ')} · suggest order {reorderQty(p)}</div>
                  </div>
                  <span className={`pill ${stockStatus(p)}`}>{stockStatus(p) === 'out' ? 'Out' : 'Low'} · {p.qty}</span>
                  {canEdit && <button className="btn sm icon" title="Receive" onClick={(e) => { e.stopPropagation(); setReceive(p); }}><PackagePlus size={18} /></button>}
                </div>
              ))}
              {attention.length > 8 && <a className="list-item" href="#/parts?status=reorder">See all {attention.length} <ArrowRight size={16} /></a>}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head"><h3>Roller PM</h3><a className="btn sm" href="#/rollers">Open</a></div>
          {d.due.length === 0 ? <Empty icon={<CircleDot size={40} />} title="Nothing due">All installed rollers are within their PM interval.</Empty> : (
            <div className="list">
              {d.due.slice(0, 8).map(({ e, pm }) => (
                <a key={e.id} className="list-item" href={`#/${e.type === 'knife' ? 'knives' : 'rollers'}?open=${e.id}`}>
                  <span className={`li-icon ${pm.state === 'due' ? 'danger' : 'warn'}`}>{e.type === 'knife' ? <Flame size={18} /> : <CircleDot size={18} />}</span>
                  <div className="grow">
                    <b>{e.tag}</b> <span className="muted">on {e.machine}{e.position ? ` · ${e.position}` : ''}</span>
                    <div className="small muted">{fmtDuration(pm.days)} on machine · PM every {pm.interval} days</div>
                  </div>
                  <span className={`pill ${pm.state === 'due' ? 'danger' : 'warn'}`}>{pm.state === 'due' ? 'Due' : 'Soon'}</span>
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head"><h3>Live activity</h3><a className="btn sm" href="#/activity"><ActivityIcon size={16} />All</a></div>
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

        <div className="card">
          <div className="card-head"><h3>Quick links</h3></div>
          <div className="card-body grid-2">
            <a className="btn lg" href="#/reports"><FileText />Weekly report</a>
            <a className="btn lg" href="#/analytics"><ActivityIcon />Analytics</a>
            <a className="btn lg" href="#/knives"><Flame />Hot knives</a>
            <a className="btn lg" href="#/rollers"><CircleDot />Rollers</a>
            <a className="btn lg" href="#/labels"><Package />Print labels</a>
            <a className="btn lg" href="#/help">How to use</a>
          </div>
        </div>
      </div>
      {receive && <StockDialog part={receive} mode="receive" onClose={() => setReceive(null)} />}
    </div>
  );
}
