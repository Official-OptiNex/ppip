// Take a photo with this device's own camera (a PC webcam, or a tablet / phone camera): live preview → Take photo → Use it.
import { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, RotateCcw, Check, SwitchCamera } from 'lucide-react';
import { t } from '../lib/i18n';
import { Modal, Spinner } from './ui';

/** True when this browser can open a camera (needs https or localhost). */
export const canUseCamera = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;

export function CameraCapture({ onClose, onPhoto, selfie }: { onClose: () => void; onPhoto: (photo: Blob) => void; selfie?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [camIdx, setCamIdx] = useState(-1); // -1 = let the browser pick (front for selfies, back otherwise)
  const [err, setErr] = useState('');
  const [ready, setReady] = useState(false);
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  const stop = () => { stream.current?.getTracks().forEach((tr) => tr.stop()); stream.current = null; };

  useEffect(() => {
    let cancelled = false;
    setReady(false); setErr('');
    const deviceId = camIdx >= 0 ? cams[camIdx]?.deviceId : undefined;
    navigator.mediaDevices.getUserMedia({
      video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } } : { facingMode: selfie ? 'user' : 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    }).then(async (s) => {
      if (cancelled) { s.getTracks().forEach((tr) => tr.stop()); return; }
      stop(); stream.current = s;
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
      setReady(true);
      // names are only available after permission is given
      const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      if (!cancelled) setCams(list);
    }).catch((e: DOMException) => {
      if (cancelled) return;
      setErr(e?.name === 'NotAllowedError' ? t('The camera is blocked. Click the camera icon in the address bar, choose Allow, then try again.')
        : e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError' ? t('No camera was found on this device.')
          : e?.name === 'NotReadableError' ? t('The camera is being used by another program. Close it and try again.')
            : t('The camera could not be opened.'));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camIdx, attempt]);
  useEffect(() => () => { stop(); }, []);
  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);

  const front = selfie && camIdx < 0; // mirror the preview like a mirror for selfies
  const take = () => {
    const v = video.current; if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    const g = c.getContext('2d')!;
    if (front) { g.translate(c.width, 0); g.scale(-1, 1); }
    g.drawImage(v, 0, 0);
    c.toBlob((b) => { if (b) setShot({ blob: b, url: URL.createObjectURL(b) }); }, 'image/jpeg', 0.9);
  };
  const use = () => { if (shot) { stop(); onPhoto(shot.blob); } };
  const close = () => { stop(); onClose(); };

  return (
    <Modal title={t('Take a photo')} icon={<Camera />} onClose={close} size="wide"
      footer={shot
        ? <><button type="button" className="btn lg" onClick={() => setShot(null)}><RotateCcw />{t('Retake')}</button><button type="button" className="btn primary lg" onClick={use} autoFocus><Check />{t('Use this photo')}</button></>
        : <><button type="button" className="btn lg" onClick={close}>{t('Cancel')}</button>
          {cams.length > 1 && <button type="button" className="btn lg" onClick={() => setCamIdx((i) => (i + 1) % cams.length)}><SwitchCamera />{t('Switch camera')}</button>}
          <button type="button" className="btn primary lg" onClick={take} disabled={!ready} data-testid="camera-take"><Camera />{t('Take photo')}</button></>}>
      {err ? (
        <div className="stack">
          <div className="banner danger">{err}</div>
          <button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)} style={{ alignSelf: 'flex-start' }}><RefreshCw size={18} />{t('Try again')}</button>
        </div>
      ) : (
        <div className="camera-box">
          <video ref={video} playsInline muted className={front ? 'mirror' : ''} style={{ display: shot ? 'none' : 'block' }} />
          {shot && <img src={shot.url} alt={t('Photo preview')} />}
          {!ready && !shot && <div className="camera-wait"><Spinner /><span>{t('Starting camera…')}</span></div>}
        </div>
      )}
    </Modal>
  );
}
