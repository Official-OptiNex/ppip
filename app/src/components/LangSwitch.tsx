import { Languages } from 'lucide-react';
import { getLang, setLang, useLang, type Lang } from '../lib/i18n';
import { savePrefs, useStore } from '../lib/store';

const LANGS: { id: Lang; label: string }[] = [{ id: 'en', label: 'English' }, { id: 'es', label: 'Español' }];

/** English / Español switch. Signed in: also saved to the account (every computer). */
export function LangSwitch({ big }: { big?: boolean }) {
  const lang = useLang();
  const me = useStore((s) => s.me);
  const pick = (l: Lang) => {
    if (me) savePrefs({ lang: l }); else setLang(l);
  };
  return (
    <div className={`lang-switch ${big ? 'big' : ''}`} role="radiogroup" aria-label="Language / Idioma">
      <Languages size={big ? 26 : 20} aria-hidden />
      {LANGS.map((l) => (
        <button key={l.id} type="button" role="radio" aria-checked={lang === l.id} className={`btn ${big ? 'lg' : 'sm'} ${lang === l.id ? 'primary' : ''}`} onClick={() => pick(l.id)} lang={l.id}>{l.label}</button>
      ))}
    </div>
  );
}
export { getLang };

/** First sign-in: ask which language to use (shown before the guided tour). */
export function FirstLanguagePrompt() {
  const me = useStore((s) => s.me);
  const phase = useStore((s) => s.phase);
  if (phase !== 'ready' || !me || me.prefs?.lang) return null;
  const pick = (l: Lang) => savePrefs({ lang: l });
  return (
    <div className="modal-back" style={{ alignItems: 'center' }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Language / Idioma" style={{ maxWidth: 520 }}>
        <div className="modal-body stack center" style={{ padding: '2rem 1.5rem', textAlign: 'center' }}>
          <Languages size={44} style={{ margin: '0 auto', color: 'var(--primary)' }} />
          <h2 style={{ fontSize: '1.6rem' }}>Choose your language<br /><span className="muted" style={{ fontSize: '1.3rem' }}>Elija su idioma</span></h2>
          <div className="grid-2 keep" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <button className="btn lg primary" style={{ minHeight: '5rem', fontSize: '1.35rem' }} onClick={() => pick('en')} lang="en" autoFocus={getLang() === 'en'}>English</button>
            <button className="btn lg primary" style={{ minHeight: '5rem', fontSize: '1.35rem' }} onClick={() => pick('es')} lang="es" autoFocus={getLang() === 'es'}>Español</button>
          </div>
          <p className="muted" style={{ margin: 0 }}>You can change this later in My settings.<br />Puede cambiarlo después en Mi configuración.</p>
        </div>
      </div>
    </div>
  );
}
