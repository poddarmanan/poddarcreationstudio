'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Studio } from './state';
import { FONT_DISPLAY, FONT_BODY, fabricTex } from './helpers';
import { Binding, CoverFace, MARBLE, Room } from './SwatchBook';

/** Why the page was opened: from the menu, to order the swatch book, or for the one detail an order still needs. */
export type AuthIntent = 'account' | 'order' | 'whatsapp';

/** The static preview has no server, so no accounts: there the page shows the experience without one. */
const PREVIEW = !!process.env.NEXT_PUBLIC_BASE_PATH;

const INK = '#1C1917';
const UMBER = '#8A6D45';

/** A WhatsApp number with its country code: 8 to 15 digits, spaces and dashes allowed. */
export function validWhatsapp(v: string) {
  const digits = v.replace(/\D/g, '');
  return /^\+?[\d\s-]+$/.test(v.trim()) && digits.length >= 8 && digits.length <= 15;
}

/**
 * Signing in, or creating an account, as a page of the studio like any other — under the same top
 * bar and above the same tabs, in the Swatch Book's reading room: warm light pooling on cream, the
 * closed volume floating in it, the buyer's own cuttings fanned beneath, and a form set like a
 * letterpress card, its fields ruled in gold rather than boxed. Creating an account asks once for
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
  onDone: (result: { whatsapp: string | null; demo: boolean; from?: DOMRect }) => void;
}) {
  const { t } = studio;
  const [mode, setMode] = useState<'signin' | 'create' | 'whatsapp'>(intent === 'whatsapp' ? 'whatsapp' : 'signin');
  const [f, setF] = useState({ name: '', company: '', city: '', whatsapp: '+91 ', email: '', password: '' });
  const [error, setError] = useState<{ text: string; n: number } | null>(null);
  const [busy, setBusy] = useState(false);
  // How the page leaves: the book opens and hands on to the ceremony, or the room fades out.
  const [leaving, setLeaving] = useState<null | 'open' | 'close'>(null);
  const timers = useRef<number[]>([]);
  const bookRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => () => timers.current.forEach((x) => window.clearTimeout(x)), []);

  const set = (k: keyof typeof f) => (v: string) => {
    setF((was) => ({ ...was, [k]: v }));
    setError(null);
  };
  const fail = (text: string) => setError((e) => ({ text, n: (e?.n ?? 0) + 1 }));
  const ordering = intent !== 'account';
  const shades = studio.pins.length;

  const title = mode === 'whatsapp' ? t.authWaTitle : ordering ? t.authOrderTitle : t.authAccountTitle;
  const sub = mode === 'whatsapp' ? t.authWaSub : ordering ? t.authOrderSub.replace('{n}', String(shades)) : t.authAccountSub;
  const action = mode === 'whatsapp' ? t.saveOrder : mode === 'create' ? (ordering ? t.createOrder : t.createBtn) : ordering ? t.signInOrder : t.signInTab;

  /** The book opens, its light spills out, and the page hands on. */
  const finish = (result: { whatsapp: string | null; demo: boolean }) => {
    // The page glides back up to the book first, so the buyer sees it open; the confetti then
    // bursts out of it.
    const far = window.scrollY > 40;
    if (far) window.scrollTo({ top: 0, behavior: 'smooth' });
    const wait = far ? 450 : 0;
    timers.current.push(window.setTimeout(() => setLeaving('open'), wait));
    timers.current.push(window.setTimeout(() => onDone({ ...result, from: bookRef.current?.getBoundingClientRect() }), wait + 1250));
  };
  const close = () => {
    if (leaving) return;
    setLeaving('close');
    timers.current.push(window.setTimeout(onClose, 380));
  };

  const submit = async () => {
    if (busy || leaving) return;
    if ((mode === 'create' || mode === 'whatsapp') && !validWhatsapp(f.whatsapp)) return fail(t.waBad);
    if (mode === 'create' && f.password.length < 8) return fail(t.pwShort);
    const whatsapp = f.whatsapp.trim();

    if (PREVIEW) {
      // No accounts here: a sign-in still needs a number to show the book going out.
      if (mode === 'signin' && ordering) return setMode('whatsapp');
      return finish({ whatsapp: mode === 'signin' ? null : whatsapp, demo: true });
    }

    setBusy(true);
    try {
      if (mode === 'whatsapp') {
        if (!(await studio.saveWhatsapp(whatsapp))) return fail(t.saveFailed);
        return finish({ whatsapp, demo: false });
      }
      if (mode === 'create') {
        const err = await studio.doRegister({ name: f.name.trim(), email: f.email, password: f.password, company: f.company.trim(), whatsapp, city: f.city.trim() });
        if (err) return fail(err);
        return finish({ whatsapp, demo: false });
      }
      const err = await studio.doSignIn(f.email.trim().toLowerCase(), f.password);
      if (err) return fail(err);
      if (!ordering) return finish({ whatsapp: null, demo: false });
      // An account made before sign-up asked for a number: ask for it now, once.
      const onFile = await studio.accountWhatsapp();
      if (!onFile) return setMode('whatsapp');
      return finish({ whatsapp: onFile, demo: false });
    } finally {
      setBusy(false);
    }
  };

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim());
  const fields: { key: string; node: ReactNode }[] = [];
  if (mode === 'create') {
    fields.push({ key: 'name', node: <Field label={t.fFullName} value={f.name} onChange={set('name')} autoComplete="name" required ok={f.name.trim().length > 1} /> });
    fields.push({
      key: 'co',
      node: (
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16 }}>
          <Field label={t.fCompanyOnly} value={f.company} onChange={set('company')} autoComplete="organization" required ok={f.company.trim().length > 1} />
          <Field label={t.fCity} value={f.city} onChange={set('city')} autoComplete="address-level2" required ok={f.city.trim().length > 1} />
        </div>
      ),
    });
  }
  if (mode === 'create' || mode === 'whatsapp')
    fields.push({
      key: 'wa',
      node: (
        <Field label={t.fWhatsapp} value={f.whatsapp} onChange={set('whatsapp')} type="tel" inputMode="tel" autoComplete="tel" required numeric ok={validWhatsapp(f.whatsapp)}>
          <WhatsAppGlyph />
        </Field>
      ),
    });
  if (mode !== 'whatsapp') {
    fields.push({ key: 'em', node: <Field label={t.fEmail} value={f.email} onChange={set('email')} type="email" autoComplete="email" required ok={emailOk} /> });
    fields.push({
      key: 'pw',
      node: <Field label={t.fPassword} value={f.password} onChange={set('password')} type="password" autoComplete={mode === 'create' ? 'new-password' : 'current-password'} required ok={mode === 'create' ? f.password.length >= 8 : f.password.length > 0} />,
    });
  }

  const cover = mode === 'create' && f.name.trim() ? f.name.trim() : studio.userName;
  const opening = leaving === 'open';

  // The buyer's own cuttings, fanned under the book: what they are about to order.
  const cuttings = studio.fabrics.flatMap((x) =>
    studio.pins.filter((p) => p.fabricId === x.id).map((p) => ({ x, c: x.colours.find((cc) => cc.order === p.colourOrder) })),
  ).filter((k): k is { x: (typeof studio.fabrics)[number]; c: NonNullable<(typeof k)['c']> } => !!k.c);
  const fan = cuttings.slice(0, 7);
  const nFabrics = new Set(cuttings.map((k) => k.x.id)).size;
  const delay = (s0: number) => `${s0}s`;

  return (
    <div className="pc-auth" style={{ animation: leaving === 'close' ? 'pcAuthOut .38s ease forwards' : undefined }}>
      <Room center>
        {/* The warm light over the reading room: it comes up, then breathes; gold dust turns in it. */}
        <div aria-hidden className="pc-auth-beam" />
        <div aria-hidden style={{ position: 'absolute', inset: '-60px -16px 0', pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
          {MOTES.map((m, i) => (
            <span
              key={i}
              className="pc-auth-mote"
              style={{ left: m.left, top: m.top, width: m.size, height: m.size, ['--dx' as string]: m.dx, ['--op' as string]: m.op, animationDuration: m.dur, animationDelay: m.delay } as CSSProperties}
            />
          ))}
        </div>

        {/* The way back, as every page of the studio has it. */}
        <div style={{ alignSelf: 'stretch', display: 'flex', justifyContent: 'flex-start', marginTop: -6, animation: 'pcRiseIn .8s .2s ease both' }}>
          <button onClick={close} className="pc-auth-back">
            <span aria-hidden className="pc-auth-back-arrow">←</span>
            {ordering ? t.book : t.closeWord}
          </button>
        </div>

        {/* The volume in the light: it arrives, floats and turns a little, and light runs across
            its foil. Signing in opens it and its light spills out. */}
        <div ref={bookRef} aria-hidden style={{ position: 'relative', width: 128, height: 170, marginTop: 14, perspective: 900 }}>
          <div className="pc-auth-halo" style={{ opacity: opening ? 1 : undefined, transform: opening ? 'scale(1.6)' : undefined, transition: 'transform 1.1s cubic-bezier(.2,.8,.2,1), opacity .6s ease' }} />
          <div className="pc-auth-shadow" />
          <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', animation: 'pcBookArrive 1.5s cubic-bezier(.16,.84,.24,1) both' }}>
            <div className="pc-auth-float" style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', animationPlayState: opening ? 'paused' : undefined }}>
              {/* Drawn at a cover's full size and scaled down, so its title keeps to one line. */}
              <div style={{ position: 'absolute', left: 0, top: 0, width: 314, transform: 'scale(.4)', transformOrigin: '0 0' }}>
                <Binding width="314px" padded={false}>
                  <div style={{ position: 'absolute', top: 7, bottom: 7, left: 28, right: 9, borderRadius: 2, background: 'linear-gradient(90deg, #E9DFC9, #FBF6EA 12%, #F6EEDC)', boxShadow: 'inset 6px 0 14px -8px rgba(0,0,0,.4)' }} />
                  <div style={{ position: 'absolute', top: 7, bottom: 7, left: 28, right: 9, background: 'radial-gradient(60% 50% at 40% 50%, rgba(255,236,190,.95), rgba(255,210,140,.35) 55%, transparent 80%)', opacity: opening ? 1 : 0, transition: 'opacity .9s .25s ease' }} />
                  <div
                    style={{
                      position: 'absolute', top: 0, bottom: 0, left: 26, right: 0, zIndex: 2, transformOrigin: 'left center', transformStyle: 'preserve-3d',
                      transform: opening ? 'rotateY(-158deg)' : 'rotateY(0deg)', transition: 'transform 1.15s cubic-bezier(.6,.02,.28,1)',
                    }}
                  >
                    <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', overflow: 'hidden', borderRadius: '0 10px 10px 0' }}>
                      <CoverFace t={t} userName={cover} />
                      <span className="pc-auth-glint" />
                    </div>
                    <div style={{ position: 'absolute', inset: 0, transform: 'rotateY(180deg)', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', borderRadius: '10px 0 0 10px', background: `${MARBLE} center / cover`, boxShadow: 'inset 0 0 0 10px #40101A, inset 0 0 0 11px rgba(205,169,96,.7)' }} />
                  </div>
                </Binding>
              </div>
            </div>
          </div>
        </div>

        <div style={{ opacity: opening ? 0 : 1, transform: opening ? 'translateY(14px)' : 'none', transition: 'opacity .55s ease, transform .7s ease', width: 'min(100%, 420px)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ marginTop: 40, fontSize: 9.5, letterSpacing: '.46em', textTransform: 'uppercase', color: UMBER, paddingLeft: '.46em', animation: `pcRiseIn .9s ${delay(0.5)} cubic-bezier(.2,.8,.2,1) both` }}>Poddar Creation</div>
          <h1 key={title} style={{ margin: '12px 0 0', fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(38px,9.5vw,54px)', lineHeight: 1.04, color: INK, perspective: 400 }}>
            {title.split(' ').map((w, i, all) => (
              <span
                key={i}
                style={{ display: 'inline-block', marginRight: i < all.length - 1 ? '.24em' : 0, fontStyle: i === all.length - 1 ? 'italic' : undefined, transformOrigin: '50% 100%', animation: `pcWordIn 1s ${0.62 + i * 0.1}s cubic-bezier(.2,.8,.2,1) both` }}
              >
                {w}
              </span>
            ))}
          </h1>
          <p key={sub} style={{ margin: '12px 0 0', maxWidth: 330, fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 17, lineHeight: 1.45, color: UMBER, animation: 'pcRiseIn 1s 1s cubic-bezier(.2,.8,.2,1) both' }}>
            {sub}
          </p>

          {ordering && fan.length > 0 && (
            // What is about to be ordered: the buyer's own cuttings, fanned out.
            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div aria-hidden style={{ display: 'flex', justifyContent: 'center', height: 46 }}>
                {fan.map(({ x, c }, k) => {
                  const mid = (fan.length - 1) / 2;
                  return (
                    <span key={`${x.id}-${c.order}`} style={{ width: 30, height: 38, marginLeft: k ? -9 : 0, animation: `pcFanIn .8s ${1.05 + k * 0.06}s cubic-bezier(.2,.8,.2,1) both`, ['--r' as string]: `${(k - mid) * 7}deg`, ['--y' as string]: `${Math.abs(k - mid) * 2.5}px` } as CSSProperties}>
                      <span className="pc-pinked" style={{ display: 'block', width: '100%', height: '100%', background: fabricTex(x, c, 3), boxShadow: '0 3px 6px rgba(40,26,12,.25)' }} />
                    </span>
                  );
                })}
              </div>
              <div style={{ marginTop: 8, fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(28,25,23,.5)', fontVariantNumeric: 'lining-nums', animation: 'pcRiseIn .9s 1.3s ease both' }}>
                {cuttings.length} {cuttings.length === 1 ? t.shade : t.shades} · {nFabrics} {nFabrics === 1 ? t.fabricWordOne : t.fabricWordMany}
              </div>
            </div>
          )}

          {/* A printer's rule that draws itself out from its diamond. */}
          <div aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 22 }}>
            <span style={{ width: 34, height: 1, background: 'linear-gradient(90deg, transparent, rgba(138,109,69,.7))', transformOrigin: 'right', animation: 'pcRuleDraw 1s 1.15s cubic-bezier(.2,.8,.2,1) both' }} />
            <span style={{ width: 6, height: 6, background: 'rgba(168,134,79,.95)', animation: 'pcDiamondIn .8s 1.05s cubic-bezier(.2,.8,.2,1) both' }} />
            <span style={{ width: 34, height: 1, background: 'linear-gradient(270deg, transparent, rgba(138,109,69,.7))', transformOrigin: 'left', animation: 'pcRuleDraw 1s 1.15s cubic-bezier(.2,.8,.2,1) both' }} />
          </div>

          {mode !== 'whatsapp' && (
            // Sign in, or create an account: a gold underline slides to the one chosen.
            <div role="tablist" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', width: 'min(100%, 300px)', marginTop: 24, animation: 'pcRiseIn .9s 1.2s cubic-bezier(.2,.8,.2,1) both' }}>
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
                    cursor: 'pointer', background: 'none', border: 'none', padding: '6px 2px 12px', fontFamily: FONT_BODY, fontSize: 11, letterSpacing: '.24em',
                    textTransform: 'uppercase', whiteSpace: 'nowrap', color: mode === m ? INK : 'rgba(28,25,23,.4)', transition: 'color .45s ease',
                  }}
                >
                  {m === 'signin' ? t.signInTab : t.createTab}
                </button>
              ))}
              <span aria-hidden style={{ position: 'absolute', left: 0, bottom: 0, width: '50%', height: 1, transform: `translateX(${mode === 'create' ? 100 : 0}%)`, transition: 'transform .6s cubic-bezier(.65,0,.25,1)' }}>
                <span className="pc-foil-bg" style={{ display: 'block', width: '70%', height: 1.5, margin: '0 auto' }} />
              </span>
            </div>
          )}

          <form
            key={mode}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            style={{ width: '100%', marginTop: 26, display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'left' }}
          >
            {fields.map((x, i) => (
              <div key={x.key} style={{ animation: `pcFieldIn .8s ${(mode === 'signin' ? 1.3 : 0.05) + i * 0.08}s cubic-bezier(.2,.8,.2,1) both` }}>
                {x.node}
              </div>
            ))}

            <div key={error?.n ?? 0} role="alert" aria-live="polite" style={{ minHeight: 18, marginTop: -2, fontSize: 12.5, color: '#A5392B', textAlign: 'center', animation: error ? 'pcShake .5s cubic-bezier(.36,.07,.19,.97) both' : undefined }}>
              {error?.text}
            </div>

            <button
              type="submit"
              disabled={busy || !!leaving}
              className="pc-auth-btn"
              style={{ animation: `pcFieldIn .8s ${(mode === 'signin' ? 1.3 : 0.05) + fields.length * 0.08 + 0.05}s cubic-bezier(.2,.8,.2,1) both` }}
            >
              {ordering && !busy && <span aria-hidden className="pc-auth-star">✦</span>}
              {busy ? (
                <span aria-label="…" style={{ display: 'inline-flex', gap: 6 }}>
                  {[0, 1, 2].map((k) => (
                    <span key={k} className="pc-auth-dot" style={{ animationDelay: `${k * 0.16}s` }} />
                  ))}
                </span>
              ) : (
                action
              )}
            </button>
          </form>

          {mode === 'signin' && !PREVIEW && (
            <a href="/forgot-password" className="pc-auth-link" style={{ marginTop: 18, animation: 'pcRiseIn .9s 1.7s ease both' }}>
              {t.forgotPw}
            </a>
          )}
          <p style={{ margin: '22px 0 0', maxWidth: 320, fontSize: 11.5, lineHeight: 1.6, color: 'rgba(28,25,23,.45)', animation: 'pcRiseIn .9s 1.8s ease both' }}>{PREVIEW ? t.authPreview : t.authFine}</p>
        </div>
      </Room>
    </div>
  );
}

/** Gold dust in the lamplight: where each mote starts, how it drifts, and how long it takes. */
const MOTES = Array.from({ length: 18 }, (_, i) => ({
  left: `${30 + ((i * 37) % 41)}%`,
  top: `${6 + ((i * 53) % 46)}%`,
  size: 2 + (i % 3),
  dx: `${((i * 29) % 40) - 20}px`,
  op: (0.35 + (i % 4) * 0.15).toFixed(2),
  dur: `${8 + ((i * 3.3) % 7)}s`,
  delay: `${-((i * 1.7) % 11)}s`,
}));

/**
 * A field ruled in gold. Its name sits in the field like a pencilled note and floats up, small and
 * gold, as the field is entered; a gold line draws out from the centre under the caret, and a small
 * gold tick settles at the end once the entry is good.
 */
function Field({
  label, value, onChange, type = 'text', autoComplete, inputMode, required, numeric, ok, children,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string;
  inputMode?: 'tel' | 'email' | 'text'; required?: boolean; numeric?: boolean; ok?: boolean; children?: ReactNode;
}) {
  return (
    <label className="pc-auth-field">
      <input
        className="pc-auth-input"
        type={type}
        value={value}
        placeholder=" "
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        inputMode={inputMode}
        required={required}
        style={{ fontVariantNumeric: numeric ? 'lining-nums' : undefined }}
      />
      <span className="pc-auth-label">
        {children}
        {label}
      </span>
      <span aria-hidden className="pc-auth-line" />
      {ok && (
        <span aria-hidden className="pc-auth-ok">
          ✓
        </span>
      )}
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
