import { useMemo, useState } from 'react';
import { Save, Wand2, ExternalLink, AlertTriangle, Minus, Plus, PackageMinus, PackagePlus, ClipboardCheck, Info } from 'lucide-react';
import { buildOrderUrl, orderNowLevel, type Part } from '../../../shared/types';
import { adjustStock, getState, newId, saveDoc, toast, toastError, useStore } from '../lib/store';
import { stockStatus, uniqueSorted, navigate } from '../lib/util';
import { Combobox, Field, Modal, NumberInput, StatusPill, TagInput } from './ui';
import { ImagePicker } from './ImagePicker';
import { t } from '../lib/i18n';

type Draft = Partial<Part>;

export function PartForm({ part, initial, onClose, onSaved }: { part?: Part; initial?: Draft; onClose: () => void; onSaved?: (id: string) => void }) {
  const isNew = !part;
  const [d, setD] = useState<Draft>(() => part ? { ...part } : { qty: 0, unit: 'ea', machines: [], ...initial });
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);
  const parts = useStore((s) => s.docs.parts);
  const manufacturers = useStore((s) => s.docs.manufacturers);
  const vendors = useStore((s) => s.docs.vendors);
  const machines = useStore((s) => s.docs.machines);
  const settings = useStore((s) => s.settings);

  const partList = useMemo(() => Object.values(parts), [parts]);
  const opts = useMemo(() => ({
    manufacturers: uniqueSorted([...Object.values(manufacturers).map((m) => m.name), ...partList.map((p) => p.manufacturer)]),
    vendors: uniqueSorted([...Object.values(vendors).map((v) => v.name), ...partList.map((p) => p.vendor)]),
    categories: uniqueSorted([...(settings.categories || []), ...partList.map((p) => p.category)]),
    locations: uniqueSorted([...(settings.locations || []), ...partList.map((p) => p.location)]),
    units: uniqueSorted([...(settings.units || []), ...partList.map((p) => p.unit)]),
    machines: uniqueSorted([...Object.values(machines).map((m) => m.name), ...partList.flatMap((p) => p.machines || [])]),
  }), [manufacturers, vendors, machines, settings, partList]);

  const findTemplate = (vendor?: string, manufacturer?: string) => {
    const v = Object.values(vendors).find((x) => x.name.toLowerCase() === (vendor || '').toLowerCase());
    const m = Object.values(manufacturers).find((x) => x.name.toLowerCase() === (manufacturer || '').toLowerCase());
    // Order from the vendor if it has a link pattern; otherwise from the manufacturer's site.
    if (v?.urlTemplate) return { tpl: v.urlTemplate, pn: d.vendorPartNumber || d.partNumber, from: v.name };
    if (m?.urlTemplate) return { tpl: m.urlTemplate, pn: d.partNumber, from: m.name };
    return null;
  };
  const suggestedUrl = (() => { const t = findTemplate(d.vendor, d.manufacturer); return t ? buildOrderUrl(t.tpl, t.pn) : ''; })();
  const [autoUrl, setAutoUrl] = useState(() => !part?.orderUrl);

  const set = <K extends keyof Part>(k: K, v: Part[K] | null | undefined) => setD((x) => ({ ...x, [k]: v ?? undefined }));
  const effectiveUrl = autoUrl ? suggestedUrl : d.orderUrl || '';

  const dup = useMemo(() => {
    const pn = (d.partNumber || '').trim().toLowerCase();
    if (!pn) return null;
    return partList.find((p) => p.id !== part?.id && (p.partNumber || '').trim().toLowerCase() === pn && (p.manufacturer || '').toLowerCase() === (d.manufacturer || '').toLowerCase()) || null;
  }, [d.partNumber, d.manufacturer, partList, part?.id]);

  const onVendorPick = (name: string) => {
    const v = Object.values(vendors).find((x) => x.name === name);
    if (v?.leadTimeDays != null && d.leadTimeDays == null) set('leadTimeDays', v.leadTimeDays);
  };

  const save = async () => {
    setTried(true);
    if (!d.name?.trim()) { toast(t('Please enter a part name'), 'danger'); return; }
    setSaving(true);
    try {
      const id = part?.id || newId();
      const full: Draft = { ...d, orderUrl: effectiveUrl || '' };
      let patch: Draft = full;
      if (part) {
        patch = {};
        for (const k of Object.keys(full) as (keyof Part)[]) {
          if (JSON.stringify(full[k] ?? null) !== JSON.stringify(part[k] ?? null)) (patch as Record<string, unknown>)[k] = full[k] ?? null;
        }
        // stock count must go through the stock dialog on edits so it is logged; ignore stale qty
        if ('qty' in patch && getState().docs.parts[id]?.qty !== part.qty) delete patch.qty;
      }
      // remember new manufacturer / supplier names for next time
      const st = getState();
      if (d.manufacturer && !Object.values(st.docs.manufacturers).some((m) => m.name.toLowerCase() === d.manufacturer!.toLowerCase()))
        saveDoc('manufacturers', newId(), { name: d.manufacturer }).catch(() => {});
      if (d.vendor && !Object.values(st.docs.vendors).some((m) => m.name.toLowerCase() === d.vendor!.toLowerCase()))
        saveDoc('vendors', newId(), { name: d.vendor, leadTimeDays: d.leadTimeDays }).catch(() => {});
      if (Object.keys(patch).length) await saveDoc('parts', id, patch, `Save part ${d.name}`);
      toast(isNew ? t('Added “{name}”', { name: d.name }) : t('Saved “{name}”', { name: d.name }));
      onSaved?.(id);
      onClose();
    } catch (e) { toastError(e); } finally { setSaving(false); }
  };

  const st = stockStatus({ qty: d.qty ?? 0, minQty: d.minQty, orderQty: d.orderQty, decommissioned: d.decommissioned });
  return (
    <Modal title={isNew ? 'Add a part' : `Edit part`} onClose={onClose} size="wide"
      footer={<>
        <span className="left row"><StatusPill status={st} /></span>
        <button className="btn lg" onClick={onClose}>{t('Cancel')}</button>
        <button className="btn primary lg" onClick={save} disabled={saving}><Save size={20} />{saving ? t('Saving…') : isNew ? t('Add part') : t('Save changes')}</button>
      </>}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save(); }}>
        <div className="grid-form">
          <Field label="Part name" required className="span-2">
            <input className={`input ${tried && !d.name?.trim() ? 'invalid' : ''}`} value={d.name || ''} onChange={(e) => set('name', e.target.value)} autoFocus placeholder={t('e.g. Cartridge heater 1/2" x 6" 500W')} />
          </Field>
          <Field label="Part number">
            <input className="input mono" value={d.partNumber || ''} onChange={(e) => set('partNumber', e.target.value)} placeholder="e.g. 3618K451" />
          </Field>
          <Field label="Manufacturer" hint="Pick from the list or type a new one">
            <Combobox value={d.manufacturer || ''} onChange={(v) => set('manufacturer', v)} options={opts.manufacturers} placeholder="Start typing…" />
          </Field>
          <Field label="Category">
            <Combobox value={d.category || ''} onChange={(v) => set('category', v)} options={opts.categories} placeholder="e.g. Bearings" />
          </Field>
          <Field label="Storage location" hint="Crib, cabinet, shelf, bin…">
            <Combobox value={d.location || ''} onChange={(v) => set('location', v)} options={opts.locations} placeholder="e.g. Crib A · Shelf 3" />
          </Field>
          <Field label="Description" className="span-all">
            <input className="input" value={d.description || ''} onChange={(e) => set('description', e.target.value)} placeholder={t("Size, voltage, material, what it's for…")} />
          </Field>
        </div>
        {dup && (
          <div className="banner warn" style={{ marginTop: '1rem' }}>
            <AlertTriangle /> <span className="grow">{t('A part with this part number already exists:')} <b>{dup.name}</b></span>
            <button type="button" className="btn sm" onClick={() => { onClose(); navigate(`/parts/${dup.id}`); }}>{t('Open it')}</button>
          </div>
        )}

        <div className="form-section">
          <h3>{t('Stock')}</h3>
          <div className="grid-form">
            <Field label={isNew ? 'How many do we have?' : 'In stock'} hint={isNew ? undefined : 'Use Take / Receive / Count on the part page to change stock.'}>
              <NumberInput value={d.qty ?? 0} onChange={(v) => set('qty', v ?? 0)} min={0} className="mono" />
            </Field>
            <Field label="Reorder at (low)" hint="At or below this = orange">
              <NumberInput value={d.minQty} onChange={(v) => set('minQty', v)} min={0} placeholder="e.g. 2" />
            </Field>
            <Field label="Order now at (red)" hint={d.orderQty == null && orderNowLevel({ minQty: d.minQty }) != null ? t('Blank = half the reorder point ({n})', { n: orderNowLevel({ minQty: d.minQty }) }) : t('At or below this = red “Order now”')}>
              <NumberInput value={d.orderQty} onChange={(v) => set('orderQty', v)} min={0} placeholder={orderNowLevel({ minQty: d.minQty }) != null ? t('auto: {n}', { n: orderNowLevel({ minQty: d.minQty }) }) : t('e.g. 1')} />
            </Field>
            <Field label="Stock up to (target)" hint="Used to suggest order qty">
              <NumberInput value={d.maxQty} onChange={(v) => set('maxQty', v)} min={0} placeholder="e.g. 6" />
            </Field>
            <Field label="Unit">
              <Combobox value={d.unit || ''} onChange={(v) => set('unit', v)} options={opts.units} placeholder="ea" />
            </Field>
          </div>
          {isNew && d.qty != null && d.qty > 0 && <div className="small muted" style={{ marginTop: 6 }}><Info size={14} style={{ verticalAlign: -2 }} /> {t('Stock for existing parts is changed with the Take / Receive / Count buttons so every change is logged.')}</div>}
        </div>

        <div className="form-section">
          <h3>{t('Ordering & supplier')}</h3>
          <div className="grid-form">
            <Field label="Supplier / vendor" hint="Where you buy it">
              <Combobox value={d.vendor || ''} onChange={(v) => set('vendor', v)} options={opts.vendors} onPick={onVendorPick} placeholder="e.g. McMaster-Carr" />
            </Field>
            <Field label="Supplier's part #" hint="If different from the part number">
              <input className="input mono" value={d.vendorPartNumber || ''} onChange={(e) => set('vendorPartNumber', e.target.value)} />
            </Field>
            <Field label="Unit cost">
              <NumberInput value={d.unitCost} onChange={(v) => set('unitCost', v)} min={0} placeholder="0.00" />
            </Field>
            <Field label="Lead time (days)">
              <NumberInput value={d.leadTimeDays} onChange={(v) => set('leadTimeDays', v)} min={0} placeholder="e.g. 3" />
            </Field>
            <Field label="Order page link" className="span-all"
              hint={autoUrl ? (suggestedUrl ? t('Built automatically from the {from} link pattern.', { from: findTemplate(d.vendor, d.manufacturer)?.from }) : t('Pick a supplier/manufacturer with a link pattern (Suppliers page) to build this automatically, or paste a link.')) : t('Custom link.')}>
              <div className="row">
                <input className="input grow" value={effectiveUrl} placeholder="https://…" onChange={(e) => { setAutoUrl(false); set('orderUrl', e.target.value); }} />
                {!autoUrl && suggestedUrl && <button type="button" className="btn" onClick={() => { setAutoUrl(true); set('orderUrl', ''); }} title={t('Use automatic link')}><Wand2 size={18} />{t('Auto')}</button>}
                {effectiveUrl && <a className="btn" href={effectiveUrl} target="_blank" rel="noreferrer" title={t('Test link')}><ExternalLink size={18} /></a>}
              </div>
            </Field>
          </div>
        </div>

        <div className="form-section">
          <h3>{t("Where it's used")}</h3>
          <TagInput values={d.machines || []} onChange={(v) => set('machines', v)} options={opts.machines} placeholder="Add a machine (type and press Enter)" />
        </div>

        <div className="form-section">
          <h3>{t('Photo')}</h3>
          <ImagePicker value={d.imageId} onChange={(id) => set('imageId', id ?? '')} label={d.name} />
        </div>

        <div className="form-section">
          <h3>{t('Notes & flags')}</h3>
          <Field label="Notes">
            <textarea className="input" value={d.notes || ''} onChange={(e) => set('notes', e.target.value)} placeholder={t('Anything useful: alternates, install tips, who to call…')} />
          </Field>
          <div className="row wrap" style={{ marginTop: '0.6rem', gap: '1.5rem' }}>
            <label className="check"><input type="checkbox" checked={!!d.critical} onChange={(e) => set('critical', e.target.checked)} />{t('Critical spare (machine goes down without it)')}</label>
            <label className="check"><input type="checkbox" checked={!!d.decommissioned} onChange={(e) => set('decommissioned', e.target.checked)} />{t("Decommissioned — we don't use this anymore")}</label>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------ Take / Receive / Count
