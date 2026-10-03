import { useEffect, useMemo, useState } from 'react';
import { Plus, Printer, Save, Trash2, ClipboardList, ShoppingCart, ArrowLeft, PackageCheck, Copy, ExternalLink, FileDown, Link2 } from 'lucide-react';
import { needsReorder, DEFAULT_PRINT_TEMPLATE, type OrderGuide, type OrderItem, type OrderStatus, type PrintTemplate, type Settings, type Part } from '../../../shared/types';
import { api } from '../lib/api';
import { applyUpsert, deleteDoc, getState, newId, saveDoc, toast, toastError, useCanEdit, useStore } from '../lib/store';
import { fmtDate, money, navigate, stockStatus, todayISO, matches, reorderQty, timeAgo, setQuery } from '../lib/util';
import { Logo } from '../components/Logo';
import { getLang, plural, t } from '../lib/i18n';
import { Combobox, Empty, Field, SearchInput, confirmDialog, NumberInput, Spinner, Person } from '../components/ui';

export const ORDER_STATUS: Record<OrderStatus, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'neutral' }, submitted: { label: 'Submitted', cls: 'info' }, approved: { label: 'Approved', cls: 'info' },
  ordered: { label: 'Ordered', cls: 'warn' }, received: { label: 'Received', cls: 'ok' }, cancelled: { label: 'Cancelled', cls: 'retired' },
};
const PRIORITY: Record<string, { label: string; cls: string }> = {
  low: { label: 'Low', cls: 'neutral' }, normal: { label: 'Normal', cls: 'info' }, high: { label: 'High', cls: 'warn' }, urgent: { label: 'URGENT', cls: 'danger' },
};
export const orderTotal = (o: Pick<OrderGuide, 'items'>) => o.items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unitCost) || 0), 0);

export function OrdersPage({ id, query }: { id?: string; query: URLSearchParams }) {
  if (id) return <OrderEditor id={id} query={query} />;
  return <OrderList query={query} />;
}

