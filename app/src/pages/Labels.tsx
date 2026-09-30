import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, CheckSquare, Square } from 'lucide-react';
import { publicSiteUrl } from '../lib/api';
import { useStore } from '../lib/store';
import { matches, stockStatus } from '../lib/util';
import { SearchInput, Empty } from '../components/ui';

/** Printable bin / shelf labels with a QR code that opens the part on any phone. */
export function LabelsPage({ query }: { query: URLSearchParams }) {
  const parts = useStore((s) => s.docs.parts);
  const settingsUrl = useStore((s) => s.settings.publicUrl);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(() => new Set((query.get('ids') || '').split(',').filter(Boolean)));
  const [qr, setQr] = useState<Record<string, string>>({});
  const list = useMemo(() => Object.values(parts).filter((p) => stockStatus(p) !== 'retired' && matches(q, p.name, p.partNumber, p.location, p.manufacturer, p.category))
    .sort((a, b) => (a.location || '').localeCompare(b.location || '') || a.name.localeCompare(b.name)), [parts, q]);
  const chosen = useMemo(() => Object.values(parts).filter((p) => sel.has(p.id)).sort((a, b) => (a.location || '').localeCompare(b.location || '') || a.name.localeCompare(b.name)), [parts, sel]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, string> = {};
      for (const p of chosen) out[p.id] = qr[p.id] || await QRCode.toDataURL(`${publicSiteUrl(settingsUrl)}#/parts/${p.id}`, { margin: 0, width: 220, errorCorrectionLevel: 'M' });
      if (alive) setQr(out);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, settingsUrl]);

  const toggle = (id: string) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setSel(n); };
  return (
    <div>
      <div className="page-head no-print">
        <div><h1>Print labels</h1><div className="sub">Stick these on bins and shelves. Scan the QR code with any phone camera to open the part.</div></div>
        <button className="btn primary lg" onClick={() => window.print()} disabled={!chosen.length}><Printer />Print {chosen.length || ''} label{chosen.length === 1 ? '' : 's'}</button>
      </div>
      <div className="grid-2 no-print" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-head">
            <SearchInput value={q} onChange={setQ} placeholder="Find parts…" />
          </div>
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
          <h3 style={{ marginBottom: 8 }}>Preview</h3>
          {!chosen.length ? <div className="card"><Empty title="Pick parts on the left" /></div> : <LabelSheet parts={chosen} qr={qr} />}
        </div>
      </div>
      <div className="print-only"><LabelSheet parts={chosen} qr={qr} /></div>
    </div>
  );
}

function LabelSheet({ parts, qr }: { parts: ReturnType<typeof Object.values<import('../../../shared/types').Part>>; qr: Record<string, string> }) {
  return (
    <div className="label-sheet">
      {parts.map((p) => (
        <div key={p.id} className="label">
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
