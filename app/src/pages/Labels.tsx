import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, CheckSquare, Square, Info, Scissors } from 'lucide-react';
import { EQUIPMENT_LABEL, type Equipment, type Part } from '../../../shared/types';
import { publicSiteUrl, safeGet, safeSet } from '../lib/api';
import { useStore } from '../lib/store';
import { matches, stockStatus } from '../lib/util';
import { plural, t } from '../lib/i18n';
import { SearchInput, Empty, Seg, Field, NumberInput, rich } from '../components/ui';
import { describe } from './Equipment';

/**
 * Printable labels for a 4"×6" thermal printer (e.g. Zebra GK420d) — or a letter sheet.
 *  - One big label per 4×6 (tall or wide), or
 *  - 2 / 4 / 6 / 8 / 12 small labels on one 4×6, with dashed cut lines, to cut out for bins, boxes and tools.
 * Contents: parts (QR opens the part), knives / rollers / horns / anvils (QR opens it), or any typed text.
 */
type Format = 'z1' | 'z1w' | 'z2' | 'z4' | 'z6' | 'z8' | 'z12' | 'sheet';
type Source = 'parts' | 'equipment' | 'text';
const FMT_KEY = 'ppip.labels.format2';
const SRC_KEY = 'ppip.labels.source';

/** Cut layouts: how many per 4×6 label, grid columns × rows, and the size of one piece. */
const CUT: Record<Exclude<Format, 'z1' | 'z1w' | 'sheet'>, { n: number; cols: number; rows: number; size: string }> = {
  z2: { n: 2, cols: 1, rows: 2, size: '4 × 3 in' },
  z4: { n: 4, cols: 2, rows: 2, size: '2 × 3 in' },
  z6: { n: 6, cols: 2, rows: 3, size: '2 × 2 in' },
  z8: { n: 8, cols: 2, rows: 4, size: '2 × 1.5 in' },
  z12: { n: 12, cols: 2, rows: 6, size: '2 × 1 in' },
};
const FORMATS: { id: Format; label: string; sub: string }[] = [
  { id: 'z1', label: 'Full label', sub: '4 × 6 in, tall' },
  { id: 'z1w', label: 'Full label, wide', sub: '6 × 4 in' },
  { id: 'z2', label: '2 per label', sub: '4 × 3 in each' },
  { id: 'z4', label: '4 per label', sub: '2 × 3 in each' },
  { id: 'z6', label: '6 per label', sub: '2 × 2 in each' },
  { id: 'z8', label: '8 per label', sub: '2 × 1.5 in each' },
  { id: 'z12', label: '12 per label', sub: '2 × 1 in each' },
  { id: 'sheet', label: 'Letter sheet', sub: 'normal printer, 30 per page' },
];

/** What goes on one label, whatever it came from. */
interface Item { key: string; title: string; code?: string; lines: string[]; qr?: string; part?: Part }

