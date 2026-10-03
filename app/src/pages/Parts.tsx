import { useEffect, useMemo, useState } from 'react';
import {
  Plus, PackageMinus, PackagePlus, ExternalLink, MoreVertical, Pencil, ClipboardCheck, Archive, ArchiveRestore, Trash2, Copy, Tag, History,
  SlidersHorizontal, FilterX, Package, ShoppingCart, Star, Download,
} from 'lucide-react';
import type { Movement, Part } from '../../../shared/types';
import { api } from '../lib/api';
import { deleteDoc, saveDoc, toast, toastError, useCanEdit, useStore, newId, getState } from '../lib/store';
import {
  stockStatus, matches, uniqueSorted, money, navigate, setQuery, timeAgo, fmtDateTime, partValue, reorderQty, STATUS_LABEL, download, toCSV, useDebounced,
} from '../lib/util';
import { needsReorder } from '../../../shared/types';
import { Drawer, Empty, Menu, SearchInput, StatusPill, Thumb, confirmDialog, Spinner, Person } from '../components/ui';
import { PartForm, StockDialog, type StockMode } from '../components/PartDialogs';
import { plural, t } from '../lib/i18n';
import { rich } from '../components/ui';

type SortKey = 'name' | 'partNumber' | 'manufacturer' | 'category' | 'location' | 'qty' | 'status' | 'vendor' | 'unitCost' | 'updatedAt';
const STATUS_ORDER = { out: 0, order: 1, low: 2, ok: 3, retired: 4 };

