'use client';

import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Studio } from './state';
import { FONT_DISPLAY, FONT_BODY } from './helpers';
import { Binding, CoverFace, Fleuron } from './SwatchBook';

/** Why the page was opened: from the menu, to order the swatch book, or for the one detail an order still needs. */
export type AuthIntent = 'account' | 'order' | 'whatsapp';

/** The static preview has no server, so no accounts: there the page shows the experience without one. */
const PREVIEW = !!process.env.NEXT_PUBLIC_BASE_PATH;

const GOLD = 'rgba(214,180,120,.9)';
const CREAM = '#F3E9D6';

/** A WhatsApp number with its country code: 8 to 15 digits, spaces and dashes allowed. */
export function validWhatsapp(v: string) {
  const digits = v.replace(/\D/g, '');
  return /^\+?[\d\s-]+$/.test(v.trim()) && digits.length >= 8 && digits.length <= 15;
}

/**
 * Signing in, or creating an account, as a page of its own: the lamplit room of the binding
 * ceremony, the closed volume under the light, and a form set like a letterpress card — labels in
 * spaced capitals, fields ruled in gold rather than boxed. Creating an account asks once for
 * everything an order needs (name, company, city and WhatsApp), so ordering never asks again.
 *
 * With `intent="order"` it ends by handing the order on (with the buyer's WhatsApp number); with
 * `intent="whatsapp"` it asks a signed-in buyer only for the number their account lacks.
 */