export function LabelsPage({ query }: { query: URLSearchParams }) {
  const parts = useStore((s) => s.docs.parts);
  const equipment = useStore((s) => s.docs.equipment);
  const settings = useStore((s) => s.settings);
  const [q, setQ] = useState('');
  const [source, setSource] = useState<Source>(() => (query.get('ids') ? 'parts' : (safeGet(SRC_KEY) as Source) || 'parts'));
  const [sel, setSel] = useState<Set<string>>(() => new Set((query.get('ids') || '').split(',').filter(Boolean)));
  const [selEq, setSelEq] = useState<Set<string>>(() => new Set((query.get('eq') || '').split(',').filter(Boolean)));
  const [text, setText] = useState(() => safeGet('ppip.labels.text') || '');
  const [qrImg, setQrImg] = useState<Record<string, string>>({});
  const [format, setFormat] = useState<Format>(() => (safeGet(FMT_KEY) as Format) || 'z1');
  const [copies, setCopies] = useState<number | null>(1);
  const [showQr, setShowQr] = useState(() => safeGet('ppip.labels.qr') !== '0');
  useEffect(() => safeSet(FMT_KEY, format), [format]);
  useEffect(() => safeSet(SRC_KEY, source), [source]);
  useEffect(() => safeSet('ppip.labels.text', text), [text]);
  useEffect(() => safeSet('ppip.labels.qr', showQr ? '1' : '0'), [showQr]);
  useEffect(() => { if (query.get('eq')) setSource('equipment'); }, [query]);

  const site = publicSiteUrl(settings.publicUrl);
  const partList = useMemo(() => Object.values(parts).filter((p) => stockStatus(p) !== 'retired' && matches(q, p.name, p.partNumber, p.location, p.manufacturer, p.category))
    .sort((a, b) => (a.location || '').localeCompare(b.location || '') || a.name.localeCompare(b.name)), [parts, q]);
  const eqList = useMemo(() => Object.values(equipment).filter((e) => e.status !== 'retired' && matches(q, e.tag, e.machine, t(EQUIPMENT_LABEL[e.type].one), e.partNumber))
    .sort((a, b) => a.type.localeCompare(b.type) || a.tag.localeCompare(b.tag, undefined, { numeric: true })), [equipment, q]);

  const chosen: Item[] = useMemo(() => {
    if (source === 'parts') {
      return Object.values(parts).filter((p) => sel.has(p.id)).sort((a, b) => (a.location || '').localeCompare(b.location || '') || a.name.localeCompare(b.name))
        .map((p) => ({ key: p.id, title: p.name, code: p.partNumber ? `#${p.partNumber}` : '', lines: [p.location || '', p.minQty != null ? `REORDER AT ${p.minQty}` : ''].filter(Boolean), qr: `${site}#/parts/${p.id}`, part: p }));
    }
    if (source === 'equipment') {
      return Object.values(equipment).filter((e) => selEq.has(e.id)).sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }))
        .map((e: Equipment) => ({ key: e.id, title: e.tag, code: EQUIPMENT_LABEL[e.type].one.toUpperCase(), lines: [describe(e)].filter(Boolean), qr: `${site}#/${EQUIPMENT_LABEL[e.type].route}?open=${e.id}` }));
    }
    // one label per line; "Big text | small text" puts the part after | on a second line
    return text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 200).map((l, i) => {
      const [title, ...rest] = l.split('|').map((x) => x.trim());
      return { key: `t${i}`, title, lines: rest.filter(Boolean) };
    });
  }, [source, parts, sel, equipment, selEq, text, site]);

  const n = Math.max(1, Math.min(50, copies || 1));
  const printList = useMemo(() => chosen.flatMap((it) => Array.from({ length: n }, () => it)), [chosen, n]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, string> = {};
      for (const it of chosen) if (it.qr) out[it.qr] = qrImg[it.qr] || await QRCode.toDataURL(it.qr, { margin: 0, width: 600, errorCorrectionLevel: 'M' });
      if (alive) setQrImg(out);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen]);

  // page size for the browser's print dialog
  useEffect(() => {
    const el = document.createElement('style');
    el.textContent = format === 'sheet' ? '@page { size: letter; margin: 0.4in; }' : '@page { size: 4in 6in; margin: 0; }';
    document.head.appendChild(el);
    return () => el.remove();
  }, [format]);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => { const s = new Set(set); if (s.has(id)) s.delete(id); else s.add(id); setter(s); };
  const cut = format in CUT ? CUT[format as keyof typeof CUT] : null;
  const sheetsNeeded = format === 'sheet' ? Math.ceil(printList.length / 30) : cut ? Math.ceil(printList.length / cut.n) : printList.length;
  const qrFor = (it: Item) => (showQr && it.qr ? qrImg[it.qr] : undefined);

  const render = (list: Item[], preview: boolean) => {
    if (format === 'sheet') return <LabelSheet items={list} qrFor={qrFor} />;
    if (format === 'z1' || format === 'z1w') {
      return list.map((it, i) => it.part
        ? <ZebraLabel key={i} p={it.part} qr={qrFor(it)} landscape={format === 'z1w'} company={settings.companyName} />
        : <div key={i} className={`zlabel ${format === 'z1w' ? 'is-land' : ''}`}><div className={`zrot ${format === 'z1w' ? 'land' : ''}`}><CutCell it={it} qr={qrFor(it)} size={format === 'z1w' ? 'z1w' : 'z1'} /></div></div>);
    }
    const pages: Item[][] = [];
    for (let i = 0; i < list.length; i += cut!.n) pages.push(list.slice(i, i + cut!.n));
    return pages.slice(0, preview ? 2 : undefined).map((pg, pi) => (
      <div key={pi} className="zlabel zsheet" style={{ gridTemplateColumns: `repeat(${cut!.cols}, 1fr)`, gridTemplateRows: `repeat(${cut!.rows}, 1fr)` }}>
        {Array.from({ length: cut!.n }, (_, k) => pg[k] ? <CutCell key={k} it={pg[k]} qr={qrFor(pg[k])} size={format} /> : <div key={k} className="cut-cell empty" />)}
      </div>
    ));
  };

  return (
    <div>
      <div className="page-head no-print">
        <div><h1>{t('Print labels')}</h1><div className="sub">{t('Stick these on bins, shelves, boxes and tools. Scan the QR code with any phone camera to open it.')}</div></div>
        <button className="btn primary lg" onClick={() => window.print()} disabled={!chosen.length}><Printer />{printList.length ? plural(printList.length, 'Print {n} label', 'Print {n} labels') : t('Print labels')}</button>
      </div>

      <div className="card card-pad no-print stack" style={{ marginBottom: '1rem' }}>
        <Field label="What goes on the labels?">
          <Seg value={source} onChange={setSource} options={[{ id: 'parts', label: 'Parts' }, { id: 'equipment', label: 'Knives, rollers, horns, anvils' }, { id: 'text', label: 'Custom text' }]} />
        </Field>
        <div data-tour="label-size">
          <div className="fld-label">{t('Label size (Zebra 4 × 6)')}</div>
          <div className="fmt-grid" role="radiogroup" aria-label={t('Label size')}>
            {FORMATS.map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={format === f.id} className={`fmt-btn ${format === f.id ? 'on' : ''}`} onClick={() => setFormat(f.id)} data-format={f.id}>
                <FormatIcon f={f.id} />
                <span><b>{t(f.label)}</b><span className="small muted">{t(f.sub)}</span></span>
              </button>
            ))}
          </div>
        </div>
        <div className="row wrap" style={{ alignItems: 'flex-end', gap: '1.2rem' }}>
          <Field label="Copies of each"><div style={{ width: 110 }}><NumberInput value={copies} onChange={setCopies} min={1} step={1} /></div></Field>
          {source !== 'text' && <label className="check" style={{ marginBottom: 6 }}><input type="checkbox" checked={showQr} onChange={(e) => setShowQr(e.target.checked)} />{t('Show QR code')}</label>}
          {chosen.length > 0 && <div className="muted" style={{ marginBottom: 8 }}>{format === 'sheet' ? t('{n} letter pages', { n: sheetsNeeded }) : plural(sheetsNeeded, 'Uses {n} Zebra label (4×6)', 'Uses {n} Zebra labels (4×6)')}</div>}
        </div>
        {format !== 'sheet' && (
          <div className="banner info" style={{ fontWeight: 500 }}>
            <Info style={{ flex: 'none' }} />
            <span>{rich('In the print window: pick the **Zebra** printer, paper size **4 × 6 in**, margins **None**, scale **100%** (turn off “Headers and footers”).')}{cut ? <> <Scissors size={15} style={{ verticalAlign: -2 }} /> {t('Then cut along the dashed lines.')}</> : null}</span>
          </div>
        )}
      </div>

      <div className="grid-2 no-print" style={{ alignItems: 'start' }}>
        <div className="card">
          {source === 'text' ? (
            <div className="card-pad stack">
              <Field label="One label per line" hint="Tip: “Big text | small text” puts the part after | on a second, smaller line.">
                <textarea className="input mono" rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder={'BOX 1 | Spare belts\nBOX 2 | Bearings 6205\nCRIB A · SHELF 3\nDO NOT USE'} aria-label={t('One label per line')} />
              </Field>
            </div>
          ) : <>
            <div className="card-head"><SearchInput value={q} onChange={setQ} placeholder={source === 'parts' ? 'Find parts…' : 'Find by tag or machine…'} /></div>
            <div className="row" style={{ padding: '0.6rem 1.2rem', gap: 8 }}>
              {source === 'parts'
                ? <button className="btn sm" onClick={() => setSel(new Set([...sel, ...partList.map((p) => p.id)]))}>{t('Select all shown ({n})', { n: partList.length })}</button>
                : <button className="btn sm" onClick={() => setSelEq(new Set([...selEq, ...eqList.map((e) => e.id)]))}>{t('Select all shown ({n})', { n: eqList.length })}</button>}
              <button className="btn sm" onClick={() => (source === 'parts' ? setSel(new Set()) : setSelEq(new Set()))}>{t('Clear')}</button>
            </div>
            <div className="list" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {source === 'parts' ? partList.slice(0, 400).map((p) => (
                <button key={p.id} className="list-item" onClick={() => toggle(sel, setSel, p.id)}>
                  {sel.has(p.id) ? <CheckSquare color="var(--primary)" /> : <Square color="var(--muted)" />}
                  <div className="grow"><b>{p.name}</b><div className="small muted">{[p.partNumber, p.location].filter(Boolean).join(' · ')}</div></div>
                </button>
              )) : eqList.slice(0, 400).map((e) => (
                <button key={e.id} className="list-item" onClick={() => toggle(selEq, setSelEq, e.id)}>
                  {selEq.has(e.id) ? <CheckSquare color="var(--primary)" /> : <Square color="var(--muted)" />}
                  <div className="grow"><b className="mono">{e.tag}</b> <span className="muted">· {t(EQUIPMENT_LABEL[e.type].one)}</span><div className="small muted">{[describe(e), e.machine].filter(Boolean).join(' · ')}</div></div>
                </button>
              ))}
            </div>
          </>}
        </div>
        <div>
          <h3 style={{ marginBottom: 8 }}>{t('Preview')} {chosen.length > 0 && <span className="muted small">({plural(printList.length, '{n} label', '{n} labels')})</span>}</h3>
          {!chosen.length ? <div className="card"><Empty title={source === 'text' ? 'Type some text on the left' : 'Pick items on the left'} /></div> : format === 'sheet'
            ? render(chosen.slice(0, 30), true)
            : <div className="zpreview" data-testid="label-preview">{render(format === 'z1' || format === 'z1w' ? chosen.slice(0, 6) : printList, true)}{(format === 'z1' || format === 'z1w') && chosen.length > 6 && <div className="muted">{t('…and {n} more', { n: chosen.length - 6 })}</div>}</div>}
        </div>
      </div>

      <div className="print-only">{render(printList, false)}</div>
    </div>
  );
}

