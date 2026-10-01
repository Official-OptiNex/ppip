// "Undo" bar: shows after every change for a short while. Undo puts things back exactly as they were (and can be redone).
import { useEffect, useState } from 'react';
import { Undo2, Redo2, X } from 'lucide-react';
import { api, ApiError, errorMessage } from '../lib/api';
import { setState, toast, useCanEdit, useStore } from '../lib/store';
import { confirmDialog } from './ui';

const SHOW_MS = 25_000;

/** Undo one recorded change. Asks first if someone else has changed the same things since. */
export async function runUndo(id: string, summary: string): Promise<boolean> {
  const redo = summary.startsWith('Undid:');
  try {
    await api(`/undo/${id}`, { method: 'POST', body: {} });
    toast(redo ? 'Redone' : 'Undone', 'success', redo ? summary.replace(/^Undid:\s*/, '') : summary);
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      const changed = ((e.data as { changed?: string[] })?.changed || []).slice(0, 6);
      const ok = await confirmDialog({
        title: 'Changed since — undo anyway?', danger: true, confirm: redo ? 'Redo anyway' : 'Undo anyway',
        body: <>Someone changed this after you: <b>{changed.join(', ')}</b>.<br /><br />{redo ? 'Redoing' : 'Undoing'} will put it back the way it was and replace their change.</>,
      });
      if (!ok) return false;
      try { await api(`/undo/${id}`, { method: 'POST', body: { force: true } }); toast(redo ? 'Redone' : 'Undone', 'success', summary); return true; } catch (e2) { toast(errorMessage(e2), 'danger'); return false; }
    }
    toast(errorMessage(e), 'danger');
    return false;
  }
}

export function UndoBar() {
  const bar = useStore((s) => s.undoBar);
  const canEdit = useCanEdit();
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!bar) return;
    const t = setTimeout(() => setState((s) => (s.undoBar?.id === bar.id ? { undoBar: null } : {})), SHOW_MS);
    return () => clearTimeout(t);
  }, [bar]);
  // Ctrl+Z / Cmd+Z undoes the last change (when not typing in a box)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && bar && !busy) { e.preventDefault(); go(); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(i); }, []);

  if (!bar || !canEdit) return null;
  const redo = bar.summary.startsWith('Undid:');
  const left = Math.max(0, Math.ceil((SHOW_MS - (Date.now() - bar.at)) / 1000));
  async function go() {
    if (!bar) return;
    setBusy(true);
    const ok = await runUndo(bar.id, bar.summary);
    setBusy(false);
    if (!ok) setState({ undoBar: null });
  }
  return (
    <div className="undo-bar no-print" role="status" aria-live="polite">
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="small muted" style={{ fontWeight: 700 }}>{redo ? 'Undone' : 'Saved'}</div>
        <div className="ellipsis" title={bar.summary}>{redo ? bar.summary.replace(/^Undid:\s*/, '') : bar.summary}</div>
      </div>
      <button className="btn lg undo-btn" onClick={go} disabled={busy} title={redo ? 'Redo' : 'Undo (Ctrl+Z)'}>
        {redo ? <Redo2 /> : <Undo2 />}{busy ? '…' : redo ? 'Redo' : 'Undo'}
      </button>
      <button className="btn icon ghost sm" onClick={() => setState({ undoBar: null })} aria-label={`Hide (${left}s)`} title={`Hides in ${left}s`}><X size={18} /></button>
    </div>
  );
}