export function PartsPage({ openId, query }: { openId?: string; query: URLSearchParams }) {
  const parts = useStore((s) => s.docs.parts);
  const canEdit = useCanEdit();
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(150);
  const [stock, setStock] = useState<{ part: Part; mode: StockMode } | null>(null);
  const [editing, setEditing] = useState<Part | 'new' | null>(null);
  const [copyFrom, setCopyFrom] = useState<Partial<Part> | undefined>();

  const [qText, setQText] = useState(query.get('q') || '');
  const q = useDebounced(qText, 120);
  useEffect(() => { if ((query.get('q') || '') !== q) setQuery({ q }); /* eslint-disable-next-line */ }, [q]);
  useEffect(() => { const fromUrl = query.get('q') || ''; if (fromUrl !== q) setQText(fromUrl); /* eslint-disable-next-line */ }, [query.get('q')]);

  const status = query.get('status') || 'active';
  const f = { mfr: query.get('mfr') || '', cat: query.get('cat') || '', loc: query.get('loc') || '', vendor: query.get('vendor') || '', machine: query.get('machine') || '' };
  const sort = (query.get('sort') || 'name') as SortKey;
  const dir = query.get('dir') === 'desc' ? -1 : 1;
  const all = useMemo(() => Object.values(parts), [parts]);

  const options = useMemo(() => ({
    mfr: uniqueSorted(all.map((p) => p.manufacturer)), cat: uniqueSorted(all.map((p) => p.category)), loc: uniqueSorted(all.map((p) => p.location)),
    vendor: uniqueSorted(all.map((p) => p.vendor)), machine: uniqueSorted(all.flatMap((p) => p.machines || [])),
  }), [all]);

  const counts = useMemo(() => {
    const c = { all: 0, ok: 0, low: 0, order: 0, out: 0, retired: 0 };
    for (const p of all) { const s = stockStatus(p); c[s]++; if (s !== 'retired') c.all++; }
    return c;
  }, [all]);

  const filtered = useMemo(() => {
    const list = all.filter((p) => {
      const s = stockStatus(p);
      if (status === 'active' && s === 'retired') return false;
      if (status === 'reorder' && !needsReorder(s)) return false;
      if (['ok', 'low', 'order', 'out', 'retired'].includes(status) && s !== status) return false;
      if (f.mfr && p.manufacturer !== f.mfr) return false;
      if (f.cat && p.category !== f.cat) return false;
      if (f.loc && p.location !== f.loc) return false;
      if (f.vendor && p.vendor !== f.vendor) return false;
      if (f.machine && !p.machines?.includes(f.machine)) return false;
      return matches(q, p.name, p.partNumber, p.manufacturer, p.vendorPartNumber, p.description, p.location, p.category, p.vendor, p.notes, p.machines?.join(' '));
    });
    const val = (p: Part): string | number => {
      switch (sort) {
        case 'qty': return p.qty;
        case 'status': return STATUS_ORDER[stockStatus(p)] * 1e6 + p.qty;
        case 'unitCost': return p.unitCost ?? -1;
        case 'updatedAt': return p.updatedAt ?? 0;
        default: return String(p[sort] ?? '').toLowerCase() || '￿';
      }
    };
    return list.sort((a, b) => {
      const va = val(a), vb = val(b);
      const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true });
      return r * dir || a.name.localeCompare(b.name);
    });
  }, [all, status, q, f.mfr, f.cat, f.loc, f.vendor, f.machine, sort, dir]);
  useEffect(() => setLimit(150), [q, status, f.mfr, f.cat, f.loc, f.vendor, f.machine]);

  const activeFilters = [f.mfr, f.cat, f.loc, f.vendor, f.machine].filter(Boolean).length;
  const sortBy = (k: SortKey) => setQuery({ sort: k, dir: sort === k && dir === 1 ? 'desc' : null });
  const Th = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={`sortable ${sort === k ? 'sorted' : ''} ${className || ''}`} onClick={() => sortBy(k)} aria-sort={sort === k ? (dir === 1 ? 'ascending' : 'descending') : 'none'}>
      {children}<span className="arrow">{sort === k && dir === -1 ? '▼' : '▲'}</span>
    </th>
  );

  const openPart = openId && openId !== 'new' ? parts[openId] : undefined;
  const closeDrawer = () => navigate(`/parts${location.hash.includes('?') ? '?' + location.hash.split('?')[1] : ''}`);

  const exportView = () => download(`parts-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(filtered.map((p) => ({
    name: p.name, partNumber: p.partNumber, manufacturer: p.manufacturer, category: p.category, location: p.location, qty: p.qty, minQty: p.minQty, maxQty: p.maxQty,
    unit: p.unit, status: STATUS_LABEL[stockStatus(p)], unitCost: p.unitCost, vendor: p.vendor, leadTimeDays: p.leadTimeDays, orderUrl: p.orderUrl,
  }))), 'text/csv');

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t('Parts')}</h1>
          <div className="sub">{t('{n} active parts', { n: counts.all })} · <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{t('{n} out', { n: counts.out })}</span> · <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{t('{n} order now', { n: counts.order })}</span> · <span style={{ color: 'var(--warn)', fontWeight: 700 }}>{t('{n} low', { n: counts.low })}</span></div>
        </div>
        <div className="btn-group">
          {(counts.low + counts.order + counts.out > 0) && canEdit && <a className="btn" href="#/orders/new?from=low"><ShoppingCart size={19} />{t('Order low stock')}</a>}
          {canEdit && <button className="btn primary lg" data-tour="add-part" onClick={() => setEditing('new')}><Plus size={22} />{t('Add part')}</button>}
        </div>
      </div>

      <div className="col" style={{ gap: '0.8rem', marginBottom: '1rem' }}>
        <div className="row">
          <SearchInput value={qText} onChange={setQText} placeholder="Search by name, part #, manufacturer, location, machine…" />
          <button className={`btn ${showFilters || activeFilters ? 'primary' : ''}`} onClick={() => setShowFilters(!showFilters)} style={{ minHeight: '3rem' }}>
            <SlidersHorizontal size={19} /><span className="desktop-only">{t('Filters')}</span>{activeFilters > 0 && ` (${activeFilters})`}
          </button>
        </div>
        <div className="chips scroll" data-tour="status-chips" role="group" aria-label={t('Stock status')}>
          {([
            ['active', 'All', counts.all, ''], ['ok', 'In stock', counts.ok, 'ok'], ['low', 'Running low', counts.low, 'low'],
            ['order', 'Order now', counts.order, 'order'], ['out', 'Out of stock', counts.out, 'out'],
            // rarer views only appear as a button while selected (otherwise they live under Filters → Show)
            ...(['reorder', 'retired', 'all'].includes(status) ? [[status, status === 'reorder' ? 'Needs reorder' : status === 'retired' ? 'Decommissioned' : 'Everything', status === 'reorder' ? counts.low + counts.order + counts.out : status === 'retired' ? counts.retired : all.length, status === 'reorder' ? 'low' : ''] as const] : []),
          ] as const).map(([id, label, n, cls]) => (
            <button key={id} className={`filter-chip ${cls} ${status === id ? 'on' : ''}`} onClick={() => setQuery({ status: id === 'active' ? null : id })} aria-pressed={status === id}>
              {cls && <span className={`dot ${cls}`} />}{t(label)}<span className="n">{n}</span>
            </button>
          ))}
        </div>
        {(showFilters || activeFilters > 0) && (
          <div className="card card-pad grid-form" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
            {([['mfr', 'Manufacturer'], ['cat', 'Category'], ['loc', 'Location'], ['vendor', 'Supplier'], ['machine', 'Machine']] as const).map(([k, label]) => (
              <div className="field" key={k}>
                <label>{t(label)}</label>
                <select className="input" value={f[k]} onChange={(e) => setQuery({ [k]: e.target.value })}>
                  <option value="">{t('Any')}</option>
                  {options[k].map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
            <div className="field">
              <label>{t('Show')}</label>
              <select className="input" value={status} onChange={(e) => setQuery({ status: e.target.value === 'active' ? null : e.target.value })}>
                <option value="active">{t('Active parts')}</option><option value="reorder">{t('Everything that needs ordering')}</option>
                <option value="retired">{t('Decommissioned only')}</option><option value="all">{t('Everything (incl. decommissioned)')}</option>
              </select>
            </div>
            <div className="field">
              <label>{t('Sort by')}</label>
              <select className="input" value={`${sort}:${dir}`} onChange={(e) => { const [k, d] = e.target.value.split(':'); setQuery({ sort: k, dir: d === '-1' ? 'desc' : null }); }}>
                <option value="name:1">{t('Name A–Z')}</option><option value="status:1">{t('Status (out first)')}</option><option value="qty:1">{t('Qty low → high')}</option>
                <option value="qty:-1">{t('Qty high → low')}</option><option value="manufacturer:1">{t('Manufacturer')}</option><option value="partNumber:1">{t('Part number')}</option>
                <option value="location:1">{t('Location')}</option><option value="category:1">{t('Category')}</option><option value="updatedAt:-1">{t('Recently changed')}</option>
              </select>
            </div>
            <div className="field" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={exportView} title={t('Download this list as CSV (opens in Excel)')}><Download size={18} />{t('Download this list')}</button></div>
            {activeFilters > 0 && <div className="field" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={() => setQuery({ mfr: null, cat: null, loc: null, vendor: null, machine: null })}><FilterX size={18} />{t('Clear filters')}</button></div>}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="card"><Empty icon={<Package size={52} />} title={all.length ? 'No parts match' : 'No parts yet'}>
          {all.length ? t('Try a different search or clear the filters.') : canEdit ? <><p>{t('Add your first part, or import a spreadsheet.')}</p><div className="btn-group" style={{ justifyContent: 'center' }}><button className="btn primary" onClick={() => setEditing('new')}><Plus />{t('Add part')}</button><a className="btn" href="#/data">{t('Import from Excel/CSV')}</a></div></> : t('Nothing here yet.')}
        </Empty></div>
      ) : (
        <>
          <div className="table-wrap desktop-only" data-tour="parts-list">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 64 }} aria-label={t('Photo')} />
                  <Th k="name">{t('Part')}</Th>
                  <Th k="partNumber">{t('Part #')}</Th>
                  <Th k="manufacturer">{t('Manufacturer')}</Th>
                  <Th k="location" className="hide-md">{t('Location')}</Th>
                  <Th k="status" className="num">{t('In stock')}</Th>
                  <th className="right">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, limit).map((p) => {
                  const st = stockStatus(p);
                  return (
                    <tr key={p.id} className={`clickable st-${st}`} onClick={() => navigate(`/parts/${p.id}`)}>
                      <td><Thumb id={p.imageId} /></td>
                      <td style={{ maxWidth: 380 }}>
                        <div className="strong" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {p.critical && <Star size={15} fill="var(--warn)" color="var(--warn)" aria-label={t('Critical spare')} />}
                          <span className="ellipsis">{p.name}</span>
                        </div>
                        <div className="small muted ellipsis">{[p.category, p.description].filter(Boolean).join(' · ') || ' '}</div>
                      </td>
                      <td className="mono">{p.partNumber || '—'}</td>
                      <td>{p.manufacturer || '—'}</td>
                      <td className="hide-md">{p.location || '—'}</td>
                      <td className="num">
                        <div className="qty-cell">
                          <span className={`qty-big ${st}`}>{p.qty}</span>
                          <span className="small muted" style={{ minWidth: '2ch', textAlign: 'left' }}>{p.unit || ''}</span>
                        </div>
                        <div style={{ marginTop: 2 }}><StatusPill status={st} /></div>
                        {p.minQty != null && st !== 'retired' && <div className="small muted">{t('reorder at {n}', { n: p.minQty })}</div>}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                          {canEdit && !p.decommissioned && <>
                            <button className="btn sm" onClick={() => setStock({ part: p, mode: 'use' })} disabled={p.qty <= 0} title={t('Take / use')}><PackageMinus size={18} /><span className="hide-md">{t('Take')}</span></button>
                            <button className="btn sm" onClick={() => setStock({ part: p, mode: 'receive' })} title={t('Receive / restock')}><PackagePlus size={18} /><span className="hide-md">{t('Add')}</span></button>
                          </>}
                          {p.orderUrl && <a className="btn sm icon" href={p.orderUrl} target="_blank" rel="noreferrer" title={t('Open order page')}><ExternalLink size={18} /></a>}
                          <RowMenu p={p} canEdit={canEdit} onEdit={() => setEditing(p)} onStock={(mode) => setStock({ part: p, mode })} onCopy={() => { setCopyFrom(copyOf(p)); setEditing('new'); }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="part-cards mobile-only" data-tour="parts-list">
            {filtered.slice(0, limit).map((p) => {
              const st = stockStatus(p);
              return (
                <div key={p.id} className={`part-card st-${st}`} onClick={() => navigate(`/parts/${p.id}`)}>
                  <Thumb id={p.imageId} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="name">{p.name}</div>
                    <div className="small muted">{[p.partNumber, p.manufacturer].filter(Boolean).join(' · ')}</div>
                    <div className="small muted">{p.location}</div>
                  </div>
                  <div className="col" style={{ alignItems: 'flex-end', gap: 4 }}>
                    <span className={`qty-big ${st}`}>{p.qty}</span>
                    <span className={`pill ${st}`} style={{ fontSize: '0.75rem' }}>{t(st === 'ok' ? 'OK' : st === 'low' ? 'Low' : st === 'order' ? 'Order' : st === 'out' ? 'Out' : 'Retired')}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: '0.8rem' }}>
            <span className="muted">{t('Showing {a} of {b}', { a: Math.min(limit, filtered.length), b: filtered.length })}</span>
            {filtered.length > limit && <button className="btn" onClick={() => setLimit(limit + 300)}>{t('Show more')}</button>}
          </div>
        </>
      )}

      {openPart && <PartDrawer part={openPart} onClose={closeDrawer} onEdit={() => setEditing(openPart)} onStock={(mode) => setStock({ part: openPart, mode })} onCopy={() => { setCopyFrom(copyOf(openPart)); setEditing('new'); }} />}
      {openId && openId !== 'new' && !openPart && Object.keys(parts).length > 0 && <Drawer onClose={closeDrawer} head={<h2>{t('Part not found')}</h2>}><Empty title="This part no longer exists">{t('It may have been deleted.')}</Empty></Drawer>}
      {(editing === 'new' || openId === 'new') && canEdit && <PartForm initial={copyFrom} onClose={() => { setEditing(null); setCopyFrom(undefined); if (openId === 'new') navigate('/parts'); }} onSaved={(id) => setTimeout(() => navigate(`/parts/${id}`), 0)} />}
      {editing && editing !== 'new' && <PartForm part={editing} onClose={() => setEditing(null)} />}
      {stock && <StockDialog part={stock.part} mode={stock.mode} onClose={() => setStock(null)} />}
    </div>
  );
}

function copyOf(p: Part): Partial<Part> {
  const { id: _id, qty: _q, imageId: _i, createdAt: _c, updatedAt: _u, updatedBy: _b, ...rest } = p;
  return { ...rest, name: `${p.name} (${t('copy')})`, qty: 0 };
}

function RowMenu({ p, canEdit, onEdit, onStock, onCopy }: { p: Part; canEdit: boolean; onEdit: () => void; onStock: (m: StockMode) => void; onCopy: () => void }) {
  return (
    <Menu trigger={(tg) => <button className="btn sm icon" onClick={tg} aria-label={t('More actions')}><MoreVertical size={18} /></button>}>
      {(close) => <>
        {canEdit && <button onClick={() => { close(); onEdit(); }}><Pencil size={18} />{t('Edit')}</button>}
        {canEdit && <button onClick={() => { close(); onStock('set'); }}><ClipboardCheck size={18} />{t('Count (set exact qty)')}</button>}
        {canEdit && <button onClick={() => { close(); onCopy(); }}><Copy size={18} />{t('Duplicate')}</button>}
        <a href={`#/labels?ids=${p.id}`} onClick={close}><Tag size={18} />{t('Print label')}</a>
        <a href={`#/parts/${p.id}`} onClick={close}><History size={18} />{t('History')}</a>
        {canEdit && <><hr /><DecommissionButton p={p} close={close} />
          <button className="danger" onClick={() => { close(); deletePartForever(p); }}><Trash2 size={18} />{t('Delete permanently')}</button></>}
      </>}
    </Menu>
  );
}
async function deletePartForever(p: Part) {
  if (!(await confirmDialog({ title: t('Permanently delete “{name}”?', { name: p.name }), body: <>{t('The part and its photo are removed for good (only a backup can bring it back). Past usage stays in reports.')}<br /><br />{rich("If you just don't use it anymore, **Decommission** it instead.")}</>, confirm: t('Delete permanently'), danger: true }))) return false;
  try { await deleteDoc('parts', p.id); toast(t('Part deleted')); return true; } catch (e) { toastError(e); return false; }
}

