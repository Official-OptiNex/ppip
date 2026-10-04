// Optional photo on a shift note / downtime entry: "Add photo" (camera, webcam, phone or file), small thumbnail, tap to enlarge.
import { useState } from 'react';
import { Camera, X, ImageIcon } from 'lucide-react';
import { imageUrl } from '../lib/api';
import { t } from '../lib/i18n';
import { Modal } from './ui';
import { ImagePicker } from './ImagePicker';

export function PhotoAttach({ value, onChange, label }: { value?: string | null; onChange: (id: string) => void; label?: string }) {
  const [pick, setPick] = useState(false);
  return (
    <>
      {value ? (
        <span className="photo-attach">
          <PhotoThumb id={value} size={56} />
          <button type="button" className="btn sm ghost" onClick={() => onChange('')} aria-label={t('Remove photo')} title={t('Remove photo')}><X size={16} /></button>
        </span>
      ) : (
        <button type="button" className="btn" onClick={() => setPick(true)} data-testid="add-photo"><Camera size={18} />{t('Add photo')}</button>
      )}
      {pick && (
        <Modal title={t('Add a photo')} icon={<Camera />} onClose={() => setPick(false)}>
          <ImagePicker value={null} label={label} onChange={(id) => { if (id) onChange(id); setPick(false); }} />
        </Modal>
      )}
    </>
  );
}

/** Small photo; click to see it big. */
export function PhotoThumb({ id, size = 64 }: { id: string; size?: number }) {
  const [big, setBig] = useState(false);
  return (
    <>
      <button type="button" className="photo-thumb" style={{ width: size, height: size }} onClick={(e) => { e.stopPropagation(); setBig(true); }} aria-label={t('View photo')}>
        <img src={imageUrl(id, true)} alt="" loading="lazy" />
      </button>
      {big && (
        // clicks inside the viewer must not reach a clickable table row behind it
        <span onClick={(e) => e.stopPropagation()}>
          <Modal title={t('Photo')} icon={<ImageIcon />} size="wide" onClose={() => setBig(false)}>
            <img src={imageUrl(id)} alt="" style={{ width: '100%', maxHeight: '72vh', objectFit: 'contain', borderRadius: 12, background: '#000' }} />
          </Modal>
        </span>
      )}
    </>
  );
}