export function AuthScreen({
  studio,
  intent,
  onClose,
  onDone,
}: {
  studio: Studio;
  intent: AuthIntent;
  onClose: () => void;
  onDone: (result: { whatsapp: string | null; demo: boolean }) => void;
}) {
  const { t } = studio;
  const [mode, setMode] = useState<'signin' | 'create' | 'whatsapp'>(intent === 'whatsapp' ? 'whatsapp' : 'signin');
  const [f, setF] = useState({ name: '', company: '', city: '', whatsapp: '+91 ', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => {
    setF((was) => ({ ...was, [k]: v }));
    setError(null);
  };
  const ordering = intent !== 'account';
  const shades = studio.pins.length;

  const title = mode === 'whatsapp' ? t.authWaTitle : ordering ? t.authOrderTitle : t.authAccountTitle;
  const sub = mode === 'whatsapp' ? t.authWaSub : ordering ? t.authOrderSub.replace('{n}', String(shades)) : t.authAccountSub;
  const action = mode === 'whatsapp' ? t.saveOrder : mode === 'create' ? (ordering ? t.createOrder : t.createBtn) : ordering ? t.signInOrder : t.signInTab;

  const submit = async () => {
    if (busy) return;
    if ((mode === 'create' || mode === 'whatsapp') && !validWhatsapp(f.whatsapp)) return setError(t.waBad);
    if (mode === 'create' && f.password.length < 8) return setError(t.pwShort);
    const whatsapp = f.whatsapp.trim();

    if (PREVIEW) {
      // No accounts here: a sign-in still needs a number to show the book going out.
      if (mode === 'signin' && ordering) return setMode('whatsapp');
      return onDone({ whatsapp: mode === 'signin' ? null : whatsapp, demo: true });
    }

    setBusy(true);
    try {
      if (mode === 'whatsapp') {
        if (!(await studio.saveWhatsapp(whatsapp))) return setError(t.saveFailed);
        return onDone({ whatsapp, demo: false });
      }
      if (mode === 'create') {
        const err = await studio.doRegister({ name: f.name.trim(), email: f.email, password: f.password, company: f.company.trim(), whatsapp, city: f.city.trim() });
        if (err) return setError(err);
        return onDone({ whatsapp, demo: false });
      }
      const err = await studio.doSignIn(f.email.trim().toLowerCase(), f.password);
      if (err) return setError(err);
      if (!ordering) return onDone({ whatsapp: null, demo: false });
      // An account made before sign-up asked for a number: ask for it now, once.
      const onFile = await studio.accountWhatsapp();
      if (!onFile) return setMode('whatsapp');
      return onDone({ whatsapp: onFile, demo: false });
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed', inset: 0, zIndex: 118, overflowY: 'auto', color: CREAM, fontFamily: FONT_BODY,
        background: 'radial-gradient(90% 55% at 50% 18%, #3E2819 0%, #23160D 52%, #110A05 100%)', animation: 'pcFadeIn .45s ease both',
      }}
    >
      <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', background: 'radial-gradient(34% 22% at 50% 16%, rgba(255,214,150,.14), transparent 70%)' }} />
      <button
        onClick={onClose}
        aria-label={t.closeWord}
        className="pc-hv-scale-06"
        style={{ position: 'fixed', top: 'max(14px, env(safe-area-inset-top))', right: 14, zIndex: 2, width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', cursor: 'pointer', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(205,169,96,.4)', color: CREAM, fontSize: 18, lineHeight: 1 }}
      >
        ×
      </button>

      <div style={{ position: 'relative', width: 'min(100%, 420px)', margin: '0 auto', padding: 'max(5vh, 34px) 24px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        {/* The volume, closed, under the lamp. */}
        <div aria-hidden style={{ width: 118, height: 157, position: 'relative', animation: 'rise .9s .05s cubic-bezier(.22,.8,.2,1) both' }}>
          {/* Drawn at a cover's full size and scaled down, so its title keeps to one line. */}
          <div style={{ position: 'absolute', left: 0, top: 0, width: 314, transform: 'scale(.376)', transformOrigin: '0 0' }}>
            <Binding width="314px" padded={false}>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 26, right: 0 }}>
                <CoverFace t={t} userName={mode === 'create' && f.name.trim() ? f.name.trim() : studio.userName} />
              </div>
            </Binding>
          </div>
        </div>

        <div style={{ marginTop: 28, fontSize: 9.5, letterSpacing: '.46em', textTransform: 'uppercase', color: GOLD, paddingLeft: '.46em', animation: 'rise .8s .15s cubic-bezier(.22,.8,.2,1) both' }}>Poddar Creation</div>
        <h1 key={title} className="pc-foil" style={{ margin: '12px 0 0', fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontWeight: 500, fontSize: 'clamp(34px,9vw,44px)', lineHeight: 1.05, animation: 'rise .8s .2s cubic-bezier(.22,.8,.2,1) both' }}>
          {title}
        </h1>
        <p style={{ margin: '12px 0 0', maxWidth: 320, fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 16.5, lineHeight: 1.45, color: 'rgba(243,233,214,.68)', animation: 'rise .8s .25s cubic-bezier(.22,.8,.2,1) both' }}>{sub}</p>
        <div style={{ marginTop: 20, animation: 'rise .8s .3s cubic-bezier(.22,.8,.2,1) both' }}>
          <Fleuron width={30} color="rgba(205,169,96,.7)" />
        </div>

        {mode !== 'whatsapp' && (
          // Sign in, or create an account: two words, the chosen one underlined in gold.
          <div role="tablist" style={{ display: 'flex', gap: 28, marginTop: 24, animation: 'rise .8s .35s cubic-bezier(.22,.8,.2,1) both' }}>
            {(['signin', 'create'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                style={{
                  position: 'relative', cursor: 'pointer', background: 'none', border: 'none', padding: '6px 2px 10px', fontFamily: FONT_BODY, fontSize: 11, letterSpacing: '.24em',
                  textTransform: 'uppercase', color: mode === m ? CREAM : 'rgba(243,233,214,.45)', transition: 'color .4s ease',
                }}
              >
                {m === 'signin' ? t.signInTab : t.createTab}
                <span aria-hidden className="pc-foil-bg" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, transform: `scaleX(${mode === m ? 1 : 0})`, transition: 'transform .5s cubic-bezier(.22,.8,.2,1)' }} />
              </button>
            ))}
          </div>
        )}

        <form
          key={mode}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          style={{ width: '100%', marginTop: 22, display: 'flex', flexDirection: 'column', gap: 18, textAlign: 'left', animation: 'rise .6s cubic-bezier(.22,.8,.2,1) both' }}
        >
          {mode === 'create' && (
            <>
              <Field label={t.fFullName} value={f.name} onChange={set('name')} autoComplete="name" required />
              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16 }}>
                <Field label={t.fCompanyOnly} value={f.company} onChange={set('company')} autoComplete="organization" required />
                <Field label={t.fCity} value={f.city} onChange={set('city')} autoComplete="address-level2" required />
              </div>
            </>
          )}
          {(mode === 'create' || mode === 'whatsapp') && (
            <Field label={t.fWhatsapp} value={f.whatsapp} onChange={set('whatsapp')} type="tel" inputMode="tel" autoComplete="tel" required numeric>
              <WhatsAppGlyph />
            </Field>
          )}
          {mode !== 'whatsapp' && (
            <>
              <Field label={t.fEmail} value={f.email} onChange={set('email')} type="email" autoComplete="email" required />
              <Field label={t.fPassword} value={f.password} onChange={set('password')} type="password" autoComplete={mode === 'create' ? 'new-password' : 'current-password'} required />
            </>
          )}

          <div role="alert" aria-live="polite" style={{ minHeight: 18, marginTop: -6, fontSize: 12.5, color: '#E8A48E', textAlign: 'center' }}>
            {error}
          </div>

          <button
            type="submit"
            disabled={busy}
            className="pc-book"
            style={{
              cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', borderRadius: 999, padding: '16px 18px',
              fontFamily: FONT_BODY, fontSize: 11.5, letterSpacing: '.22em', textTransform: 'uppercase', whiteSpace: 'nowrap', color: '#1C1917',
              background: 'linear-gradient(135deg, #F6E7BE, #D8B670 55%, #E9CF8F)', border: '1px solid rgba(255,240,200,.6)', boxShadow: '0 14px 34px rgba(0,0,0,.4)', opacity: busy ? 0.75 : 1,
            }}
          >
            {ordering && <span aria-hidden>✦</span>}
            {busy ? '…' : action}
          </button>
        </form>

        {mode === 'signin' && !PREVIEW && (
          <a href="/forgot-password" style={{ marginTop: 16, fontSize: 11, letterSpacing: '.14em', color: 'rgba(243,233,214,.55)', textDecoration: 'none', borderBottom: '1px solid rgba(205,169,96,.35)', paddingBottom: 2 }}>
            {t.forgotPw}
          </a>
        )}
        <p style={{ margin: '22px 0 0', maxWidth: 320, fontSize: 11.5, lineHeight: 1.6, color: 'rgba(243,233,214,.42)' }}>{PREVIEW ? t.authPreview : t.authFine}</p>
      </div>
    </div>,
    document.body,
  );
}

/** A field ruled in gold: its label in spaced capitals above, the entry on a single hairline. */
function Field({
  label, value, onChange, type = 'text', autoComplete, inputMode, required, numeric, children,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string;
  inputMode?: 'tel' | 'email' | 'text'; required?: boolean; numeric?: boolean; children?: ReactNode;
}) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 9, letterSpacing: '.3em', textTransform: 'uppercase', color: GOLD }}>
        {children}
        {label}
      </span>
      <input
        className="pc-auth-input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        inputMode={inputMode}
        required={required}
        style={{ fontVariantNumeric: numeric ? 'lining-nums' : undefined }}
      />
    </label>
  );
}

function WhatsAppGlyph() {
  return (
    <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 2.5a9.5 9.5 0 0 0-8.2 14.3L2.5 21.5l4.8-1.3A9.5 9.5 0 1 0 12 2.5Z" />
    </svg>
  );
}
