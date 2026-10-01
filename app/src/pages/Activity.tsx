import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { fmtDateTime, useDebounced } from '../lib/util';
import { SearchInput, Spinner, Empty } from '../components/ui';
import type { Activity } from '../../../shared/types';

const KINDS: [string, string][] = [['', 'Everything'], ['parts', 'Parts & stock'], ['equipment', 'Knives & rollers'], ['orders', 'Order guides'], ['users', 'Accounts'], ['vendors', 'Suppliers'], ['machines', 'Machines']];

export function ActivityPage() {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [rows, setRows] = useState<Activity[] | null>(null);
  const [more, setMore] = useState(true);
  const live = useStore((s) => s.activity[0]?.id);
  const dq = useDebounced(q, 250);

  const load = async (before?: number) => {
    const params = new URLSearchParams({ limit: '100' });
    if (dq) params.set('q', dq);
    if (kind) params.set('kind', kind);
    if (before) params.set('before', String(before));
    const r = await api<Activity[]>(`/activity?${params}`);
    setMore(r.length === 100);
    setRows((cur) => (before && cur ? [...cur, ...r] : r));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load().catch(() => setRows([])); }, [dq, kind, live]);

  return (
    <div>
      <div className="page-head"><div><h1>Activity log</h1><div className="sub">Every change, who made it and when. Updates live.</div></div></div>
      <div className="row wrap" style={{ marginBottom: '1rem' }}>
        <SearchInput value={q} onChange={setQ} placeholder="Search activity (part name, person, machine…)" />
        <select className="input" style={{ width: 'auto', minHeight: '3rem' }} value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </div>
      <div className="card">
        {!rows ? <div className="card-pad center"><Spinner /></div> : rows.length === 0 ? <Empty title="No activity found" /> : (
          <div className="list">
            {rows.map((a) => {
              const link = a.kind === 'parts' && a.refId ? `#/parts/${a.refId}` : a.kind === 'orders' && a.refId ? `#/orders/${a.refId}` : undefined;
              const body = <><div className="grow"><div>{a.summary}</div><div className="small muted">{a.userName}</div></div><div className="small muted nowrap">{fmtDateTime(a.at)}</div></>;
              return link ? <a key={a.id} className="list-item" href={link}>{body}</a> : <div key={a.id} className="list-item">{body}</div>;
            })}
          </div>
        )}
      </div>
      {rows && more && <div className="center" style={{ marginTop: '1rem' }}><button className="btn" onClick={() => load(rows[rows.length - 1]?.at)}>Load older</button></div>}
    </div>
  );
}
