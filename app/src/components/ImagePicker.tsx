import { useEffect, useRef, useState } from 'react';
import { Upload, Smartphone, Trash2, ImagePlus, CheckCircle2, ClipboardPaste, Camera } from 'lucide-react';
import { CameraCapture, canUseCamera } from './CameraCapture';
import { api, errorMessage, imageUrl, publicSiteUrl } from '../lib/api';
import { prepareImage } from '../lib/util';
import { toast, useStore } from '../lib/store';
import { Modal, Spinner, rich } from './ui';
import { t } from '../lib/i18n';

/** Photo: upload from this computer (click, drag & drop, paste) or send one from a phone via QR code. `round` = profile picture. */
export function ImagePicker({ value, onChange, label, round, purpose }: { value?: string | null; onChange: (id: string | null) => void; label?: string; round?: boolean; purpose?: string }) {
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [phone, setPhone] = useState(false);
  const [cam, setCam] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: Blob) => {
    setBusy(true);
    try {
      const form = await prepareImage(file);
      const { id } = await api<{ id: string }>('/images', { form, timeout: 60000 });
      onChange(id);
    } catch (e) { toast(t('Photo upload failed'), 'danger', t(errorMessage(e))); } finally { setBusy(false); }
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (phone || cam) return;
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
      const f = item?.getAsFile();
      if (f) { e.preventDefault(); upload(f); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, cam]);

  return (
    <div className={`dropzone ${drag ? 'drag' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) upload(f); }}>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
      <div className="row wrap" style={{ justifyContent: 'center', gap: '1rem' }}>
        {value ? (
          <img src={imageUrl(value)} alt={label || ''} style={{ width: 150, height: 150, objectFit: 'cover', borderRadius: round ? '50%' : 12, border: '1px solid var(--border)' }} />
        ) : (
          <div className="thumb" style={{ width: 110, height: 110, borderRadius: round ? '50%' : undefined }}>{busy ? <Spinner /> : <ImagePlus size={40} />}</div>
        )}
        <div className="col" style={{ alignItems: 'stretch', minWidth: 210 }}>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={busy}><Upload size={18} />{value ? t('Replace photo') : t('Upload from this PC')}</button>
          {canUseCamera() && <button type="button" className="btn" onClick={() => setCam(true)} disabled={busy} data-testid="use-camera"><Camera size={18} />{t(round ? 'Use camera / webcam' : 'Use this device’s camera')}</button>}
          <button type="button" className="btn" onClick={() => setPhone(true)} disabled={busy}><Smartphone size={18} />{t('Take photo with phone')}</button>
          {value && <button type="button" className="btn danger-ghost" onClick={() => onChange(null)}><Trash2 size={18} />{t('Remove photo')}</button>}
          <div className="small muted"><ClipboardPaste size={13} style={{ verticalAlign: -2 }} /> {t('You can also drag a picture here or paste one (Ctrl+V).')}</div>
        </div>
      </div>
      {busy && <div className="small muted" style={{ marginTop: 8 }}>{t('Uploading…')}</div>}
      {cam && <CameraCapture selfie={round} onClose={() => setCam(false)} onPhoto={(b) => { setCam(false); upload(b); }} />}
      {phone && <PhoneUpload label={label} purpose={purpose} onClose={() => setPhone(false)} onDone={(id) => { onChange(id); setPhone(false); toast(t('Photo received from phone')); }} />}
    </div>
  );
}

function PhoneUpload({ onClose, onDone, label, purpose }: { onClose: () => void; onDone: (id: string) => void; label?: string; purpose?: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [qr, setQr] = useState('');
  const [err, setErr] = useState('');
  const settingsUrl = useStore((s) => s.settings.publicUrl);
  const received = useStore((s) => (code ? s.phoneUploads[code] : undefined));
  const link = code ? `${publicSiteUrl(settingsUrl)}#/m/${code}` : '';

  useEffect(() => {
    api<{ code: string }>('/uploads', { body: { label: label || '', purpose: purpose || '' } })
      .then(async (r) => {
        setCode(r.code);
        const url = `${publicSiteUrl(settingsUrl)}#/m/${r.code}`;
        setQr(await (await import('qrcode')).default.toDataURL(url, { width: 520, margin: 1, errorCorrectionLevel: 'M' }));
      })
      .catch((e) => setErr(t(errorMessage(e))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (received) onDone(received); }, [received, onDone]);

  return (
    <Modal title={t('Take a photo with your phone')} onClose={onClose} icon={<Smartphone />}>
      {err ? <div className="banner danger">{err}</div> : !qr ? <div className="center" style={{ padding: 40 }}><Spinner /></div> : (
        <div className="row wrap top" style={{ gap: '1.5rem' }}>
          <img src={qr} alt="QR code" style={{ width: 240, height: 240, borderRadius: 12, background: '#fff', padding: 8, border: '1px solid var(--border)' }} />
          <div className="grow" style={{ minWidth: 220 }}>
            <ol style={{ paddingLeft: '1.2rem', margin: 0, display: 'grid', gap: '0.6rem', fontSize: '1.05rem' }}>
              <li>{rich('Open the **camera** on your phone.')}</li>
              <li>{t('Point it at this QR code and tap the link that pops up.')}</li>
              <li>{rich('Tap **Take photo**, then **Send**.')}</li>
            </ol>
            <p className="muted" style={{ marginTop: '1rem' }}>{t('The photo appears here automatically. No sign-in needed on the phone — this link works once and expires in 20 minutes.')}</p>
            <div className="row" style={{ marginTop: '0.5rem' }}><span className="spinner" /><span className="muted">{t('Waiting for photo…')} ({t('code')} <b className="mono">{code}</b>)</span></div>
            <details style={{ marginTop: '0.8rem' }}><summary className="small muted" style={{ cursor: 'pointer' }}>{t("Can't scan? Open this link on the phone")}</summary><div className="mono small" style={{ wordBreak: 'break-all', marginTop: 6 }}>{link}</div></details>
            {received && <div className="banner ok" style={{ marginTop: 10 }}><CheckCircle2 /> {t('Photo received!')}</div>}
          </div>
        </div>
      )}
    </Modal>
  );
}