function OrderList({ query }: { query: URLSearchParams }) {
  const orders = useStore((s) => s.docs.orders);
  const canEdit = useCanEdit();
  const [q, setQ] = useState('');
  const status = query.get('status') || 'open';
  const list = useMemo(() => Object.values(orders)
    .filter((o) => status === 'all' || (status === 'open' ? !['received', 'cancelled'].includes(o.status) : o.status === status))
    .filter((o) => matches(q, o.number, o.title, o.requestedBy, o.machine, o.vendor, o.items.map((i) => `${i.name} ${i.partNumber}`).join(' ')))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), [orders, status, q]);

  return (
    <div>
      <div className="page-head">
        <div><h1>{t('Order Guides')}</h1><div className="sub">{t('Type up parts requests instead of writing them by hand — then print in your standard format.')}</div></div>
        <div className="btn-group">
          <a className="btn" href="#/print/order/blank"><Printer size={19} />{t('Blank form')}</a>
          {canEdit && <a className="btn" href="#/orders/new?from=low"><ShoppingCart size={19} />{t('From low stock')}</a>}
          {canEdit && <a className="btn primary lg" data-tour="new-order" href="#/orders/new"><Plus />{t('New order guide')}</a>}
        </div>
      </div>
      <div className="row wrap" style={{ marginBottom: '1rem' }}>
        <SearchInput value={q} onChange={setQ} placeholder="Search orders, parts, people…" />
        <div className="chips">
          {['open', 'draft', 'submitted', 'ordered', 'received', 'all'].map((s) => (
            <button key={s} className={`filter-chip ${status === s ? 'on' : ''}`} onClick={() => setQuery({ status: s === 'open' ? null : s })}>{t(s === 'open' ? 'Open' : s === 'all' ? 'All' : ORDER_STATUS[s as OrderStatus].label)}</button>
          ))}
        </div>
      </div>
      {list.length === 0 ? <div className="card"><Empty icon={<ClipboardList size={48} />} title="No order guides here">{canEdit && <a className="btn primary" href="#/orders/new"><Plus />{t('Create one')}</a>}</Empty></div> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>{t('Order #')}</th><th>{t('Requested by')}</th><th>{t('Needed by')}</th><th>{t('Priority')}</th><th>{t('Status')}</th><th className="num">{t('Items')}</th><th className="num">{t('Total')}</th><th /></tr></thead>
            <tbody>
              {list.map((o) => (
                <tr key={o.id} className="clickable" onClick={() => navigate(`/orders/${o.id}`)}>
                  <td><b className="mono">{o.number}</b><div className="small muted">{o.title}{o.machine ? ` · ${o.machine}` : ''}</div></td>
                  <td>{o.requestedBy ? <Person name={o.requestedBy} /> : '—'}<div className="small muted">{timeAgo(o.createdAt)}</div></td>
                  <td>{fmtDate(o.dateNeeded)}</td>
                  <td>{o.priority && <span className={`pill ${PRIORITY[o.priority]?.cls}`}>{t(o.priority === 'low' ? 'Low priority' : PRIORITY[o.priority]?.label || '')}</span>}</td>
                  <td><span className={`pill ${ORDER_STATUS[o.status]?.cls}`}>{t(ORDER_STATUS[o.status]?.label || '')}</span></td>
                  <td className="num">{o.items.length}</td>
                  <td className="num">{orderTotal(o) ? money(orderTotal(o)) : '—'}</td>
                  <td onClick={(e) => e.stopPropagation()}><div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                    <a className="btn sm" href={`#/print/order/${o.id}`}><Printer size={16} />{t('Print')}</a>
                    {canEdit && <button className="btn sm icon ghost" aria-label="Delete order guide" title={t('Delete permanently')} onClick={async () => {
                      if (!(await confirmDialog({ title: t('Permanently delete {what}?', { what: o.number }), body: `“${o.title}” · ${plural(o.items.length, '{n} line', '{n} lines')} · ${t('It will be removed for good.')}`, confirm: t('Delete permanently'), danger: true }))) return;
                      try { await deleteDoc('orders', o.id); toast(t('Order guide deleted')); } catch (err) { toastError(err); }
                    }}><Trash2 size={17} /></button>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const blankItem = (): OrderItem => ({ name: '', qty: 1 });

function itemFromPart(p: Part): OrderItem {
  const st = stockStatus(p);
  return {
    partId: p.id, name: p.name, partNumber: p.vendorPartNumber || p.partNumber, manufacturer: p.manufacturer, vendor: p.vendor, qty: reorderQty(p),
    unit: p.unit, unitCost: p.unitCost, url: p.orderUrl, reason: st === 'out' ? t('Out of stock ({n} left)', { n: p.qty }) : st === 'order' ? t('Order now ({n} left)', { n: p.qty }) : st === 'low' ? t('Running low ({n} left)', { n: p.qty }) : '',
  };
}

function OrderEditor({ id, query }: { id: string; query: URLSearchParams }) {
  const isNew = id === 'new';
  const existing = useStore((s) => (isNew ? undefined : s.docs.orders[id]));
  const loaded = useStore((s) => s.phase === 'ready');
  const parts = useStore((s) => s.docs.parts);
  const machines = useStore((s) => s.docs.machines);
  const vendors = useStore((s) => s.docs.vendors);
  const me = useStore((s) => s.me);
  const settings = useStore((s) => s.settings);
  const canEdit = useCanEdit();
  const [newId_] = useState(() => newId());
  const [d, setD] = useState<OrderGuide | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (d && !isNew && d.id === id) return;
    if (isNew) {
      let items: OrderItem[] = [blankItem()];
      if (query.get('from') === 'low') {
        const need = Object.values(getState().docs.parts).filter((p) => needsReorder(stockStatus(p)))
          .sort((a, b) => (a.vendor || '').localeCompare(b.vendor || '') || a.name.localeCompare(b.name));
        if (need.length) items = need.map(itemFromPart);
      }
      setD({ id: newId_, title: query.get('from') === 'low' ? t('Restock low / out-of-stock parts') : t('Parts order'), status: 'draft', priority: 'normal', requestedBy: me?.name, department: settings.department, dateNeeded: todayISO(7), items });
      setDirty(query.get('from') === 'low');
    } else if (existing) {
      setD(JSON.parse(JSON.stringify(existing)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, existing?.id]);

  // live update from others while not editing
  useEffect(() => { if (existing && !dirty && d && existing.updatedAt !== d.updatedAt) setD(JSON.parse(JSON.stringify(existing))); /* eslint-disable-next-line */ }, [existing?.updatedAt]);

  const partNames = useMemo(() => Object.values(parts).filter((p) => !p.decommissioned).map((p) => p.name).sort(), [parts]);
  const byName = useMemo(() => new Map(Object.values(parts).map((p) => [p.name, p])), [parts]);

  if (!d) return loaded && !isNew && !existing ? <Empty title="Order guide not found"><a href="#/orders">{t('Back to order guides')}</a></Empty> : <Spinner />;

  const set = <K extends keyof OrderGuide>(k: K, v: OrderGuide[K]) => { setD({ ...d, [k]: v }); setDirty(true); };
  const setItem = (i: number, patch: Partial<OrderItem>) => { const items = d.items.slice(); items[i] = { ...items[i], ...patch }; set('items', items); };
  const pickPart = (i: number, name: string) => { const p = byName.get(name); if (p) setItem(i, { ...itemFromPart(p), qty: d.items[i].qty > 1 ? d.items[i].qty : reorderQty(p), reason: d.items[i].reason || itemFromPart(p).reason }); };
  const readOnly = !canEdit;

  const save = async (then?: 'print') => {
    const items = d.items.filter((i) => i.name.trim() || i.partNumber);
    setSaving(true);
    try {
      const saved = await saveDoc('orders', d.id, { ...d, items }, `Save order ${d.title}`);
      if (saved) setD(JSON.parse(JSON.stringify(saved)));
      setDirty(false);
      toast(isNew ? t('Order guide created') : t('Saved'));
      if (then === 'print') navigate(`/print/order/${d.id}`);
      else if (isNew) navigate(`/orders/${d.id}`, true);
    } catch (e) { toastError(e); } finally { setSaving(false); }
  };
  const receive = async () => {
    if (dirty) await save();
    if (!(await confirmDialog({ title: t('Receive this order into stock?'), body: t('Every line linked to an inventory part will be added to stock (quantities as listed). Free-typed lines are just marked received.'), confirm: t('Receive into stock') }))) return;
    try { const o = await api<OrderGuide>(`/orders/${d.id}/receive`, { body: {} }); applyUpsert('orders', o); setD(o); toast(t('Received into stock')); } catch (e) { toastError(e); }
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: t('Permanently delete {what}?', { what: d.number || t('this order guide') }), body: t('It will be removed for good.'), confirm: t('Delete permanently'), danger: true }))) return;
    try { if (!isNew) await deleteDoc('orders', d.id); navigate('/orders'); } catch (e) { toastError(e); }
  };
  const duplicate = () => {
    const id2 = newId();
    saveDoc('orders', id2, { ...d, id: id2, number: undefined, status: 'draft', poNumber: '', items: d.items.map((i) => ({ ...i, received: false })), requestedBy: me?.name } as Partial<OrderGuide>)
      .then(() => { toast(t('Copied to a new draft')); navigate(`/orders/${id2}`); }).catch(toastError);
  };

  const total = orderTotal(d);
  return (
    <div>
      <div className="page-head">
        <div className="row">
          <a className="btn icon ghost" href="#/orders" aria-label={t('Back')}><ArrowLeft /></a>
          <div>
            <h1>{d.number || t('New order guide')}</h1>
            <div className="sub">{dirty ? <span style={{ color: 'var(--warn)', fontWeight: 700 }}>{t('Unsaved changes')}</span> : d.updatedAt ? `${t('Saved')} · ${timeAgo(d.updatedAt)} · ${d.updatedBy}` : t('Not saved yet')}</div>
          </div>
        </div>
        <div className="btn-group">
          {!isNew && canEdit && <button className="btn" onClick={duplicate}><Copy size={18} />{t('Duplicate')}</button>}
          {!isNew && canEdit && ['ordered', 'approved', 'submitted'].includes(d.status) && <button className="btn ok" onClick={receive}><PackageCheck size={19} />{t('Receive into stock')}</button>}
          <button className="btn lg" onClick={() => (dirty && canEdit ? save('print') : navigate(`/print/order/${d.id}`))} disabled={isNew && !canEdit}><Printer />{dirty && canEdit ? t('Save & print') : t('Print')}</button>
          {canEdit && <button className="btn primary lg" onClick={() => save()} disabled={saving || (!dirty && !isNew)}><Save />{saving ? t('Saving…') : t('Save')}</button>}
        </div>
      </div>

      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="card card-pad">
          <div className="grid-form">
            <Field label="Title / what is this for" className="span-2"><input className="input" value={d.title} onChange={(e) => set('title', e.target.value)} /></Field>
            <Field label="Requested by"><input className="input" value={d.requestedBy || ''} onChange={(e) => set('requestedBy', e.target.value)} /></Field>
            <Field label="Department"><input className="input" value={d.department || ''} onChange={(e) => set('department', e.target.value)} /></Field>
            <Field label="Needed by"><input className="input" type="date" value={d.dateNeeded || ''} onChange={(e) => set('dateNeeded', e.target.value)} /></Field>
            <Field label="Machine / line"><Combobox value={d.machine || ''} onChange={(v) => set('machine', v)} options={Object.values(machines).map((m) => m.name).sort()} placeholder={t('Optional')} /></Field>
            <Field label="Priority">
              <select className="input" value={d.priority || 'normal'} onChange={(e) => set('priority', e.target.value as OrderGuide['priority'])}>
                {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{t(k === 'low' ? 'Low priority' : v.label)}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className="input" value={d.status} onChange={(e) => set('status', e.target.value as OrderStatus)}>
                {Object.entries(ORDER_STATUS).map(([k, v]) => <option key={k} value={k}>{t(v.label)}</option>)}
              </select>
            </Field>
            <Field label="Supplier (if one)"><Combobox value={d.vendor || ''} onChange={(v) => set('vendor', v)} options={Object.values(vendors).map((v) => v.name).sort()} placeholder={t('Optional')} /></Field>
            <Field label="PO number"><input className="input mono" value={d.poNumber || ''} onChange={(e) => set('poNumber', e.target.value)} placeholder={t('Optional')} /></Field>
          </div>
        </div>

        <div className="row" style={{ justifyContent: 'space-between', margin: '1.4rem 0 0.6rem' }}>
          <h2>{t('Items')} ({d.items.filter((i) => i.name).length})</h2>
          <span className="muted">{t('Tip: start typing a part name to fill in the details from inventory.')}</span>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th style={{ width: 40 }}>#</th><th style={{ minWidth: 260 }}>{t('Part / description')}</th><th style={{ minWidth: 130 }}>{t('Part #')}</th><th style={{ minWidth: 140 }}>{t('Manufacturer')}</th><th style={{ width: 110 }}>{t('Qty')}</th><th style={{ width: 90 }}>{t('Unit')}</th><th style={{ width: 120 }}>{t('Unit cost')}</th><th style={{ minWidth: 200 }}>{t('Why / reason')}</th><th /></tr></thead>
            <tbody>
              {d.items.map((it, i) => (
                <tr key={i} style={it.received ? { opacity: 0.6 } : undefined}>
                  <td className="muted">{i + 1}</td>
                  <td>
                    <Combobox value={it.name} onChange={(v) => setItem(i, { name: v, partId: byName.get(v)?.id })} onPick={(v) => pickPart(i, v)} options={partNames} placeholder="Type a part name…"
                      renderSub={(n) => { const p = byName.get(n); return p ? `${p.qty} ${t('in stock')}` : ''; }} />
                    {it.partId && <div className="small muted" style={{ marginTop: 4 }}><Link2 size={13} style={{ verticalAlign: -2 }} /> {t('Linked to inventory')}{it.received ? ` · ${t('received')}` : ''}</div>}
                  </td>
                  <td><input className="input mono" value={it.partNumber || ''} onChange={(e) => setItem(i, { partNumber: e.target.value })} /></td>
                  <td><input className="input" value={it.manufacturer || ''} onChange={(e) => setItem(i, { manufacturer: e.target.value })} /></td>
                  <td><NumberInput value={it.qty} onChange={(v) => setItem(i, { qty: v ?? 0 })} min={0} /></td>
                  <td><input className="input" value={it.unit || ''} onChange={(e) => setItem(i, { unit: e.target.value })} placeholder="ea" /></td>
                  <td><NumberInput value={it.unitCost} onChange={(v) => setItem(i, { unitCost: v ?? undefined })} min={0} placeholder="0.00" /></td>
                  <td><input className="input" value={it.reason || ''} onChange={(e) => setItem(i, { reason: e.target.value })} placeholder={t('e.g. BM2 seal bar failed')}
                    onKeyDown={(e) => { if (e.key === 'Enter' && i === d.items.length - 1) { e.preventDefault(); set('items', [...d.items, blankItem()]); } }} /></td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      {it.url && <a className="btn sm icon" href={it.url} target="_blank" rel="noreferrer" title={t('Order page')}><ExternalLink size={16} /></a>}
                      {canEdit && <button type="button" className="btn sm icon ghost" onClick={() => set('items', d.items.filter((_, j) => j !== i))} aria-label={t('Remove line')}><Trash2 size={17} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row wrap" style={{ justifyContent: 'space-between', marginTop: '0.8rem' }}>
          {canEdit ? <button type="button" className="btn" onClick={() => set('items', [...d.items, blankItem()])}><Plus size={18} />{t('Add line')}</button> : <span />}
          <div style={{ fontSize: '1.15rem' }}>{t('Estimated total:')} <b>{money(total)}</b></div>
        </div>

        <div className="card card-pad" style={{ marginTop: '1.2rem' }}>
          <Field label="Notes (printed on the form)"><textarea className="input" value={d.notes || ''} onChange={(e) => set('notes', e.target.value)} placeholder={t('Anything purchasing should know…')} /></Field>
        </div>
      </fieldset>
      {canEdit && !isNew && <div style={{ marginTop: '1.5rem' }}><button className="btn danger-ghost" onClick={remove}><Trash2 size={18} />{t('Delete order guide')}</button></div>}
    </div>
  );
}

// ------------------------------------------------------------ print
export function OrderSheet({ order, tpl, settings, blankRows = 0 }: { order: Partial<OrderGuide>; tpl: PrintTemplate; settings: Settings; blankRows?: number }) {
  const c = { ...DEFAULT_PRINT_TEMPLATE.columns, ...tpl.columns };
  const items = [...(order.items || []), ...Array.from({ length: blankRows }, () => ({ name: '', qty: 0 } as OrderItem))];
  const total = orderTotal({ items: order.items || [] });
  const accent = tpl.accent || '#1f5fbf';
  const blank = !order.id;
  const F = ({ label, value }: { label: string; value?: string }) => (
    <div><div className="pd-label">{label}</div><div className="pd-field">{value || ' '}</div></div>
  );
  return (
    <div className="print-doc" style={{ fontSize: `${(tpl.fontScale || 1) * 100}%` }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', borderBottom: `3px solid ${accent}`, paddingBottom: 10, marginBottom: 14 }}>
        {tpl.showLogo && <Logo size={58} />}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '1.6em', fontWeight: 800 }}>{tpl.title}</div>
          <div style={{ color: '#444' }}>{[settings.companyName, tpl.subtitle].filter(Boolean).join(' · ')}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="pd-label">Order #</div>
          <div style={{ fontFamily: 'monospace', fontSize: '1.3em', fontWeight: 800 }}>{order.number || '________'}</div>
          {order.priority && order.priority !== 'normal' && <div style={{ fontWeight: 800, color: order.priority === 'urgent' ? '#b42318' : '#b34700' }}>{PRIORITY[order.priority]?.label} priority</div>}
        </div>
      </div>
      {tpl.headerNote && <div style={{ marginBottom: 10, whiteSpace: 'pre-wrap' }}>{tpl.headerNote}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px 16px', marginBottom: 14 }}>
        <F label="Requested by" value={order.requestedBy} />
        <F label="Department" value={order.department} />
        <F label="Date" value={blank ? '' : fmtDate(order.createdAt || Date.now())} />
        <F label="Needed by" value={order.dateNeeded ? fmtDate(order.dateNeeded) : ''} />
        <div style={{ gridColumn: 'span 2' }}><F label="For / description" value={order.title} /></div>
        <F label="Machine / line" value={order.machine} />
        <F label="Supplier" value={order.vendor} />
        {order.poNumber && <F label="PO #" value={order.poNumber} />}
      </div>
      <table>
        <thead>
          <tr>
            <th style={{ width: 28 }}>#</th>
            <th>Part / description</th>
            {c.partNumber && <th>Part #</th>}
            {c.manufacturer && <th>Manufacturer</th>}
            {c.vendor && <th>Supplier</th>}
            <th style={{ width: 50 }}>Qty</th>
            {c.unitCost && <th style={{ width: 80 }}>Unit $</th>}
            {c.total && <th style={{ width: 85 }}>Total</th>}
            {c.reason && <th>Reason</th>}
            {c.link && <th>Link</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} style={{ height: it.name ? undefined : '2em' }}>
              <td>{i + 1}</td>
              <td><b>{it.name}</b></td>
              {c.partNumber && <td style={{ fontFamily: 'monospace' }}>{it.partNumber}</td>}
              {c.manufacturer && <td>{it.manufacturer}</td>}
              {c.vendor && <td>{it.vendor}</td>}
              <td style={{ textAlign: 'right' }}>{it.name ? `${it.qty}${it.unit && it.unit !== 'ea' ? ` ${it.unit}` : ''}` : ''}</td>
              {c.unitCost && <td style={{ textAlign: 'right' }}>{it.unitCost ? money(it.unitCost) : ''}</td>}
              {c.total && <td style={{ textAlign: 'right' }}>{it.unitCost && it.qty ? money(it.unitCost * it.qty) : ''}</td>}
              {c.reason && <td>{it.reason}</td>}
              {c.link && <td style={{ fontSize: '0.75em', wordBreak: 'break-all' }}>{it.url}</td>}
            </tr>
          ))}
        </tbody>
        {c.total && total > 0 && (
          <tfoot><tr><td colSpan={2 + (c.partNumber ? 1 : 0) + (c.manufacturer ? 1 : 0) + (c.vendor ? 1 : 0) + 1 + (c.unitCost ? 1 : 0)} style={{ textAlign: 'right', fontWeight: 800 }}>Estimated total</td><td style={{ textAlign: 'right', fontWeight: 800 }}>{money(total)}</td>{c.reason && <td />}{c.link && <td />}</tr></tfoot>
        )}
      </table>
      <div style={{ marginTop: 14 }}><div className="pd-label">Notes</div><div style={{ border: '1px solid #888', minHeight: '3.5em', padding: 6, whiteSpace: 'pre-wrap' }}>{order.notes}</div></div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, tpl.signatures.length)}, 1fr)`, gap: 24, marginTop: 34 }}>
        {tpl.signatures.map((s, i) => (
          <div key={i}><div style={{ borderBottom: '1px solid #000', height: 34 }} /><div className="pd-label" style={{ marginTop: 4 }}>{s} · Date</div></div>
        ))}
      </div>
      {tpl.footerNote && <div style={{ marginTop: 20, fontSize: '0.85em', color: '#444', textAlign: 'center' }}>{tpl.footerNote}</div>}
    </div>
  );
}

export function OrderPrintPage({ id }: { id: string }) {
  const order = useStore((s) => s.docs.orders[id]);
  const settings = useStore((s) => s.settings);
  const tpl = { ...DEFAULT_PRINT_TEMPLATE, ...(settings.printTemplate || {}) };
  const blank = id === 'blank';
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '1rem' }}>
      <div className="no-print row wrap" style={{ maxWidth: '8.5in', margin: '0 auto 1rem', justifyContent: 'space-between' }}>
        <button className="btn lg" onClick={() => (history.length > 1 ? history.back() : navigate('/orders'))}><ArrowLeft />{t('Back')}</button>
        <div className="btn-group">
          <a className="btn" href="#/admin/print" title={t('Change the printed layout')}><FileDown size={18} />{t('Edit layout')}</a>
          <button className="btn primary lg" onClick={() => window.print()}><Printer />{t('Print')}</button>
        </div>
      </div>
      {!blank && !order ? <Empty title="Order guide not found" /> : <OrderSheet order={blank ? { items: [] } : order!} tpl={tpl} settings={settings} blankRows={blank ? 14 : Math.max(0, 6 - (order?.items.length || 0))} />}
      <p className="no-print muted center small" style={{ marginTop: '1rem' }}>{t('Tip: in the print window choose “Save as PDF” to email it instead.')}{getLang() === 'es' ? ` ${t('The printed form stays in English so purchasing gets the same form every time.')}` : ''}</p>
    </div>
  );
}