function DecommissionButton({ p, close }: { p: Part; close: () => void }) {
  return (
    <button onClick={async () => {
      close();
      try { await saveDoc('parts', p.id, { decommissioned: !p.decommissioned }); toast(p.decommissioned ? t('Part is active again') : t('Marked as decommissioned'), 'success', p.name); } catch (e) { toastError(e); }
    }}>{p.decommissioned ? <><ArchiveRestore size={18} />{t('Bring back into use')}</> : <><Archive size={18} />{t('Decommission (no longer used)')}</>}</button>
  );
}

// ------------------------------------------------------------ detail drawer
function PartDrawer({ part: p, onClose, onEdit, onStock, onCopy }: { part: Part; onClose: () => void; onEdit: () => void; onStock: (m: StockMode) => void; onCopy: () => void }) {
  const canEdit = useCanEdit();
  const vendors = useStore((s) => s.docs.vendors);
  const lastMove = useStore((s) => s.lastMovementAt);
  const [history, setHistory] = useState<Movement[] | null>(null);
  const st = stockStatus(p);
  const vendor = Object.values(vendors).find((v) => v.name === p.vendor);

  useEffect(() => {
    let alive = true;
    api<Movement[]>(`/movements?partId=${encodeURIComponent(p.id)}&limit=100`).then((r) => { if (alive) setHistory(r); }).catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
  }, [p.id, lastMove, p.qty]);

  const used90 = useMemo(() => (history || []).filter((m) => m.kind === 'use' && m.at > Date.now() - 90 * 86400000).reduce((s, m) => s - m.delta, 0), [history]);

  const remove = async () => { if (await deletePartForever(p)) onClose(); };
  const addToOrder = () => {
    const s = getState();
    const draft = Object.values(s.docs.orders).find((o) => o.status === 'draft');
    const item = { partId: p.id, name: p.name, partNumber: p.vendorPartNumber || p.partNumber, manufacturer: p.manufacturer, vendor: p.vendor, qty: reorderQty(p), unit: p.unit, unitCost: p.unitCost, url: p.orderUrl, reason: st === 'out' ? t('Out of stock') : st === 'order' ? t('Order now') : st === 'low' ? t('Running low') : '' };
    if (draft) {
      saveDoc('orders', draft.id, { items: [...draft.items, item] }).then(() => toast(t('Added to {what}', { what: draft.number }), 'success', undefined, `#/orders/${draft.id}`)).catch(toastError);
    } else {
      const id = newId();
      saveDoc('orders', id, { title: t('Parts order'), status: 'draft', requestedBy: s.me?.name, items: [item] }).then(() => toast(t('Started a new order guide'), 'success', undefined, `#/orders/${id}`)).catch(toastError);
    }
  };

  return (
    <Drawer onClose={onClose} head={<div className="row"><StatusPill status={st} /><span className="muted small">{t('Updated {when}', { when: timeAgo(p.updatedAt) })}{p.updatedBy ? ` · ${p.updatedBy}` : ''}</span></div>}>
      <div className="stack">
        <div className="row top wrap" style={{ gap: '1.2rem' }}>
          <div style={{ width: 'min(220px, 100%)' }}><Thumb id={p.imageId} size="lg" alt={p.name} /></div>
          <div className="grow" style={{ minWidth: 220 }}>
            <h2 style={{ fontSize: '1.45rem' }}>{p.critical && <Star size={18} fill="var(--warn)" color="var(--warn)" style={{ verticalAlign: -1, marginRight: 6 }} />}{p.name}</h2>
            {p.description && <p className="muted" style={{ marginTop: 6 }}>{p.description}</p>}
            {p.partNumber && (
              <button className="btn sm" style={{ marginTop: 8 }} onClick={() => { navigator.clipboard?.writeText(p.partNumber!); toast(t('Part number copied')); }} title={t('Copy part number')}>
                <span className="mono">#{p.partNumber}</span><Copy size={15} />
              </button>
            )}
            <div className="row" style={{ marginTop: '1rem', alignItems: 'baseline', gap: '0.6rem' }}>
              <span className={`qty-big ${st}`} style={{ fontSize: '2.8rem' }}>{p.qty}</span>
              <span className="muted" style={{ fontSize: '1.1rem' }}>{p.unit || 'ea'} {t('in stock')}</span>
            </div>
            <div className="small muted">{p.minQty != null ? t('Reorder at {n}', { n: p.minQty }) : t('No reorder point set')}{p.maxQty ? ` · ${t('stock up to {n}', { n: p.maxQty })}` : ''}{used90 ? ` · ${t('used {n} in last 90 days', { n: used90 })}` : ''}</div>
          </div>
        </div>

        {canEdit && !p.decommissioned && (
          <div className="grid-3 keep">
            <button className="btn lg" onClick={() => onStock('use')} disabled={p.qty <= 0}><PackageMinus />{t('Take')}</button>
            <button className="btn lg" onClick={() => onStock('receive')}><PackagePlus />{t('Receive')}</button>
            <button className="btn lg" onClick={() => onStock('set')}><ClipboardCheck />{t('Count')}</button>
          </div>
        )}
        {p.decommissioned && <div className="banner info"><Archive /> {t('Decommissioned — no longer used. Hidden from the main list and alerts.')}</div>}

        <div className="btn-group">
          {p.orderUrl && <a className="btn primary" href={p.orderUrl} target="_blank" rel="noreferrer"><ExternalLink size={18} />{t('Order page')}</a>}
          {canEdit && <button className="btn" onClick={addToOrder}><ShoppingCart size={18} />{t('Add to order guide')}</button>}
          {canEdit && <button className="btn" onClick={onEdit}><Pencil size={18} />{t('Edit')}</button>}
          <a className="btn" href={`#/labels?ids=${p.id}`}><Tag size={18} />{t('Label')}</a>
          {canEdit && <Menu trigger={(tg) => <button className="btn icon" onClick={tg} aria-label={t('More')}><MoreVertical size={18} /></button>}>
            {(close) => <>
              <button onClick={() => { close(); onCopy(); }}><Copy size={18} />{t('Duplicate')}</button>
              <DecommissionButton p={p} close={close} />
              <hr />
              <button className="danger" onClick={() => { close(); remove(); }}><Trash2 size={18} />{t('Delete permanently')}</button>
            </>}
          </Menu>}
        </div>

        <div className="card card-pad">
          <dl className="kv" style={{ margin: 0 }}>
            <dt>{t('Manufacturer')}</dt><dd>{p.manufacturer || '—'}</dd>
            <dt>{t('Category')}</dt><dd>{p.category || '—'}</dd>
            <dt>{t('Location')}</dt><dd>{p.location || '—'}</dd>
            <dt>{t('Supplier')}</dt><dd>{p.vendor || '—'}{vendor?.preferred && <span className="pill ok" style={{ marginLeft: 8 }}>{t('Preferred')}</span>}{vendor?.phone && <div className="small muted">{vendor.phone}</div>}</dd>
            {p.vendorPartNumber && <><dt>{t('Supplier part #')}</dt><dd className="mono">{p.vendorPartNumber}</dd></>}
            <dt>{t('Unit cost')}</dt><dd>{money(p.unitCost)}{p.unitCost ? <span className="muted small"> · {t('on hand worth {v}', { v: money(partValue(p)) })}</span> : null}</dd>
            <dt>{t('Lead time')}</dt><dd>{p.leadTimeDays != null ? plural(p.leadTimeDays, '{n} day', '{n} days') : vendor?.leadTimeDays != null ? t('{n} days (supplier default)', { n: vendor.leadTimeDays }) : '—'}</dd>
            <dt>{t('Used on')}</dt><dd>{p.machines?.length ? <div className="chips">{p.machines.map((m) => <a key={m} className="chip" href={`#/parts?machine=${encodeURIComponent(m)}`}>{m}</a>)}</div> : '—'}</dd>
          </dl>
          {p.notes && <><hr className="divider" /><div style={{ whiteSpace: 'pre-wrap' }}>{p.notes}</div></>}
        </div>

        <div>
          <h3 style={{ marginBottom: '0.6rem' }}>{t('Stock history')}</h3>
          <div className="card">
            {!history ? <div className="card-pad center"><Spinner /></div> : history.length === 0 ? <div className="empty small">{t('No stock changes yet.')}</div> : (
              <div className="list">
                {history.slice(0, 50).map((m) => (
                  <div key={m.id} className="list-item">
                    <span className={`li-icon ${m.delta < 0 ? 'warn' : 'ok'}`}>{m.delta < 0 ? <PackageMinus size={18} /> : <PackagePlus size={18} />}</span>
                    <div className="grow">
                      <div><b>{t(m.kind === 'use' ? 'Took' : m.kind === 'receive' ? 'Received' : m.kind === 'create' ? 'Starting stock' : 'Count adjusted')}</b> {m.delta > 0 ? '+' : ''}{m.delta} → {m.qtyAfter}{m.machine && <span className="muted"> · {m.machine}</span>}</div>
                      <div className="small muted">{fmtDateTime(m.at)} · <Person name={m.userName} size={18} />{m.note ? ` · ${m.note}` : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Drawer>
  );
}
