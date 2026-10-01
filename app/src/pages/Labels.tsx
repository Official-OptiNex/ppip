import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, CheckSquare, Square, Info } from 'lucide-react';
import type { Part } from '../../../shared/types';
import { publicSiteUrl, safeGet, safeSet } from '../lib/api';
import { useStore } from '../lib/store';
import { matches, stockStatus } from '../lib/util';
import { SearchInput, Empty, Seg, Field, NumberInput } from '../components/ui';

/**
 * Printable part labels with a QR code that opens the part on any phone.
 * Formats:
 *  - 4×6 portrait  — one label per part on a 4" thermal printer (e.g. Zebra GK420d, 4"×6" stock)
 *  - 6×4 landscape — same 4×6 stock, printed sideways (rotated so the printer doesn't need changing)
 *  - Letter sheet  — 3 across on plain / label paper for a normal printer
 */
type Format = 'z-portrait' | 'z-landscape' | 'sheet';
const FMT_KEY = 'ppip.labels.format';

export function LabelsPage({ query }: { query: URLSearchParams }) {
  const parts = useStore((s) => s.docs.parts);
  const settings = useStore((s) => s.settings);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(() => new Set((query.get('ids') || '').split(',').filter(Boolean)));
  const [qr, setQr] = useState<Record<string, string>>({});
  const [format, setFormat] = useState<Format>(() => (safeGet(FMT_KEY) as Format) || 'z-portrait');
  const [copies, setCopies] = useState<number | null>(1);
  useEffect(() => safeSet(FMT_KEY, format), [format]);

  const list = useMemo(() => Object.values(parts).filter((p) => stockStatus(p) !== 'retired' && matches(q, p.name, p.partNumber, p.location, p.manufacturer, p.category))
    .sort((a, b) => (a.location || '').localeCompare(b.location || '') || a.name.localeCompare(b.name)), [parts, q]);
  const chosen = useMemo(() => Object.values(parts).filter((p) => sel.has(p.id)).sort((a, b) => (a.location || '').localeCompare(b.location || '') || a.name.localeCompare(b.name)), [parts, sel]);
  const n = Math.max(1, Math.min(20, copies || 1));
  const printList = useMemo(() => chosen.flatMap((p) => Array.from({ length: n }, () => p)), [chosen, n]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, string> = {};
      for (const p of chosen) out[p.id] = qr[p.id] || await QRCode.toDataURL(`${publicSiteUrl(settings.publicUrl)}#/parts/${p.id}`, { margin: 0, width: 600, errorCorrectionLevel: 'M' });
      if (alive) setQr(out);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, settings.publicUrl]);

  // page size for the browser's print dialog
  useEffect(() => {
    const el = document.createElement('style');
    el.textContent = format === 'sheet' ? '@page { size: letter; margin: 0.4in; }' : '@page { size: 4in 6in; margin: 0; }';
    document.head.appendChild(el);
    return () => el.remove();
  }, [format]);

  const toggle = (id: string) => { const s = new Set(sel); if (s.has(id)) s.delete(id); else s.add(id); setSel(s); };
  const zebra = format !== 'sheet';
  return (
    <div>
      <div className="page-head no-print">
        <div><h1>Print labels</h1><div className="sub">Stick these on bins and shelves. Scan the QR code with any phone camera to open the part.</div></div>
        <button className="btn primary lg" onClick={() => window.print()} disabled={!chosen.length}><Printer />Print {printList.length || ''} label{printList.length === 1 ? '' : 's'}</button>
      </div>

      <div className="card card-pad no-print row wrap" style={{ marginBottom: '1rem', alignItems: 'flex-end', gap: '1.2rem' }}>
        <Field label="Label size">
          <Seg value={format} onChange={setFormat} options={[
            { id: 'z-portrait', label: '4×6 tall (Zebra)' }, { id: 'z-landscape', label: '6×4 wide (Zebra)' }, { id: 'sheet', label: 'Letter sheet (30/page)' },
          ]} />
        </Field>
        <Field label="Copies of each"><div style={{ width: 110 }}><NumberInput value={copies} onChange={setCopies} min={1} step={1} /></div></Field>
        {zebra && (
          <div className="banner info grow" style={{ fontWeight: 500, minWidth: 280 }}>
            <Info style={{ flex: 'none' }} />
            <span>In the print window: pick the <b>Zebra</b> printer, paper size <b>4 × 6 in</b>, margins <b>None</b>, scale <b>100%</b> (turn off “Headers and footers”). Each label prints on its own 4×6.</span>
          </div>
        )}
      </div>

      <div className="grid-2 no-print" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-head"><SearchInput value={q} onChange={setQ} placeholder="Find parts…" /></div>
          <div className="row" style={{ padding: '0.6rem 1.2rem', gap: 8 }}>
            <button className="btn sm" onClick={() => setSel(new Set([...sel, ...list.map((p) => p.id)]))}>Select all shown ({list.length})</button>
            <button className="btn sm" onClick={() => setSel(new Set())}>Clear</button>
          </div>
          <div className="list" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {list.slice(0, 400).map((p) => (
              <button key={p.id} className="list-item" onClick={() => toggle(p.id)}>
                {sel.has(p.id) ? <CheckSquare color="var(--primary)" /> : <Square color="var(--muted)" />}
                <div className="grow"><b>{p.name}</b><div className="small muted">{[p.partNumber, p.location].filter(Boolean).join(' · ')}</div></div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <h3 style={{ marginBottom: 8 }}>Preview {chosen.length > 0 && <span className="muted small">({printList.length} label{printList.length === 1 ? '' : 's'})</span>}</h3>
          {!chosen.length ? <div className="card"><Empty title="Pick parts on the left" /></div> : zebra ? (
            <div className="zpreview">
              {chosen.slice(0, 6).map((p) => <ZebraLabel key={p.id} p={p} qr={qr[p.id]} landscape={format === 'z-landscape'} company={settings.companyName} />)}
              {chosen.length > 6 && <div className="muted">…and {chosen.length - 6} more</div>}
            </div>
          ) : <LabelSheet parts={chosen} qr={qr} />}
        </div>
      </div>

      <div className="print-only">
        {zebra
          ? printList.map((p, i) => <ZebraLabel key={i} p={p} qr={qr[p.id]} landscape={format === 'z-landscape'} company={settings.companyName} />)
          : <LabelSheet parts={printList} qr={qr} />}
      </div>
    </div>
  );
}

/** One 4"×6" thermal label. Pure black, big bold text — thermal printers have no gray. */
function ZebraLabel({ p, qr, landscape, company }: { p: Part; qr?: string; landscape: boolean; company?: string }) {
  const nameSize = p.name.length > 60 ? 20 : p.name.length > 35 ? 24 : 30;
  const body = landscape ? (
    <div className="zl-inner land">
      <div className="zl-qr">{qr && <img src={qr} alt="" />}<div className="zl-scan">SCAN FOR DETAILS</div></div>
      <div className="zl-text">
        <div className="zl-top">{[company, p.category].filter(Boolean).join(' · ')}</div>
        <div className="zl-name" style={{ fontSize: `${nameSize - 4}pt` }}>{p.name}</div>
        {p.partNumber && <div className="zl-pn">#{p.partNumber}</div>}
        {p.manufacturer && <div className="zl-mfr">{p.manufacturer}</div>}
        <div className="zl-grow" />
        <div className="zl-row">
          {p.location && <div className="zl-box"><span>LOCATION</span><b>{p.location}</b></div>}
          {p.minQty != null && <div className="zl-box"><span>REORDER AT</span><b>{p.minQty} {p.unit || 'ea'}</b></div>}
        </div>
      </div>
    </div>
  ) : (
    <div className="zl-inner">
      <div className="zl-top">{[company, p.category].filter(Boolean).join(' · ')}</div>
      <div className="zl-name" style={{ fontSize: `${nameSize}pt` }}>{p.name}</div>
      {p.partNumber && <div className="zl-pn">#{p.partNumber}</div>}
      {p.manufacturer && <div className="zl-mfr">{p.manufacturer}</div>}
      <div className="zl-qr">{qr && <img src={qr} alt="" />}<div className="zl-scan">SCAN FOR DETAILS / STOCK</div></div>
      <div className="zl-row">
        {p.location && <div className="zl-box"><span>LOCATION</span><b>{p.location}</b></div>}
        {p.minQty != null && <div className="zl-box"><span>REORDER AT</span><b>{p.minQty} {p.unit || 'ea'}</b></div>}
      </div>
    </div>
  );
  return <div className={`zlabel ${landscape ? 'is-land' : ''}`}>{body}</div>;
}

function LabelSheet({ parts, qr }: { parts: Part[]; qr: Record<string, string> }) {
  return (
    <div className="label-sheet">
      {parts.map((p, i) => (
        <div key={i} className="label">
          {qr[p.id] ? <img src={qr[p.id]} alt="" /> : <div style={{ width: '0.95in' }} />}
          <div style={{ minWidth: 0 }}>
            <div className="l-name">{p.name}</div>
            {p.partNumber && <div className="l-pn">#{p.partNumber}</div>}
            <div className="l-loc">{[p.location, p.manufacturer].filter(Boolean).join(' · ')}</div>
            {p.minQty != null && <div className="l-loc">Reorder at {p.minQty}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
