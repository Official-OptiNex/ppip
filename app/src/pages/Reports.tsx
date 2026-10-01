import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Printer, Download, PackageMinus, PackagePlus, DollarSign, XCircle, AlertTriangle, Flame } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useStore } from '../lib/store';
import { DAY, fmtDate, fmtDateTime, money, num, setQuery, stockStatus, download, toCSV, pmState, fmtDuration } from '../lib/util';
import { Spinner, Seg } from '../components/ui';

interface Row { partId: string; partName: string; qty: number; times: number; cost: number; machines?: string | null }
interface Report {
  from: number; to: number; used: Row[]; received: Row[];
  adjustments: { id: string; partName: string; delta: number; qtyAfter: number; note?: string; userName?: string; at: number }[];
  equipment: { id: string; at: number; userName: string; action: string; summary: string }[];
  orders: { id: string; at: number; userName: string; action: string; summary: string }[];
  totals: { events: number; people: number };
}

function startOfWeek(d: Date, weekStart: number) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (x.getDay() - weekStart + 7) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function ReportsPage({ query }: { query: URLSearchParams }) {
  const settings = useStore((s) => s.settings);
  const parts = useStore((s) => s.docs.parts);
  const equipment = useStore((s) => s.docs.equipment);
  const lastMove = useStore((s) => s.lastMovementAt);
  const period = (query.get('period') || 'week') as 'week' | 'month';
  const weekStartDay = settings.weeklyReportDay ?? 1;
  const anchor = query.get('start') ? new Date(query.get('start') + 'T00:00:00') : null;
  const start = period === 'week'
    ? startOfWeek(anchor || new Date(Date.now() - (query.get('start') ? 0 : 0)), weekStartDay)
    : (() => { const a = anchor || new Date(); return new Date(a.getFullYear(), a.getMonth(), 1); })();
  const end = period === 'week' ? new Date(start.getTime() + 7 * DAY) : new Date(start.getFullYear(), start.getMonth() + 1, 1);
  const [rep, setRep] = useState<Report | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setRep(null);
    api<Report>(`/report?from=${start.getTime()}&to=${end.getTime()}`).then(setRep).catch((e) => setErr(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start.getTime(), end.getTime(), lastMove]);

  const shift = (n: number) => {
    const d = period === 'week' ? new Date(start.getTime() + n * 7 * DAY + 3600000) : new Date(start.getFullYear(), start.getMonth() + n, 1);
    setQuery({ start: iso(d) });
  };
  const isCurrent = Date.now() >= start.getTime() && Date.now() < end.getTime();

  const now = useMemo(() => {
    const list = Object.values(parts);
    return {
      out: list.filter((p) => stockStatus(p) === 'out').sort((a, b) => a.name.localeCompare(b.name)),
      low: list.filter((p) => stockStatus(p) === 'low').sort((a, b) => a.name.localeCompare(b.name)),
      pm: Object.values(equipment).map((e) => ({ e, pm: pmState(e, settings) })).filter((x) => x.pm.state === 'due'),
    };
  }, [parts, equipment, settings]);

  const usedTotal = rep?.used.reduce((s, r) => s + r.cost, 0) || 0;
  const recvTotal = rep?.received.reduce((s, r) => s + r.cost, 0) || 0;
  const title = period === 'week' ? `Week of ${fmtDate(start.getTime())} – ${fmtDate(end.getTime() - DAY)}` : start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const exportCsv = () => rep && download(`usage-${iso(start)}.csv`, toCSV(rep.used.map((r) => ({
    part: r.partName, partNumber: parts[r.partId]?.partNumber || '', qtyUsed: r.qty, timesTaken: r.times, cost: r.cost.toFixed(2), machines: r.machines || '', inStockNow: parts[r.partId]?.qty ?? '',
  }))), 'text/csv');

  return (
    <div className="stack">
      <div className="page-head no-print" style={{ marginBottom: 0 }}>
        <div><h1>{period === 'week' ? 'Weekly' : 'Monthly'} usage report</h1><div className="sub">What was used, received and changed — ready to print or export.</div></div>
        <div className="btn-group">
          <Seg value={period} onChange={(v) => setQuery({ period: v === 'week' ? null : v, start: null })} options={[{ id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }]} />
          <button className="btn" onClick={exportCsv} disabled={!rep}><Download size={18} />CSV</button>
          <button className="btn primary" onClick={() => window.print()}><Printer size={18} />Print</button>
        </div>
      </div>
      <div className="row no-print" style={{ justifyContent: 'center', gap: '1rem' }}>
        <button className="btn lg icon" onClick={() => shift(-1)} aria-label="Previous"><ChevronLeft /></button>
        <div className="center"><h2>{title}</h2>{isCurrent && <div className="small muted">in progress — updates live</div>}</div>
        <button className="btn lg icon" onClick={() => shift(1)} aria-label="Next" disabled={isCurrent}><ChevronRight /></button>
        {!isCurrent && <button className="btn" onClick={() => setQuery({ start: null })}>Current</button>}
      </div>
      <div className="print-only"><h1>{settings.companyName} — {period === 'week' ? 'Weekly' : 'Monthly'} parts report</h1><div>{title} · printed {fmtDateTime(Date.now())}</div><hr /></div>

      {err && <div className="banner danger">{err}</div>}
      {!rep ? <div className="center" style={{ padding: 60 }}><Spinner /></div> : <>
        <div className="tiles">
          <div className="tile info"><span className="t-label"><PackageMinus size={18} />Parts used</span><span className="t-value">{num(rep.used.reduce((s, r) => s + r.qty, 0))}</span><span className="t-sub">{rep.used.length} different parts</span></div>
          <div className="tile"><span className="t-label"><DollarSign size={18} />Cost used</span><span className="t-value" style={{ fontSize: '1.6rem' }}>{money(usedTotal)}</span><span className="t-sub">at recorded cost</span></div>
          <div className="tile ok"><span className="t-label"><PackagePlus size={18} />Received</span><span className="t-value">{num(rep.received.reduce((s, r) => s + r.qty, 0))}</span><span className="t-sub">{money(recvTotal)} value</span></div>
          <div className={`tile ${now.out.length ? 'danger' : 'ok'}`}><span className="t-label"><XCircle size={18} />Out of stock now</span><span className="t-value">{now.out.length}</span><span className="t-sub">{now.low.length} running low</span></div>
        </div>

        <Section title="Parts used" empty="Nothing was taken in this period.">
          {rep.used.length > 0 && (
            <table className="tbl">
              <thead><tr><th>Part</th><th>Part #</th><th>Machines</th><th className="num">Qty used</th><th className="num">Times</th><th className="num">Cost</th><th className="num">In stock now</th></tr></thead>
              <tbody>
                {rep.used.map((r) => { const p = parts[r.partId]; const st = p ? stockStatus(p) : 'ok'; return (
                  <tr key={r.partId} className={`st-${st}`}><td><a href={`#/parts/${r.partId}`}><b>{p?.name || r.partName}</b></a></td><td className="mono">{p?.partNumber || '—'}</td><td className="small">{r.machines?.split(',').join(', ') || '—'}</td>
                    <td className="num"><b>{num(r.qty)}</b></td><td className="num">{r.times}</td><td className="num">{r.cost ? money(r.cost) : '—'}</td><td className="num"><span className={`qty-big ${st}`} style={{ fontSize: '1rem' }}>{p?.qty ?? '—'}</span></td></tr>
                ); })}
              </tbody>
              <tfoot><tr><td colSpan={5} className="right"><b>Total</b></td><td className="num"><b>{money(usedTotal)}</b></td><td /></tr></tfoot>
            </table>
          )}
        </Section>

        <Section title="Received / restocked" empty="Nothing was received in this period.">
          {rep.received.length > 0 && (
            <table className="tbl">
              <thead><tr><th>Part</th><th className="num">Qty received</th><th className="num">Value</th></tr></thead>
              <tbody>{rep.received.map((r) => <tr key={r.partId}><td>{parts[r.partId]?.name || r.partName}</td><td className="num">{num(r.qty)}</td><td className="num">{r.cost ? money(r.cost) : '—'}</td></tr>)}</tbody>
            </table>
          )}
        </Section>

        <div className="grid-cards">
          <Section title={<><XCircle size={18} color="var(--danger)" style={{ verticalAlign: -3 }} /> Out of stock right now</>} empty="Nothing is out of stock.">
            {now.out.length > 0 && <table className="tbl"><tbody>{now.out.map((p) => <tr key={p.id} className="st-out"><td><b>{p.name}</b><div className="small muted">{[p.partNumber, p.vendor].filter(Boolean).join(' · ')}</div></td></tr>)}</tbody></table>}
          </Section>
          <Section title={<><AlertTriangle size={18} color="var(--warn)" style={{ verticalAlign: -3 }} /> Running low right now</>} empty="Nothing is running low.">
            {now.low.length > 0 && <table className="tbl"><tbody>{now.low.map((p) => <tr key={p.id} className="st-low"><td><b>{p.name}</b><div className="small muted">{p.partNumber}</div></td><td className="num"><b>{p.qty}</b> / {p.minQty}</td></tr>)}</tbody></table>}
          </Section>
        </div>

        <Section title={<><Flame size={18} style={{ verticalAlign: -3 }} /> Hot knife & roller changes</>} empty="No knife or roller changes logged.">
          {(rep.equipment.length > 0 || now.pm.length > 0) && (
            <table className="tbl">
              <tbody>
                {now.pm.map(({ e, pm }) => <tr key={e.id} className="st-out"><td colSpan={2}><b>PM overdue:</b> {e.tag} on {e.machine} — {fmtDuration(pm.days)} (interval {pm.interval} d)</td></tr>)}
                {rep.equipment.map((a) => <tr key={a.id}><td>{a.summary}</td><td className="small muted nowrap">{fmtDateTime(a.at)} · {a.userName}</td></tr>)}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Count corrections" empty="No count corrections.">
          {rep.adjustments.length > 0 && (
            <table className="tbl">
              <thead><tr><th>Part</th><th className="num">Change</th><th className="num">Now</th><th>By</th><th>When</th><th>Note</th></tr></thead>
              <tbody>{rep.adjustments.map((a) => <tr key={a.id}><td>{a.partName}</td><td className="num">{a.delta > 0 ? '+' : ''}{a.delta}</td><td className="num">{a.qtyAfter}</td><td>{a.userName}</td><td className="small">{fmtDateTime(a.at)}</td><td className="small">{a.note}</td></tr>)}</tbody>
            </table>
          )}
        </Section>

        {rep.orders.length > 0 && <Section title="Order guide activity" empty="">
          <table className="tbl"><tbody>{rep.orders.map((a) => <tr key={a.id}><td>{a.summary}</td><td className="small muted nowrap">{fmtDateTime(a.at)} · {a.userName}</td></tr>)}</tbody></table>
        </Section>}
        <p className="small muted">{rep.totals.events} stock entries by {rep.totals.people} people in this period.</p>
      </>}
    </div>
  );
}

function Section({ title, empty, children }: { title: React.ReactNode; empty: string; children: React.ReactNode }) {
  const hasContent = Array.isArray(children) ? children.some(Boolean) : !!children;
  return (
    <div className="card" style={{ breakInside: 'avoid' }}>
      <div className="card-head"><h3>{title}</h3></div>
      {hasContent ? <div className="table-wrap" style={{ border: 0, boxShadow: 'none', borderRadius: 0 }}>{children}</div> : <div className="empty small" style={{ padding: '1.2rem' }}>{empty}</div>}
    </div>
  );
}
