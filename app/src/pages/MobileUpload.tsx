import { useEffect, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, CheckCircle2, Send, RotateCcw } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { applyAppearance } from '../lib/store';
import { prepareImage } from '../lib/util';
import { Spinner } from '../components/ui';
import { Logo } from '../components/Logo';
import { LangSwitch } from '../components/LangSwitch';
import { t } from '../lib/i18n';

/** Page opened on a phone from the QR code. No login needed; the one-time code is the key. */
export function MobileUpload({ code }: { code: string }) {
  const [info, setInfo] = useState<{ label?: string } | null>(null);
  const [err, setErr] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);

  useEffect(() => {
    applyAppearance(null);
    api<{ label?: string }>(`/m/${code}`, { auth: false }).then(setInfo).catch((e) => setErr(t(errorMessage(e))));
  }, [code]);

  const choose = (f?: File) => {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };
  const send = async () => {
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const form = await prepareImage(file);
      await api(`/m/${code}`, { form, auth: false, timeout: 90000 });
      setDone(true);
    } catch (e) { setErr(t(errorMessage(e))); } finally { setBusy(false); }
  };

  return (
    <div className="center-screen" style={{ alignItems: 'start' }}>
      <div className="card card-pad stack" style={{ width: '100%', maxWidth: 480, marginTop: '4vh', padding: '1.5rem' }}>
        <LangSwitch />
        <div className="row"><Logo size={44} /><div><h2>{t('Send a photo')}</h2>{info?.label && <div className="muted">{t('For:')} <b>{info.label}</b></div>}</div></div>
        {!info && !err && <div className="center"><Spinner /></div>}
        {err && <div className="banner danger">{err}</div>}
        {done ? (
          <div className="center stack" style={{ padding: '1.5rem 0' }}>
            <CheckCircle2 size={72} color="var(--ok)" />
            <h2>{t('Photo sent!')}</h2>
            <p className="muted">{t("It's now showing on the computer. You can close this page.")}</p>
          </div>
        ) : info && (
          <>
            <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => choose(e.target.files?.[0])} />
            <input ref={gal} type="file" accept="image/*" hidden onChange={(e) => choose(e.target.files?.[0])} />
            {preview ? (
              <>
                <img src={preview} alt={t('Preview')} style={{ width: '100%', borderRadius: 14, maxHeight: '50vh', objectFit: 'contain', background: 'var(--surface-3)' }} />
                <button className="btn primary lg block" onClick={send} disabled={busy} style={{ minHeight: '3.8rem', fontSize: '1.2rem' }}>{busy ? <><Spinner /> {t('Sending…')}</> : <><Send /> {t('Send photo')}</>}</button>
                <button className="btn lg block" onClick={() => { setFile(null); setPreview(''); }} disabled={busy}><RotateCcw /> {t('Retake')}</button>
              </>
            ) : (
              <>
                <button className="btn primary lg block" onClick={() => cam.current?.click()} style={{ minHeight: '4.5rem', fontSize: '1.25rem' }}><Camera size={28} /> {t('Take photo')}</button>
                <button className="btn lg block" onClick={() => gal.current?.click()}><ImageIcon /> {t('Choose from gallery')}</button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
