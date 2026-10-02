import { useMemo, useState } from 'react';
import { Upload, Download, FileSpreadsheet, FileJson, ArrowRight, CheckCircle2, FileDown } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { loadBootstrap, toast, toastError, useCanEdit, useStore } from '../lib/store';
import { download, exportExcel, readSpreadsheet, stockStatus, STATUS_LABEL, toCSV, fmtDate, todayISO } from '../lib/util';
import { Field, Modal, Seg, Spinner, rich } from '../components/ui';
import { t } from '../lib/i18n';
import type { Movement } from '../../../shared/types';

// Columns we understand, plus common header spellings people use in spreadsheets.
const PART_FIELDS: { key: string; label: string; aliases: string[]; type?: 'num' | 'bool' | 'list' }[] = [
  { key: 'name', label: 'Part name *', aliases: ['name', 'part name', 'description', 'item', 'part', 'item name', 'part description'] },
  { key: 'partNumber', label: 'Part number', aliases: ['part number', 'part #', 'part no', 'pn', 'p/n', 'mfr part', 'mfg part', 'model', 'part num', 'number'] },
  { key: 'manufacturer', label: 'Manufacturer', aliases: ['manufacturer', 'mfr', 'mfg', 'brand', 'make'] },
  { key: 'category', label: 'Category', aliases: ['category', 'type', 'group', 'class'] },
  { key: 'location', label: 'Location', aliases: ['location', 'bin', 'shelf', 'crib', 'storage', 'loc'] },
  { key: 'description', label: 'Details', aliases: ['details', 'notes/description', 'spec', 'specs', 'size'] },
  { key: 'qty', label: 'Qty in stock', aliases: ['qty', 'quantity', 'on hand', 'stock', 'count', 'in stock', 'qty on hand', 'amount'], type: 'num' },
  { key: 'minQty', label: 'Reorder at (min)', aliases: ['min', 'min qty', 'minimum', 'reorder point', 'reorder at', 'reorder', 'low'], type: 'num' },
  { key: 'orderQty', label: 'Order now at (red)', aliases: ['order now', 'order now at', 'order at', 'critical level', 'critical qty'], type: 'num' },
  { key: 'maxQty', label: 'Stock up to (max)', aliases: ['max', 'max qty', 'maximum', 'target', 'par'], type: 'num' },
  { key: 'unit', label: 'Unit', aliases: ['unit', 'uom', 'units'] },
  { key: 'unitCost', label: 'Unit cost', aliases: ['cost', 'unit cost', 'price', 'unit price', 'each'], type: 'num' },
  { key: 'vendor', label: 'Supplier', aliases: ['vendor', 'supplier', 'distributor', 'source'] },
  { key: 'vendorPartNumber', label: 'Supplier part #', aliases: ['vendor part', 'supplier part', 'vendor part number', 'vendor #', 'supplier #'] },
  { key: 'leadTimeDays', label: 'Lead time (days)', aliases: ['lead time', 'lead', 'lead days'], type: 'num' },
  { key: 'orderUrl', label: 'Order link', aliases: ['url', 'link', 'order link', 'website', 'order url'] },
  { key: 'machines', label: 'Machines (used on)', aliases: ['machine', 'machines', 'used on', 'equipment', 'where used'], type: 'list' },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'comments', 'remarks'] },
  { key: 'critical', label: 'Critical (yes/no)', aliases: ['critical'], type: 'bool' },
  { key: 'decommissioned', label: 'Decommissioned (yes/no)', aliases: ['decommissioned', 'obsolete', 'inactive', 'retired'], type: 'bool' },
];
const normH = (s: string) => s.toLowerCase().replace(/[^a-z0-9#/ ]/g, ' ').replace(/\s+/g, ' ').trim();

export function DataPage() {
  const parts = useStore((s) => s.docs.parts);
  const equipment = useStore((s) => s.docs.equipment);
  const downtime = useStore((s) => s.docs.downtime);
  const cores = useStore((s) => s.docs.cores);
  const canEdit = useCanEdit();
  const [importing, setImporting] = useState<{ headers: string[]; rows: string[][]; file: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const partRows = () => Object.values(parts).sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({
    ...p, machines: (p.machines || []).join('; '), status: STATUS_LABEL[stockStatus(p)], critical: p.critical ? 'yes' : '', decommissioned: p.decommissioned ? 'yes' : '',
  }));
  const cols = ['name', 'partNumber', 'manufacturer', 'category', 'location', 'description', 'qty', 'minQty', 'orderQty', 'maxQty', 'unit', 'status', 'unitCost', 'vendor', 'vendorPartNumber', 'leadTimeDays', 'orderUrl', 'machines', 'critical', 'decommissioned', 'notes', 'id'];
  const excelCols = cols.map((k) => ({ key: k, label: PART_FIELDS.find((f) => f.key === k)?.label.replace(' *', '') || (k === 'status' ? 'Status' : k === 'id' ? 'ID (keep for re-import)' : k), width: k === 'name' ? 40 : k === 'orderUrl' ? 50 : 16 }));

  const exportParts = async (fmt: 'csv' | 'xlsx') => {
    const rows = partRows();
    if (fmt === 'csv') download(`parts-${todayISO()}.csv`, '﻿' + toCSV(rows, cols), 'text/csv');
    else { setBusy(true); try { await exportExcel(`parts-${todayISO()}.xlsx`, rows, excelCols); } catch (e) { toastError(e); } finally { setBusy(false); } }
  };
  const exportMovements = async () => {
    setBusy(true);
    try {
      const rows = await api<Movement[]>(`/movements?limit=5000`);
      download(`stock-history-${todayISO()}.csv`, '﻿' + toCSV(rows.map((m) => ({ date: new Date(m.at).toLocaleString(), part: m.partName, type: m.kind, change: m.delta, after: m.qtyAfter, machine: m.machine, by: m.userName, note: m.note, unitCost: m.unitCost }))), 'text/csv');
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  // one row per install → pull so the sheet shows which machine / welder, when, how long and why
  const exportEquipment = () => download(`knives-rollers-horns-anvils-${todayISO()}.csv`, '\ufeff' + toCSV(Object.values(equipment).sort((a, b) => a.type.localeCompare(b.type) || a.tag.localeCompare(b.tag, undefined, { numeric: true })).flatMap((e): Record<string, unknown>[] => {
    const base = { type: e.type, tag: e.tag, status: e.status, onNow: e.machine || '', partNumber: e.partNumber || '', notes: e.notes || '' };
    const h = e.history || [];
    if (!h.length) return [{ ...base, machine: '', installed: '', pulled: '', days: '', reason: '' }];
    return h.map((x) => ({ ...base, machine: x.machine, installed: fmtDate(x.installedAt), pulled: x.removedAt ? fmtDate(x.removedAt) : 'still on', days: Math.max(0, Math.round(((x.removedAt || Date.now()) - x.installedAt) / 86_400_000)), reason: x.reason || '' }));
  })), 'text/csv');
  const exportDowntime = () => download(`downtime-${todayISO()}.csv`, '\ufeff' + toCSV(Object.values(downtime).sort((a, b) => b.startedAt - a.startedAt).map((d) => ({ started: new Date(d.startedAt).toLocaleString(), machine: d.machine, welder: d.welder || '', minutes: d.minutes ?? '', category: d.category || '', whatHappened: d.problem, fix: d.fix || '', bagsPerMinute: d.bpm ?? '', reportedBy: d.reportedBy || '' }))), 'text/csv');
  const exportCores = () => download(`crushed-cores-${todayISO()}.csv`, '\ufeff' + toCSV(Object.values(cores).sort((a, b) => b.at - a.at).map((c) => ({ date: new Date(c.at).toLocaleString(), tag: c.tag, machine: c.machine || '', notes: c.notes || '', loggedBy: c.reportedBy || '' }))), 'text/csv');
  const exportAll = async () => {
    setBusy(true);
    try { const data = await api('/export'); download(`ppip-all-data-${todayISO()}.json`, JSON.stringify(data, null, 1), 'application/json'); } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  const template = () => download('parts-import-template.csv', toCSV([{ name: 'Deep groove ball bearing 6204-2RS', partNumber: '6204-2RSJEM', manufacturer: 'SKF', category: 'Bearings', location: 'Crib B', qty: 10, minQty: 4, maxQty: 12, unit: 'ea', unitCost: 11.4, vendor: 'Motion Industries', leadTimeDays: 3, machines: 'Bag Machine 1; Bag Machine 2', notes: '' }], PART_FIELDS.map((f) => f.key).filter((k) => k !== 'description' && k !== 'critical' && k !== 'decommissioned' && k !== 'vendorPartNumber' && k !== 'orderUrl')), 'text/csv');

  const onFile = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const rows = await readSpreadsheet(f);
      if (rows.length < 2) throw new Error(t('The file has no data rows.'));
      setImporting({ headers: rows[0].map((h) => String(h).trim()), rows: rows.slice(1), file: f.name });
    } catch (e) { toast(t('Could not read the file'), 'danger', t(errorMessage(e))); } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}><div><h1>{t('Import / Export')}</h1><div className="sub">{t('Bring in an existing spreadsheet, or take your data anywhere. Excel and CSV both work.')}</div></div>{busy && <Spinner />}</div>
      <div className="grid-cards">
        <div className="card">
          <div className="card-head"><h3><Upload size={19} style={{ verticalAlign: -3 }} /> {t('Import parts')}</h3></div>
          <div className="card-body stack">
            {canEdit ? <>
              <p>{rich("Upload an **Excel (.xlsx)** or **CSV** file. The first row should be column headings — we'll match them up for you and show a preview before anything is saved.")}</p>
              <label className="dropzone" style={{ display: 'block', cursor: 'pointer' }}
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}>
                <input type="file" accept=".csv,.xlsx,.txt,.tsv" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
                <FileSpreadsheet size={40} color="var(--primary)" />
                <div style={{ fontWeight: 700, marginTop: 6 }}>{t('Choose a file or drop it here')}</div>
                <div className="small muted">.xlsx, .csv</div>
              </label>
              <button className="btn" onClick={template}><FileDown size={18} />{t('Download a template')}</button>
              <p className="small muted" style={{ margin: 0 }}>{t('Parts with the same part # + manufacturer (or the same ID from an export) are updated instead of duplicated.')}</p>
            </> : <div className="banner info">{t("View-only accounts can't import.")}</div>}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3><Download size={19} style={{ verticalAlign: -3 }} /> {t('Export')}</h3></div>
          <div className="card-body col">
            <button className="btn lg" onClick={() => exportParts('xlsx')}><FileSpreadsheet />{t('All parts — Excel (.xlsx)')}</button>
            <button className="btn lg" onClick={() => exportParts('csv')}><FileSpreadsheet />{t('All parts — CSV')}</button>
            <button className="btn lg" onClick={exportMovements}><FileSpreadsheet />{t('Stock history (usage log) — CSV')}</button>
            <button className="btn lg" onClick={exportEquipment}><FileSpreadsheet />{t('Knives, rollers, horns & anvils with install history — CSV')}</button>
            <button className="btn lg" onClick={exportDowntime}><FileSpreadsheet />{t('Downtime log — CSV')}</button>
            <button className="btn lg" onClick={exportCores}><FileSpreadsheet />{t('Crushed cores — CSV')}</button>
            <button className="btn lg" onClick={exportAll}><FileJson />{t('Everything — full backup (.json)')}</button>
            <p className="small muted" style={{ margin: 0 }}>{t('Data is also backed up automatically every day (see Admin → Backups).')}</p>
          </div>
        </div>
      </div>
      {importing && <ImportWizard data={importing} onClose={() => setImporting(null)} />}
    </div>
  );
}

function ImportWizard({ data, onClose }: { data: { headers: string[]; rows: string[][]; file: string }; onClose: () => void }) {
  const [map, setMap] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    const used = new Set<number>();
    const hs = data.headers.map(normH);
    // exact export labels / keys first, then aliases
    for (const f of PART_FIELDS) {
      let idx = hs.findIndex((h, i) => !used.has(i) && (h === normH(f.key) || h === normH(f.label.replace(' *', ''))));
      if (idx < 0) idx = hs.findIndex((h, i) => !used.has(i) && f.aliases.includes(h));
      if (idx < 0) idx = hs.findIndex((h, i) => !used.has(i) && f.aliases.some((a) => a.length > 3 && h.includes(a)));
      if (idx >= 0) { m[f.key] = idx; used.add(idx); }
    }
    const idIdx = hs.findIndex((h) => h === 'id' || h.startsWith('id '));
    if (idIdx >= 0) m.id = idIdx;
    return m;
  });
  const [mode, setMode] = useState<'update' | 'skip'>('update');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number; errors: string[] } | null>(null);

  const rows = useMemo(() => data.rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const f of PART_FIELDS) {
      const i = map[f.key]; if (i == null || i < 0) continue;
      let v: unknown = (r[i] ?? '').trim();
      if (v === '') continue;
      if (f.type === 'num') { const n = Number(String(v).replace(/[$,\s]/g, '')); v = Number.isFinite(n) ? n : undefined; }
      if (f.type === 'bool') v = /^(y|yes|true|1|x)$/i.test(String(v));
      if (f.type === 'list') v = String(v).split(/[;,]/).map((s) => s.trim()).filter(Boolean);
      if (v !== undefined) o[f.key] = v;
    }
    if (map.id != null && r[map.id]) o.id = r[map.id].trim();
    return o;
  }).filter((o) => o.name), [data.rows, map]);

  const run = async () => {
    setBusy(true);
    try {
      let total = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };
      for (let i = 0; i < rows.length; i += 1000) {
        const r = await api<typeof total>('/import', { body: { kind: 'parts', rows: rows.slice(i, i + 1000), mode }, timeout: 120000 });
        total = { created: total.created + r.created, updated: total.updated + r.updated, skipped: total.skipped + r.skipped, errors: [...total.errors, ...r.errors] };
      }
      setResult(total);
      await loadBootstrap();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };

  if (result) return (
    <Modal title="Import finished" onClose={onClose} footer={<><a className="btn primary lg" href="#/parts" onClick={onClose}>{t('See parts')}</a></>}>
      <div className="center stack">
        <CheckCircle2 size={56} color="var(--ok)" />
        <div style={{ fontSize: '1.2rem' }}>{t('{a} added · {b} updated · {c} skipped', { a: result.created, b: result.updated, c: result.skipped })}</div>
        {result.errors.length > 0 && <div className="banner warn" style={{ textAlign: 'left' }}><div>{result.errors.map((e, i) => <div key={i}>{e}</div>)}</div></div>}
      </div>
    </Modal>
  );

  return (
    <Modal title={`${t('Import')} “${data.file}”`} onClose={onClose} size="xwide"
      footer={<><span className="left muted">{t('{a} of {b} rows will be imported', { a: rows.length, b: data.rows.length })}{rows.length < data.rows.length ? ` ${t('(rows without a name are skipped)')}` : ''}</span>
        <button className="btn lg" onClick={onClose}>{t('Cancel')}</button>
        <button className="btn primary lg" onClick={run} disabled={busy || !rows.length || map.name == null}>{busy ? t('Importing…') : <>{t('Import {n} parts', { n: rows.length })} <ArrowRight /></>}</button></>}>
      <div className="stack">
        <h3>{t('1. Match your columns')}</h3>
        <div className="grid-form" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {PART_FIELDS.map((f) => (
            <Field key={f.key} label={f.label}>
              <select className="input" value={map[f.key] ?? -1} onChange={(e) => setMap({ ...map, [f.key]: Number(e.target.value) })} style={map[f.key] != null && map[f.key] >= 0 ? { borderColor: 'var(--ok)' } : undefined}>
                <option value={-1}>{t('— not in file —')}</option>
                {data.headers.map((h, i) => <option key={i} value={i}>{h || `(${t('column')} ${i + 1})`}</option>)}
              </select>
            </Field>
          ))}
        </div>
        <h3>{t('2. If a part already exists')}</h3>
        <Seg value={mode} onChange={setMode} options={[{ id: 'update', label: 'Update it with the file' }, { id: 'skip', label: 'Leave it alone' }]} />
        <h3>{t('3. Preview')}</h3>
        <div className="table-wrap" style={{ maxHeight: 320 }}>
          <table className="tbl">
            <thead><tr>{['name', 'partNumber', 'manufacturer', 'location', 'qty', 'minQty', 'unitCost', 'vendor'].map((k) => <th key={k}>{t(PART_FIELDS.find((f) => f.key === k)?.label.replace(' *', '') || '')}</th>)}</tr></thead>
            <tbody>{rows.slice(0, 12).map((r, i) => <tr key={i}>{['name', 'partNumber', 'manufacturer', 'location', 'qty', 'minQty', 'unitCost', 'vendor'].map((k) => <td key={k}>{String(r[k] ?? '')}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