/** Tiny drawing of how the 4×6 is split up. */
function FormatIcon({ f }: { f: Format }) {
  if (f === 'sheet') return <svg width="30" height="38" viewBox="0 0 30 38" aria-hidden><rect x="1" y="1" width="28" height="36" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />{[0, 1, 2, 3, 4].map((r) => <line key={r} x1="5" x2="25" y1={8 + r * 6} y2={8 + r * 6} stroke="currentColor" strokeWidth="2" />)}</svg>;
  if (f === 'z1w') return <svg width="38" height="28" viewBox="0 0 38 28" aria-hidden><rect x="1" y="1" width="36" height="26" rx="2" fill="none" stroke="currentColor" strokeWidth="2" /></svg>;
  const c = f === 'z1' ? { cols: 1, rows: 1 } : CUT[f as keyof typeof CUT];
  const w = 26, h = 38;
  return (
    <svg width={w + 2} height={h + 2} viewBox={`0 0 ${w + 2} ${h + 2}`} aria-hidden>
      <rect x="1" y="1" width={w} height={h} rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      {Array.from({ length: c.cols - 1 }, (_, i) => <line key={`c${i}`} x1={1 + (w / c.cols) * (i + 1)} x2={1 + (w / c.cols) * (i + 1)} y1="1" y2={h + 1} stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />)}
      {Array.from({ length: c.rows - 1 }, (_, i) => <line key={`r${i}`} y1={1 + (h / c.rows) * (i + 1)} y2={1 + (h / c.rows) * (i + 1)} x1="1" x2={w + 1} stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />)}
    </svg>
  );
}

