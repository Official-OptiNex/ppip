// Lightweight SVG charts (no chart library → fast load). Hover shows exact values.
import { useRef, useState, type ReactNode } from 'react';
import { t } from '../lib/i18n';

export interface Series { key: string; label: string; color: string }

/** Vertical bar chart, one or more series grouped per category. */
export function BarChart({ data, series, height = 260, format = (n: number) => n.toLocaleString(), labelFor }: {
  data: Record<string, number | string>[]; series: Series[]; height?: number; format?: (n: number) => string; labelFor: (row: Record<string, number | string>) => string;
}) {
  const [tip, setTip] = useState<{ x: number; y: number; row: Record<string, number | string> } | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const W = 800, H = height, padL = 52, padR = 12, padT = 12, padB = 34;
  const max = Math.max(1, ...data.flatMap((r) => series.map((s) => Number(r[s.key]) || 0)));
  const nice = niceMax(max);
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const group = plotW / Math.max(1, data.length);
  const barGap = 2;
  const barW = Math.max(3, Math.min(34, (group * 0.72 - barGap * (series.length - 1)) / series.length));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * nice);
  const everyN = Math.ceil(data.length / 12);

  return (
    <div style={{ position: 'relative' }}>
      {series.length > 1 && <div className="legend" style={{ marginBottom: 8 }}>{series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}</div>}
      <svg ref={ref} className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Bar chart')} onMouseLeave={() => setTip(null)}>
        {ticks.map((t) => {
          const y = padT + plotH - (t / nice) * plotH;
          return <g key={t}><line className="gridline" x1={padL} x2={W - padR} y1={y} y2={y} /><text x={padL - 8} y={y + 4} textAnchor="end">{shortNum(t)}</text></g>;
        })}
        <line className="axis" x1={padL} x2={W - padR} y1={padT + plotH} y2={padT + plotH} />
        {data.map((row, i) => {
          const gx = padL + i * group + (group - (barW * series.length + barGap * (series.length - 1))) / 2;
          return (
            <g key={i}>
              {series.map((s, j) => {
                const v = Number(row[s.key]) || 0;
                const h = (v / nice) * plotH;
                const x = gx + j * (barW + barGap);
                const y = padT + plotH - h;
                const r = Math.min(4, barW / 2, h);
                return <path key={s.key} d={roundedTop(x, y, barW, h, r)} style={{ fill: s.color }} />;
              })}
              {i % everyN === 0 && <text x={padL + i * group + group / 2} y={H - 12} textAnchor="middle">{labelFor(row)}</text>}
              <rect x={padL + i * group} y={padT} width={group} height={plotH} fill="transparent"
                onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, row })} onClick={(e) => setTip({ x: e.clientX, y: e.clientY, row })} />
            </g>
          );
        })}
      </svg>
      {tip && (
        <div className="chart-tip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 200), top: tip.y + 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{labelFor(tip.row)}</div>
          {series.map((s) => <div key={s.key} className="row" style={{ gap: 8, justifyContent: 'space-between' }}><span className="row" style={{ gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: 'inline-block' }} />{s.label}</span><b>{format(Number(tip.row[s.key]) || 0)}</b></div>)}
        </div>
      )}
    </div>
  );
}

/** Ranked list with inline bars — best form for "top N" questions. */
export function HBarList({ rows, format = (n: number) => n.toLocaleString(), empty = 'No data yet.' }: {
  rows: { key: string; label: ReactNode; value: number; sub?: ReactNode; href?: string }[]; format?: (n: number) => string; empty?: string;
}) {
  if (!rows.length) return <div className="empty small">{t(empty)}</div>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div>
      {rows.map((r) => {
        const body = (
          <div className="hbar" title={`${format(r.value)}`}>
            <div className="ellipsis" style={{ fontWeight: 650 }}>{r.label}{r.sub && <span className="small muted"> · {r.sub}</span>}</div>
            <b style={{ fontVariantNumeric: 'tabular-nums' }}>{format(r.value)}</b>
            <div className="track"><div style={{ width: `${(r.value / max) * 100}%` }} /></div>
          </div>
        );
        return r.href ? <a key={r.key} href={r.href} style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}>{body}</a> : <div key={r.key}>{body}</div>;
      })}
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return '';
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}
function niceMax(v: number) {
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
}
function shortNum(n: number) {
  if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}k`;
  return String(+n.toFixed(1));
}
