import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Star, ExternalLink, Phone, Mail, Save } from 'lucide-react';
import { buildOrderUrl, type Machine, type Manufacturer, type Vendor } from '../../../shared/types';
import { deleteDoc, newId, saveDoc, toast, toastError, useCanEdit, useIsAdmin, useStore } from '../lib/store';
import { matches, navigate, uniqueSorted } from '../lib/util';
import { Empty, Field, Modal, NumberInput, SearchInput, Tabs, TagInput, confirmDialog } from '../components/ui';

type Tab = 'suppliers' | 'manufacturers' | 'machines' | 'lists';

export function SuppliersPage({ tab: t }: { tab?: string }) {
  const tab = (['suppliers', 'manufacturers', 'machines', 'lists'].includes(t || '') ? t : 'suppliers') as Tab;
  return (
    <div>
      <div className="page-head"><div><h1>Suppliers & Lists</h1><div className="sub">Suppliers, manufacturers (with automatic order links), machines and dropdown lists.</div></div></div>
      <Tabs value={tab} onChange={(v) => navigate(`/suppliers/${v}`, true)} tabs={[
        { id: 'suppliers', label: 'Suppliers / vendors' }, { id: 'manufacturers', label: 'Manufacturers' }, { id: 'machines', label: 'Machines' }, { id: 'lists', label: 'Dropdown lists' },
      ]} />
      {tab === 'suppliers' && <VendorsTab />}
      {tab === 'manufacturers' && <ManufacturersTab />}
      {tab === 'machines' && <MachinesTab />}
      {tab === 'lists' && <ListsTab />}
    </div>
  );
}

function usePartCounts(field: 'vendor' | 'manufacturer') {
  const parts = useStore((s) => s.docs.parts);
  return useMemo(() => {
    const m = new Map<string, number>();
    for (const p of Object.values(parts)) if (p[field]) m.set(p[field]!, (m.get(p[field]!) || 0) + 1);
    return m;
  }, [parts, field]);
}

async function removeNamed(kind: 'vendors' | 'manufacturers' | 'machines', id: string, name: string, used: number) {
  if (!(await confirmDialog({ title: `Delete “${name}”?`, body: used ? `${used} part${used > 1 ? 's' : ''} still reference it. They keep the name as text.` : 'This cannot be undone.', confirm: 'Delete', danger: true }))) return;
  try { await deleteDoc(kind, id); toast('Deleted'); } catch (e) { toastError(e); }
}