export type StockMode = 'use' | 'receive' | 'set';
export function StockDialog({ part, mode: initialMode, onClose }: { part: Part; mode: StockMode; onClose: () => void }) {
  const live = useStore((s) => s.docs.parts[part.id]) || part;
  const machines = useStore((s) => s.docs.machines);
  const [mode, setMode] = useState<StockMode>(initialMode);
  const [qty, setQty] = useState<number | null>(initialMode === 'set' ? live.qty : 1);
  const [machine, setMachine] = useState(live.machines?.length === 1 ? live.machines[0] : '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const machineOptions = useMemo(() => uniqueSorted([...(live.machines || []), ...Object.values(machines).map((m) => m.name)]), [live.machines, machines]);
  const n = qty ?? 0;
  const after = mode === 'use' ? live.qty - n : mode === 'receive' ? live.qty + n : n;
  const invalid = qty == null || n < 0 || (mode !== 'set' && n <= 0) || after < 0;
  const afterStatus = stockStatus({ qty: after, minQty: live.minQty, orderQty: live.orderQty, decommissioned: live.decommissioned });
  const unit = live.unit || 'ea';

  const submit = async () => {
    if (invalid) return;
    setBusy(true);
    try {
      await adjustStock(live, mode, n, mode === 'use' ? machine : undefined, note);
      toast(mode === 'use' ? t('Took {n} {unit} — {after} left', { n, unit, after }) : mode === 'receive' ? t('Received {n} {unit} — now {after}', { n, unit, after }) : t('Count saved — {after} {unit}', { after, unit }), afterStatus === 'out' || afterStatus === 'order' ? 'danger' : afterStatus === 'low' ? 'warn' : 'success', live.name);
      onClose();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  const titles = { use: 'Take / use parts', receive: 'Receive / restock', set: 'Count — set exact amount' };
  return (
    <Modal title={t(titles[mode])} onClose={onClose}
      footer={<>
        <button className="btn lg" onClick={onClose}>{t('Cancel')}</button>
        <button className={`btn lg ${mode === 'use' ? 'primary' : mode === 'receive' ? 'ok' : 'primary'}`} onClick={submit} disabled={busy || invalid}>
          {mode === 'use' ? <PackageMinus /> : mode === 'receive' ? <PackagePlus /> : <ClipboardCheck />}
          {mode === 'use' ? t('Take {n}', { n }) : mode === 'receive' ? t('Add {n}', { n }) : t('Set to {n}', { n })}
        </button>
      </>}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="seg" style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {(['use', 'receive', 'set'] as StockMode[]).map((m) => (
            <button type="button" key={m} className={mode === m ? 'on' : ''} onClick={() => { setMode(m); setQty(m === 'set' ? live.qty : 1); }}>
              {m === 'use' ? t('Take') : m === 'receive' ? t('Receive') : t('Count')}
            </button>
          ))}
        </div>
        <div className="card card-pad" style={{ background: 'var(--surface-2)' }}>
          <div style={{ fontWeight: 750, fontSize: '1.1rem' }}>{live.name}</div>
          <div className="muted">{[live.partNumber, live.manufacturer, live.location].filter(Boolean).join(' · ')}</div>
        </div>
        <Field label={mode === 'set' ? t('How many are on the shelf right now? ({unit})', { unit }) : t('How many? ({unit})', { unit })}>
          <div className="qty-stepper">
            <button type="button" className="btn" onClick={() => setQty(Math.max(0, n - 1))} aria-label={t('Less')}><Minus /></button>
            <NumberInput value={qty} onChange={setQty} min={0} className="grow" />
            <button type="button" className="btn" onClick={() => setQty(n + 1)} aria-label={t('More')}><Plus /></button>
          </div>
        </Field>
        <div className="row" style={{ justifyContent: 'center', fontSize: '1.15rem', gap: '1rem' }}>
          <span>{t('Now:')} <b>{live.qty}</b></span><span className="muted">→</span>
          <span>{t('After:')} <b className={`qty-big ${afterStatus}`} style={{ fontSize: '1.4rem' }}>{after}</b></span>
          <StatusPill status={afterStatus} />
        </div>
        {after < 0 && <div className="banner danger">{t('Only {n} {unit} in stock.', { n: live.qty, unit })}</div>}
        {mode === 'use' && (
          <Field label="Used on which machine? (optional)">
            <Combobox value={machine} onChange={setMachine} options={machineOptions} placeholder="Pick a machine" />
          </Field>
        )}
        <Field label="Note (optional)">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t(mode === 'receive' ? 'e.g. PO 12345' : mode === 'use' ? 'e.g. replaced during breakdown' : 'e.g. monthly cycle count')} />
        </Field>
      </form>
    </Modal>
  );
}
