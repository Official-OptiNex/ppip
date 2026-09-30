import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Upload, Smartphone, Trash2, ImagePlus, CheckCircle2, ClipboardPaste } from 'lucide-react';
import { api, errorMessage, imageUrl, publicSiteUrl } from '../lib/api';
import { prepareImage } from '../lib/util';
import { toast, useStore } from '../lib/store';
import { Modal, Spinner } from './ui';

/** Part photo: upload from this computer (click, drag & drop, paste) or send one from a phone via QR code. */
export function ImagePicker({ value, onChange, label }: { value?: string | null; onChange: (id: string | null) => void; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [phone, setPhone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: Blob) => {
    setBusy(true);
    try {
      const form = await prepareImage(file);
      const { id } = await api<{ id: string }>('/images', { form, timeout: 60000 });
      onChange(id);
    } catch (e) { toast('Photo upload failed', 'danger', errorMessage(e)); } finally { setBusy(false); }
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (phone) return;
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
      const f = item?.getAsFile();
      if (f) { e.preventDefault(); upload(f); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  return (
    <div className={`dropzone ${drag ? 'drag' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) upload(f); }}>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
      <div className="row wrap" style={{ justifyContent: 'center', gap: '1rem' }}>
        {value ? (
          <img src={imageUrl(value)} alt="Part" style={{ width: 150, height: 150, objectFit: 'cover', borderRadius: 12, border: '1px solid var(--border)' }} />
        ) : (
          <div className="thumb" style={{ width: 110, height: 110 }}>{busy ? <Spinner /> : <ImagePlus size={40} />}</div>
        )}
        <div className="col" style={{ alignItems: 'stretch', minWidth: 210 }}>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={busy}><Upload size={18} />{value ? 'Replace photo' : 'Upload from this PC'}</button>
          <button type="button" className="btn" onClick={() => setPhone(true)} disabled={busy}><Smartphone size={18} />Take photo with phone</button>
          {value && <button type="button" className="btn danger-ghost" onClick={() => onChange(null)}><Trash2 size={18} />Remove photo</button>}
          <div className="small muted"><ClipboardPaste size={13} style={{ verticalAlign: -2 }} /> You can also drag a picture here or paste one (Ctrl+V).</div>
        </div>
      </div>
      {busy && <div className="small muted" style={{ marginTop: 8 }}>Uploading…</div>}
      {phone && <PhoneUpload label={label} onClose={() => setPhone(false)} onDone={(id) => { onChange(id); setPhone(false); toast('Photo received from phone'); }} />}
    </div>
  );
}

function PhoneUpload({ onClose, onDone, label }: { onClose: () => void; onDone: (id: string) => void; label?: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [qr, setQr] = useState('');
  const [err, setErr] = useState('');
  const settingsUrl = useStore((s) => s.settings.publicUrl);
  const received = useStore((s) => (code ? s.phoneUploads[code] : undefined));
  const link = code ? `${publicSiteUrl(settingsUrl)}#/m/${code}` : '';

  useEffect(() => {
    api<{ code: string }>('/uploads', { body: { label: label || '' } })
      .then(async (r) => {
        setCode(r.code);
        const url = `${publicSiteUrl(settingsUrl)}#/m/${r.code}`;
        setQr(await QRCode.toDataURL(url, { width: 520, margin: 1, errorCorrectionLevel: 'M' }));
      })
      .catch((e) => setErr(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (received) onDone(received); }, [received, onDone]);

  return (
    <Modal title="Take a photo with your phone" onClose={onClose} icon={<Smartphone />}>
      {err ? <div className="banner danger">{err}</div> : !qr ? <div className="center" style={{ padding: 40 }}><Spinner /></div> : (
        <div className="row wrap top" style={{ gap: '1.5rem' }}>
          <img src={qr} alt="QR code" style={{ width: 240, height: 240, borderRadius: 12, background: '#fff', padding: 8, border: '1px solid var(--border)' }} />
          <div className="grow" style={{ minWidth: 220 }}>
            <ol style={{ paddingLeft: '1.2rem', margin: 0, display: 'grid', gap: '0.6rem', fontSize: '1.05rem' }}>
              <li>Open the <b>camera</b> on your phone.</li>
              <li>Point it at this QR code and tap the link that pops up.</li>
              <li>Tap <b>Take photo</b>, then <b>Send</b>.</li>
            </ol>
            <p className="muted" style={{ marginTop: '1rem' }}>The photo appears here automatically. No sign-in needed on the phone — this link works once and expires in 20 minutes.</p>
            <div className="row" style={{ marginTop: '0.5rem' }}><span className="spinner" /><span className="muted">Waiting for photo… (code <b className="mono">{code}</b>)</span></div>
            <details style={{ marginTop: '0.8rem' }}><summary className="small muted" style={{ cursor: 'pointer' }}>Can't scan? Open this link on the phone</summary><div className="mono small" style={{ wordBreak: 'break-all', marginTop: 6 }}>{link}</div></details>
            {received && <div className="banner ok" style={{ marginTop: 10 }}><CheckCircle2 /> Photo received!</div>}
          </div>
        </div>
      )}
    </Modal>
  );
}