function VendorsTab() {
  const vendors = useStore((s) => s.docs.vendors);
  const canEdit = useCanEdit();
  const counts = usePartCounts('vendor');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Partial<Vendor> | null>(null);
  const list = useMemo(() => Object.values(vendors).filter((v) => matches(q, v.name, v.contactName, v.phone, v.email, v.notes))
    .sort((a, b) => Number(!!b.preferred) - Number(!!a.preferred) || a.name.localeCompare(b.name)), [vendors, q]);
  return (
    <div>
      <div className="row" style={{ marginBottom: '1rem' }}>
        <SearchInput value={q} onChange={setQ} placeholder="Search suppliers…" />
        {canEdit && <button className="btn primary lg" onClick={() => setEdit({})}><Plus />Add supplier</button>}
      </div>
      {list.length === 0 ? <div className="card"><Empty title="No suppliers yet">Suppliers are also added automatically when you type a new one on a part.</Empty></div> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Supplier</th><th>Contact</th><th className="num">Lead time</th><th>Account #</th><th className="num">Parts</th><th /></tr></thead>
            <tbody>
              {list.map((v) => (
                <tr key={v.id}>
                  <td>
                    <b>{v.name}</b>{v.preferred && <span className="pill ok" style={{ marginLeft: 8 }}><Star size={13} />Preferred</span>}
                    {v.website && <div className="small"><a href={v.website} target="_blank" rel="noreferrer">{v.website.replace(/^https?:\/\//, '')} <ExternalLink size={12} /></a></div>}
                    {v.urlTemplate && <div className="small muted">Auto order links ✓</div>}
                  </td>
                  <td className="small">
                    {v.contactName && <div>{v.contactName}</div>}
                    {v.phone && <div><a href={`tel:${v.phone}`}><Phone size={13} /> {v.phone}</a></div>}
                    {v.email && <div><a href={`mailto:${v.email}`}><Mail size={13} /> {v.email}</a></div>}
                    {!v.contactName && !v.phone && !v.email && '—'}
                  </td>
                  <td className="num">{v.leadTimeDays != null ? `${v.leadTimeDays} d` : '—'}</td>
                  <td className="mono">{v.accountNumber || '—'}</td>
                  <td className="num"><a href={`#/parts?vendor=${encodeURIComponent(v.name)}`}>{counts.get(v.name) || 0}</a></td>
                  <td>{canEdit && <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn sm" onClick={() => setEdit(v)}><Pencil size={16} />Edit</button>
                    <button className="btn sm icon ghost" onClick={() => removeNamed('vendors', v.id, v.name, counts.get(v.name) || 0)} aria-label="Delete"><Trash2 size={17} /></button>
                  </div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <NamedForm kind="vendors" item={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ManufacturersTab() {
  const mfrs = useStore((s) => s.docs.manufacturers);
  const canEdit = useCanEdit();
  const counts = usePartCounts('manufacturer');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Partial<Manufacturer> | null>(null);
  const list = useMemo(() => Object.values(mfrs).filter((v) => matches(q, v.name, v.website)).sort((a, b) => (counts.get(b.name) || 0) - (counts.get(a.name) || 0) || a.name.localeCompare(b.name)), [mfrs, q, counts]);
  return (
    <div>
      <div className="row" style={{ marginBottom: '1rem' }}>
        <SearchInput value={q} onChange={setQ} placeholder="Search manufacturers…" />
        {canEdit && <button className="btn primary lg" onClick={() => setEdit({})}><Plus />Add manufacturer</button>}
      </div>
      <p className="muted">These fill the manufacturer dropdown. A <b>link pattern</b> like <span className="mono">https://www.mcmaster.com/{'{pn}'}</span> builds the order link automatically from the part number.</p>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Manufacturer</th><th>Order link pattern</th><th className="num">Parts</th><th /></tr></thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.id}>
                <td><b>{m.name}</b>{m.website && <div className="small"><a href={m.website} target="_blank" rel="noreferrer">{m.website.replace(/^https?:\/\//, '')}</a></div>}</td>
                <td className="mono small" style={{ wordBreak: 'break-all' }}>{m.urlTemplate || <span className="muted">—</span>}</td>
                <td className="num"><a href={`#/parts?mfr=${encodeURIComponent(m.name)}`}>{counts.get(m.name) || 0}</a></td>
                <td>{canEdit && <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn sm" onClick={() => setEdit(m)}><Pencil size={16} />Edit</button>
                  <button className="btn sm icon ghost" onClick={() => removeNamed('manufacturers', m.id, m.name, counts.get(m.name) || 0)} aria-label="Delete"><Trash2 size={17} /></button>
                </div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && <NamedForm kind="manufacturers" item={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function MachinesTab() {
  const machines = useStore((s) => s.docs.machines);
  const parts = useStore((s) => s.docs.parts);
  const equipment = useStore((s) => s.docs.equipment);
  const canEdit = useCanEdit();
  const [edit, setEdit] = useState<Partial<Machine> | null>(null);
  const list = useMemo(() => Object.values(machines).sort((a, b) => (a.area || '').localeCompare(b.area || '') || a.name.localeCompare(b.name, undefined, { numeric: true })), [machines]);
  const partCount = (n: string) => Object.values(parts).filter((p) => p.machines?.includes(n)).length;
  const eqCount = (n: string) => Object.values(equipment).filter((e) => e.machine === n && e.status === 'installed').length;
  return (
    <div>
      <div className="row" style={{ marginBottom: '1rem', justifyContent: 'space-between' }}>
        <p className="muted" style={{ margin: 0 }}>Machines appear in the “used on” and hot knife / roller dropdowns. Renaming a machine updates every part and knife/roller.</p>
        {canEdit && <button className="btn primary lg" onClick={() => setEdit({})}><Plus />Add machine</button>}
      </div>
      {list.length === 0 ? <div className="card"><Empty title="No machines yet" /></div> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Machine</th><th>Area / line</th><th className="num">Parts</th><th className="num">Knives & rollers on it</th><th /></tr></thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id}>
                  <td><b>{m.name}</b>{m.notes && <div className="small muted">{m.notes}</div>}</td>
                  <td>{m.area || '—'}</td>
                  <td className="num"><a href={`#/parts?machine=${encodeURIComponent(m.name)}`}>{partCount(m.name)}</a></td>
                  <td className="num">{eqCount(m.name)}</td>
                  <td>{canEdit && <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn sm" onClick={() => setEdit(m)}><Pencil size={16} />Edit</button>
                    <button className="btn sm icon ghost" onClick={() => removeNamed('machines', m.id, m.name, partCount(m.name))} aria-label="Delete"><Trash2 size={17} /></button>
                  </div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <NamedForm kind="machines" item={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function NamedForm({ kind, item, onClose }: { kind: 'vendors' | 'manufacturers' | 'machines'; item: Partial<Vendor & Manufacturer & Machine>; onClose: () => void }) {
  const [d, setD] = useState({ ...item });
  const [busy, setBusy] = useState(false);
  const all = useStore((s) => s.docs[kind]);
  const set = (k: string, v: unknown) => setD((x) => ({ ...x, [k]: v }));
  const label = kind === 'vendors' ? 'supplier' : kind === 'manufacturers' ? 'manufacturer' : 'machine';
  const dup = d.name && Object.values(all).some((x) => x.id !== d.id && x.name.toLowerCase() === d.name!.trim().toLowerCase());
  const save = async () => {
    if (!d.name?.trim()) { toast('Enter a name', 'danger'); return; }
    if (d.urlTemplate && !d.urlTemplate.includes('{pn}')) { toast('The link pattern must include {pn}', 'danger', 'That is where the part number goes.'); return; }
    setBusy(true);
    try { await saveDoc(kind, d.id || newId(), d); toast('Saved'); onClose(); } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  return (
    <Modal title={d.id ? `Edit ${label}` : `Add ${label}`} onClose={onClose} footer={<><button className="btn lg" onClick={onClose}>Cancel</button><button className="btn primary lg" onClick={save} disabled={busy}><Save />Save</button></>}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Name" required><input className="input" value={d.name || ''} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
        {dup && <div className="banner warn">A {label} with this name already exists.</div>}
        {kind === 'machines' ? <>
          <Field label="Area / line"><input className="input" value={d.area || ''} onChange={(e) => set('area', e.target.value)} placeholder="e.g. Converting" /></Field>
        </> : <>
          <Field label="Website"><input className="input" value={d.website || ''} onChange={(e) => set('website', e.target.value)} placeholder="https://…" /></Field>
          <Field label="Order link pattern (optional)" hint={<>Search or product page address with <b className="mono">{'{pn}'}</b> where the part number goes. Example: <span className="mono">https://www.grainger.com/search?searchQuery={'{pn}'}</span>{d.urlTemplate?.includes('{pn}') && <><br />Test: <a href={buildOrderUrl(d.urlTemplate, '6204-2RS')} target="_blank" rel="noreferrer">{buildOrderUrl(d.urlTemplate, '6204-2RS')}</a></>}</>}>
            <input className="input mono" value={d.urlTemplate || ''} onChange={(e) => set('urlTemplate', e.target.value)} placeholder="https://example.com/search?q={pn}" />
          </Field>
        </>}
        {kind === 'vendors' && <>
          <div className="grid-2">
            <Field label="Contact name"><input className="input" value={d.contactName || ''} onChange={(e) => set('contactName', e.target.value)} /></Field>
            <Field label="Phone"><input className="input" value={d.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="Email"><input className="input" type="email" value={d.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Our account #"><input className="input mono" value={d.accountNumber || ''} onChange={(e) => set('accountNumber', e.target.value)} /></Field>
            <Field label="Typical lead time (days)"><NumberInput value={d.leadTimeDays} onChange={(v) => set('leadTimeDays', v)} min={0} /></Field>
          </div>
          <label className="check"><input type="checkbox" checked={!!d.preferred} onChange={(e) => set('preferred', e.target.checked)} />Preferred supplier</label>
        </>}
        <Field label="Notes"><textarea className="input" value={d.notes || ''} onChange={(e) => set('notes', e.target.value)} /></Field>
      </form>
    </Modal>
  );
}

function ListsTab() {
  const settings = useStore((s) => s.settings);
  const parts = useStore((s) => s.docs.parts);
  const isAdmin = useIsAdmin();
  const [d, setD] = useState({ categories: settings.categories || [], locations: settings.locations || [], units: settings.units || [] });
  const [busy, setBusy] = useState(false);
  const used = useMemo(() => ({
    categories: uniqueSorted(Object.values(parts).map((p) => p.category)), locations: uniqueSorted(Object.values(parts).map((p) => p.location)), units: uniqueSorted(Object.values(parts).map((p) => p.unit)),
  }), [parts]);
  const save = async () => { setBusy(true); try { await saveDoc('settings', 'app', d); toast('Lists saved'); } catch (e) { toastError(e); } finally { setBusy(false); } };
  if (!isAdmin) return <div className="banner info">Only admins can change the dropdown lists. You can still type any new value when editing a part.</div>;
  return (
    <div className="stack">
      <p className="muted">These are suggestions in the dropdowns. People can still type something new on a part.</p>
      {(['categories', 'locations', 'units'] as const).map((k) => (
        <div key={k} className="card card-pad">
          <h3 style={{ marginBottom: '0.7rem', textTransform: 'capitalize' }}>{k === 'locations' ? 'Storage locations' : k}</h3>
          <TagInput values={d[k]} onChange={(v) => setD({ ...d, [k]: v })} options={used[k].filter((x) => !d[k].includes(x))} placeholder={`Add ${k.slice(0, -1)} and press Enter`} />
        </div>
      ))}
      <div><button className="btn primary lg" onClick={save} disabled={busy}><Save />Save lists</button></div>
    </div>
  );
}
