import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, PackageMinus, DollarSign, XCircle, Truck, Star } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useStore } from '../lib/store';
import { money, num, partValue, stockStatus } from '../lib/util';
import { needsReorder } from '../../../shared/types';
import { BarChart, HBarList } from '../components/Charts';
import { Seg, Spinner } from '../components/ui';
import { locale, t } from '../lib/i18n';

interface AnalyticsData {
  monthly: { month: string; used: number; received: number; usedCost: number; receivedCost: number; events: number }[];
  topUsed: { partId: string; partName: string; used: number; times: number; cost: number }[];
  outEvents: { partId: string; partName: string; times: number; lastAt: number }[];
  byMachine: { machine: string; used: number; cost: number; times: number }[];
  byUser: { userName: string; times: number }[];
  receivedByPart: { partId: string; qty: number; cost: number }[];
  usedByPart: { partId: string; qty: number; cost: number }[];
}

export function AnalyticsPage() {
  const [months, setMonths] = useState<'3' | '6' | '12'>('12');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [err, setErr] = useState('');
  const lastMove = useStore((s) => s.lastMovementAt);
  const parts = useStore((s) => s.docs.parts);
  const vendors = useStore((s) => s.docs.vendors);

  useEffect(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() - Number(months) + 1);
    api<AnalyticsData>(`/analytics?from=${d.getTime()}&tz=${new Date().getTimezoneOffset()}`).then(setData).catch((e) => setErr(errorMessage(e)));
  }, [months, lastMove]);

  const monthly = useMemo(() => {
    if (!data) return [];
    const map = new Map(data.monthly.map((m) => [m.month, m]));
    const out = [];
    const d = new Date(); d.setDate(1);
    for (let i = Number(months) - 1; i >= 0; i--) {
      const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const key = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
      const m = map.get(key);
      out.push({ month: key, label: x.toLocaleDateString(locale(), { month: 'short' }) + (x.getMonth() === 0 || i === Number(months) - 1 ? ` '${String(x.getFullYear()).slice(2)}` : ''), used: m?.used || 0, received: m?.received || 0, usedCost: m?.usedCost || 0, receivedCost: m?.receivedCost || 0 });
    }
    return out;
  }, [data, months]);

  const totals = useMemo(() => ({
    used: monthly.reduce((s, m) => s + m.used, 0), usedCost: monthly.reduce((s, m) => s + m.usedCost, 0),
    receivedCost: monthly.reduce((s, m) => s + m.receivedCost, 0), outs: data?.outEvents.reduce((s, o) => s + o.times, 0) || 0,
  }), [monthly, data]);

  const list = useMemo(() => Object.values(parts).filter((p) => !p.decommissioned), [parts]);
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of list) m.set(p.category || '(none)', (m.get(p.category || '(none)') || 0) + partValue(p));
    return [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [list]);

  const suppliers = useMemo(() => {
    const spend = new Map<string, number>();
    const used = new Map<string, number>();
    const byId = new Map(list.map((p) => [p.id, p]));
    for (const r of data?.receivedByPart || []) { const v = byId.get(r.partId)?.vendor || '(none)'; spend.set(v, (spend.get(v) || 0) + r.cost); }
    for (const r of data?.usedByPart || []) { const v = byId.get(r.partId)?.vendor || '(none)'; used.set(v, (used.get(v) || 0) + r.cost); }
    const names = new Set([...Object.values(vendors).map((v) => v.name), ...list.map((p) => p.vendor || '(none)')]);
    return [...names].map((name) => {
      const v = Object.values(vendors).find((x) => x.name === name);
      const ps = list.filter((p) => (p.vendor || '(none)') === name);
      const leads = ps.map((p) => p.leadTimeDays ?? v?.leadTimeDays).filter((x): x is number => x != null);
      return {
        name, preferred: !!v?.preferred, parts: ps.length, value: ps.reduce((s, p) => s + partValue(p), 0),
        needs: ps.filter((p) => needsReorder(stockStatus(p))).length,
        lead: leads.length ? leads.reduce((a, b) => a + b, 0) / leads.length : null, spend: spend.get(name) || 0, usedCost: used.get(name) || 0,
      };
    }).filter((s) => s.parts > 0 || s.spend > 0).sort((a, b) => b.spend - a.spend || b.parts - a.parts);
  }, [data, list, vendors]);

  if (err) return <div className="banner danger">{err}</div>;
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div><h1>{t('Analytics')}</h1><div className="sub">{t('Usage, costs, stock-outs and suppliers. Updates live as parts are taken and received.')}</div></div>
        <Seg value={months} onChange={setMonths} options={[{ id: '3', label: t('{n} months', { n: 3 }) }, { id: '6', label: t('{n} months', { n: 6 }) }, { id: '12', label: t('{n} months', { n: 12 }) }]} />
      </div>
      {!data ? <div className="center" style={{ padding: 60 }}><Spinner /></div> : <>
        <div className="tiles">
          <div className="tile info"><span className="t-label"><PackageMinus size={18} />{t('Parts used')}</span><span className="t-value">{num(totals.used)}</span><span className="t-sub">{t('last {n} months', { n: months })}</span></div>
          <div className="tile"><span className="t-label"><DollarSign size={18} />{t('Cost of parts used')}</span><span className="t-value" style={{ fontSize: '1.6rem' }}>{money(totals.usedCost, 0)}</span><span className="t-sub">{t('at recorded unit cost')}</span></div>
          <div className="tile"><span className="t-label"><TrendingUp size={18} />{t('Restock spend')}</span><span className="t-value" style={{ fontSize: '1.6rem' }}>{money(totals.receivedCost, 0)}</span><span className="t-sub">{t('value received')}</span></div>
          <div className={`tile ${totals.outs ? 'danger' : 'ok'}`}><span className="t-label"><XCircle size={18} />{t('Stock-outs')}</span><span className="t-value">{totals.outs}</span><span className="t-sub">{t('times a part hit zero')}</span></div>
        </div>

        <div className="card">
          <div className="card-head"><h3>{t('Monthly usage')}</h3><span className="muted small">{t('quantity taken vs. received')}</span></div>
          <div className="card-body">
            <BarChart data={monthly} labelFor={(r) => String(r.label)} series={[{ key: 'used', label: t('Used'), color: 'var(--series-1)' }, { key: 'received', label: t('Received'), color: 'var(--series-2)' }]} />
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>{t('Monthly cost of parts used')}</h3></div>
          <div className="card-body"><BarChart data={monthly} labelFor={(r) => String(r.label)} series={[{ key: 'usedCost', label: t('Cost used'), color: 'var(--series-1)' }]} format={(n) => money(n, 0)} height={200} /></div>
        </div>

        <div className="grid-cards">
          <div className="card"><div className="card-head"><h3>{t('Most used parts')}</h3></div><div className="card-body">
            <HBarList rows={data.topUsed.map((u) => ({ key: u.partId, label: parts[u.partId]?.name || u.partName, value: u.used, sub: u.cost ? money(u.cost, 0) : undefined, href: `#/parts/${u.partId}` }))} empty="No usage recorded yet." />
          </div></div>
          <div className="card"><div className="card-head"><h3>{t('Frequently out of stock')}</h3></div><div className="card-body">
            <HBarList rows={data.outEvents.map((o) => ({ key: o.partId, label: parts[o.partId]?.name || o.partName, value: o.times, sub: parts[o.partId] ? t('now {n}', { n: parts[o.partId].qty }) : undefined, href: `#/parts/${o.partId}` }))} format={(n) => `${n}×`} empty="No stock-outs — great." />
            {data.outEvents.length > 0 && <p className="small muted" style={{ marginTop: 8 }}>{t('Tip: raise the “reorder at” level for parts that run out often.')}</p>}
          </div></div>
          <div className="card"><div className="card-head"><h3>{t('Usage by machine')}</h3></div><div className="card-body">
            <HBarList rows={data.byMachine.map((m) => ({ key: m.machine, label: m.machine, value: m.used, sub: m.cost ? money(m.cost, 0) : undefined }))} empty="Pick a machine when taking parts to see this." />
          </div></div>
          <div className="card"><div className="card-head"><h3>{t('Inventory value by category')}</h3></div><div className="card-body">
            <HBarList rows={byCategory.map(([k, v]) => ({ key: k, label: k, value: v, href: `#/parts?cat=${encodeURIComponent(k)}` }))} format={(n) => money(n, 0)} empty="Add unit costs to parts to see value." />
          </div></div>
        </div>

        <div className="card">
          <div className="card-head"><h3><Truck size={19} style={{ verticalAlign: -3 }} /> {t('Supplier tracking')}</h3><a className="btn sm" href="#/suppliers">{t('Manage suppliers')}</a></div>
          <div className="table-wrap" style={{ border: 0, boxShadow: 'none', borderRadius: 0 }}>
            <table className="tbl">
              <thead><tr><th>{t('Supplier')}</th><th className="num">{t('Parts')}</th><th className="num">{t('Need order')}</th><th className="num">{t('Avg lead time')}</th><th className="num">{t('On-hand value')}</th><th className="num">{t('Received ({n} mo)', { n: months })}</th><th className="num">{t('Used ({n} mo)', { n: months })}</th></tr></thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.name}>
                    <td><a href={`#/parts?vendor=${encodeURIComponent(s.name)}`}><b>{s.name}</b></a>{s.preferred && <Star size={14} fill="var(--warn)" color="var(--warn)" style={{ marginLeft: 6, verticalAlign: -2 }} aria-label={t('Preferred')} />}</td>
                    <td className="num">{s.parts}</td>
                    <td className="num">{s.needs ? <span className="pill warn">{s.needs}</span> : '—'}</td>
                    <td className="num">{s.lead != null ? `${s.lead.toFixed(s.lead % 1 ? 1 : 0)} d` : '—'}</td>
                    <td className="num">{money(s.value, 0)}</td>
                    <td className="num">{money(s.spend, 0)}</td>
                    <td className="num">{money(s.usedCost, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {data.byUser.length > 0 && <div className="card"><div className="card-head"><h3>{t("Who's logging stock")}</h3></div><div className="card-body">
          <HBarList rows={data.byUser.map((u) => ({ key: u.userName, label: u.userName, value: u.times }))} format={(n) => t('{n} entries', { n })} />
        </div></div>}
      </>}
    </div>
  );
}