/** One small label (a piece of the 4×6, or a full one for non-part items). Pure black for thermal printers. */
function CutCell({ it, qr, size }: { it: Item; qr?: string; size: Format }) {
  const len = it.title.length;
  // shrink long names so they fit
  const fit = len > 60 ? 'xs' : len > 36 ? 'sm' : len > 18 ? 'md' : len > 10 ? 'lg' : 'xl';
  return (
    <div className={`cut-cell ${size} fit-${fit} ${qr ? 'has-qr' : 'no-qr'}`}>
      {qr && <img className="cc-qr" src={qr} alt="" />}
      <div className="cc-text">
        {it.code && <div className="cc-code">{it.code}</div>}
        <div className="cc-title">{it.title}</div>
        {it.lines.map((l, i) => <div key={i} className="cc-line">{l}</div>)}
      </div>
    </div>
  );
}

/** One 4"×6" thermal part label. Pure black, big bold text — thermal printers have no gray. */
function ZebraLabel({ p, qr, landscape, company }: { p: Part; qr?: string; landscape: boolean; company?: string }) {
  const nameSize = p.name.length > 60 ? 20 : p.name.length > 35 ? 24 : 30;
  const body = landscape ? (
    <div className="zl-inner land">
      {qr && <div className="zl-qr"><img src={qr} alt="" /><div className="zl-scan">SCAN FOR DETAILS</div></div>}
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
      {qr ? <div className="zl-qr"><img src={qr} alt="" /><div className="zl-scan">SCAN FOR DETAILS / STOCK</div></div> : <div className="zl-grow" />}
      <div className="zl-row">
        {p.location && <div className="zl-box"><span>LOCATION</span><b>{p.location}</b></div>}
        {p.minQty != null && <div className="zl-box"><span>REORDER AT</span><b>{p.minQty} {p.unit || 'ea'}</b></div>}
      </div>
    </div>
  );
  return <div className={`zlabel ${landscape ? 'is-land' : ''}`}>{body}</div>;
}

function LabelSheet({ items, qrFor }: { items: Item[]; qrFor: (it: Item) => string | undefined }) {
  return (
    <div className="label-sheet">
      {items.map((it, i) => (
        <div key={i} className="label">
          {qrFor(it) ? <img src={qrFor(it)} alt="" /> : null}
          <div style={{ minWidth: 0 }}>
            {it.code && <div className="l-pn">{it.code}</div>}
            <div className="l-name">{it.title}</div>
            {it.lines.map((l, k) => <div key={k} className="l-loc">{l}</div>)}
          </div>
        </div>
      ))}
    </div>
  );
}
