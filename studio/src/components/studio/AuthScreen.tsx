'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Studio } from './state';
import { FONT_DISPLAY, fabricTex } from './helpers';
import { Binding, CoverFace, MARBLE, Room } from './SwatchBook';

/** Why the page was opened: from the menu, to order the swatch book, or for the one detail an order still needs. */
export type AuthIntent = 'account' | 'order' | 'whatsapp';

/** The static preview has no server, so no accounts: there the page shows the experience without one. */
const PREVIEW = !!process.env.NEXT_PUBLIC_BASE_PATH;
/** The code the preview accepts, since it cannot send one. */
const PREVIEW_CODE = '246810';

const INK = '#1C1917';
const UMBER = '#8A6D45';

/** A WhatsApp number with its country code: 8 to 15 digits, spaces and dashes allowed. */
export function validWhatsapp(v: string) {
  const digits = v.replace(/\D/g, '');
  return /^\+?[\d\s-]+$/.test(v.trim()) && digits.length >= 8 && digits.length <= 15;
}

type Sheet = 'wa' | 'signin' | 'create' | 'number';
type Result = { whatsapp: string | null; demo: boolean; from?: DOMRect };

/**
 * Signing in, or creating an account, as a page of the studio like any other — under the same top
 * bar and above the same tabs, in the Swatch Book's reading room: warm light pooling on cream, the
 * closed volume floating in it, and the buyer's own cuttings fanned beneath.
 *
 * The page offers four ways in, as buttons: WhatsApp (a six-digit code sent to the number), Google,
 * and signing in or creating an account with email. Each opens its form in a sheet that rises over
 * the page. Every way ends with everything an order needs, so ordering never asks again.
 *
 * With `intent="order"` it ends by handing the order on (with the buyer's WhatsApp number); with
 * `intent="whatsapp"` it asks a signed-in buyer only for the number their account lacks.
 */
export function AuthScreen({
  studio,
  intent,
  onClose,
  onDone,
  metres,
}: {
  studio: Studio;
  intent: AuthIntent;
  onClose: () => void;
  onDone: (result: Result) => void;
  /** Ordering the fabric itself rather than the swatch book: how many metres, for the page's words. */
  metres?: number;
}) {
  const { t } = studio;
  const ordering = intent !== 'account';
  const [sheet, setSheet] = useState<Sheet | null>(intent === 'whatsapp' ? 'number' : null);
  const [sheetLeaving, setSheetLeaving] = useState(false);
  const [f, setF] = useState({ name: '', company: '', city: '', whatsapp: '+91 ', email: '', password: '' });
  const [error, setError] = useState<{ text: string; n: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState<null | 'open' | 'close'>(null);
  const [note, setNote] = useState<string | null>(null);
  const [google, setGoogle] = useState(false);
  const [waReady, setWaReady] = useState(true);
  // WhatsApp: the number, then the code, then (for a number new to us) who the buyer is.
  const [wa, setWa] = useState<{ step: 'number' | 'code' | 'details'; to: string; code: string; hint: string | null; resendAt: number }>({ step: 'number', to: '', code: '', hint: null, resendAt: 0 });
  const [now, setNow] = useState(() => Date.now());
  const timers = useRef<number[]>([]);
  const bookRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => timers.current.forEach((x) => window.clearTimeout(x)), []);
  useEffect(() => {
    if (PREVIEW) return;
    let live = true;
    studio.googleReady().then((ok) => live && setGoogle(ok));
    studio.whatsappReady().then((ok) => live && setWaReady(ok));
    return () => {
      live = false;
    };
  }, [studio]);
  // The resend countdown ticks only while a code is waiting.
  useEffect(() => {
    if (sheet !== 'wa' || wa.step !== 'code') return;
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, [sheet, wa.step]);

  const set = (k: keyof typeof f) => (v: string) => {
    setF((was) => ({ ...was, [k]: v }));
    setError(null);
  };
  const fail = (text: string) => setError((e) => ({ text, n: (e?.n ?? 0) + 1 }));
  const shades = studio.pins.length;

  const fabricOrder = metres !== undefined;
  const title = intent === 'whatsapp' ? t.authWaTitle : fabricOrder ? t.authFabricTitle : ordering ? t.authOrderTitle : t.authAccountTitle;
  const sub =
    intent === 'whatsapp'
      ? t.authWaSub
      : fabricOrder
        ? t.authFabricSub.replace('{m}', (metres ?? 0).toLocaleString('en-IN'))
        : ordering
          ? t.authOrderSub.replace('{n}', String(shades))
          : t.authAccountSub;

  const openSheet = (s: Sheet) => {
    setError(null);
    setNote(null);
    setSheetLeaving(false);
    setSheet(s);
  };
  const closeSheet = (then?: () => void) => {
    setSheetLeaving(true);
    timers.current.push(
      window.setTimeout(() => {
        setSheet(null);
        setSheetLeaving(false);
        then?.();
      }, 380),
    );
  };

  /** The sheet goes, the page glides back to the book, the book opens and its light spills out, and the page hands on. */
  const finish = (result: Omit<Result, 'from'>) => {
    closeSheet(() => {
      const far = window.scrollY > 40;
      if (far) window.scrollTo({ top: 0, behavior: 'smooth' });
      const wait = far ? 450 : 0;
      timers.current.push(window.setTimeout(() => setLeaving('open'), wait));
      timers.current.push(window.setTimeout(() => onDone({ ...result, from: bookRef.current?.getBoundingClientRect() }), wait + 1250));
    });
  };
  const close = () => {
    if (leaving) return;
    setLeaving('close');
    timers.current.push(window.setTimeout(onClose, 380));
  };

  const google_ = () => {
    if (PREVIEW) return setNote(t.googlePreview);
    if (!google) return setNote(t.googleSoon);
    studio.signInGoogle(ordering);
  };

  const run = async (fn: () => Promise<void>) => {
    if (busy || leaving) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const submitEmail = () =>
    run(async () => {
      if (sheet === 'create' && !validWhatsapp(f.whatsapp)) return fail(t.waBad);
      if (sheet === 'create' && f.password.length < 8) return fail(t.pwShort);
      const whatsapp = f.whatsapp.trim();
      if (PREVIEW) {
        // No accounts here: a sign-in still needs a number to show the book going out.
        if (sheet === 'signin' && ordering) return openSheet('number');
        return finish({ whatsapp: sheet === 'signin' ? null : whatsapp, demo: true });
      }
      if (sheet === 'create') {
        const err = await studio.doRegister({ name: f.name.trim(), email: f.email, password: f.password, company: f.company.trim(), whatsapp, city: f.city.trim() });
        if (err) return fail(err);
        return finish({ whatsapp, demo: false });
      }
      const err = await studio.doSignIn(f.email.trim().toLowerCase(), f.password);
      if (err) return fail(err);
      if (!ordering) return finish({ whatsapp: null, demo: false });
      // An account made before sign-up asked for a number: ask for it now, once.
      const onFile = await studio.accountWhatsapp();
      if (!onFile) return openSheet('number');
      return finish({ whatsapp: onFile, demo: false });
    });

  const submitNumber = () =>
    run(async () => {
      if (!validWhatsapp(f.whatsapp)) return fail(t.waBad);
      const whatsapp = f.whatsapp.trim();
      if (PREVIEW) return finish({ whatsapp, demo: true });
      if (!(await studio.saveWhatsapp(whatsapp))) return fail(t.saveFailed);
      return finish({ whatsapp, demo: false });
    });

  const sendCode = () =>
    run(async () => {
      if (!validWhatsapp(f.whatsapp)) return fail(t.waBad);
      if (PREVIEW) {
        setWa({ step: 'code', to: f.whatsapp.trim(), code: '', hint: t.previewCodeNote.replace('{code}', PREVIEW_CODE), resendAt: Date.now() + 30_000 });
        return;
      }
      const r = await studio.startWhatsapp(f.whatsapp);
      if (!r.ok) return fail(r.error);
      setWa({ step: 'code', to: r.to, code: '', hint: r.devCode ? t.devCodeNote.replace('{code}', r.devCode) : null, resendAt: Date.now() + 30_000 });
    });

  const verify = (code: string, details?: { name: string; company?: string; city?: string }) =>
    run(async () => {
      if (code.length !== 6) return;
      if (PREVIEW) {
        if (code !== PREVIEW_CODE) return fail(t.badCode);
        if (!details) return setWa((w) => ({ ...w, step: 'details' }));
        return finish({ whatsapp: wa.to, demo: true });
      }
      const r = await studio.verifyWhatsapp(f.whatsapp, code, details);
      if (r === 'needs_profile') return setWa((w) => ({ ...w, step: 'details' }));
      if (r === 'bad_code') {
        setWa((w) => ({ ...w, code: '' }));
        return fail(t.badCode);
      }
      if (r === 'error') return fail(t.saveFailed);
      return finish({ whatsapp: wa.to, demo: false });
    });

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim());
  const nameFields = (
    <>
      <Field label={t.fFullName} value={f.name} onChange={set('name')} autoComplete="name" required ok={f.name.trim().length > 1} />
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16 }}>
        <Field label={t.fCompanyOnly} value={f.company} onChange={set('company')} autoComplete="organization" required ok={f.company.trim().length > 1} />
        <Field label={t.fCity} value={f.city} onChange={set('city')} autoComplete="address-level2" required ok={f.city.trim().length > 1} />
      </div>
    </>
  );
  const waField = (autoFocus?: boolean) => (
    <Field label={t.fWhatsapp} value={f.whatsapp} onChange={set('whatsapp')} type="tel" inputMode="tel" autoComplete="tel" required numeric ok={validWhatsapp(f.whatsapp)} autoFocus={autoFocus}>
      <WhatsAppGlyph />
    </Field>
  );

  // What the sheet holds: its heading, a line under it, its fields, and its button.
  let sheetTitle = '';
  let sheetSub = '';
  let body: ReactNode = null;
  let action = '';
  let onSubmit = () => {};
  if (sheet === 'signin') {
    sheetTitle = t.signInTitle;
    sheetSub = t.signInSub;
    action = ordering ? t.signInOrder : t.signInTab;
    onSubmit = submitEmail;
    body = (
      <>
        <Field label={t.fEmail} value={f.email} onChange={set('email')} type="email" autoComplete="email" required ok={emailOk} autoFocus />
        <Field label={t.fPassword} value={f.password} onChange={set('password')} type="password" autoComplete="current-password" required ok={f.password.length > 0} />
      </>
    );
  } else if (sheet === 'create') {
    sheetTitle = t.createTitle;
    sheetSub = t.createSub;
    action = ordering ? t.createOrder : t.createBtn;
    onSubmit = submitEmail;
    body = (
      <>
        {nameFields}
        {waField()}
        <Field label={t.fEmail} value={f.email} onChange={set('email')} type="email" autoComplete="email" required ok={emailOk} />
        <Field label={t.fPassword} value={f.password} onChange={set('password')} type="password" autoComplete="new-password" required ok={f.password.length >= 8} />
      </>
    );
  } else if (sheet === 'number') {
    sheetTitle = t.authWaTitle;
    sheetSub = t.authWaSub;
    action = t.saveOrder;
    onSubmit = submitNumber;
    body = waField(true);
  } else if (sheet === 'wa') {
    sheetTitle = t.continueWhatsapp;
    if (wa.step === 'number') {
      sheetSub = t.waSheetSub;
      action = t.sendCode;
      onSubmit = sendCode;
      body = waField(true);
    } else if (wa.step === 'code') {
      sheetSub = `${t.codeSentTo} ${wa.to}`;
      action = t.verifyCode;
      onSubmit = () => verify(wa.code);
      const wait = Math.max(0, Math.ceil((wa.resendAt - now) / 1000));
      body = (
        <>
          <OtpBoxes
            label={t.enterCode}
            value={wa.code}
            onChange={(v) => {
              setWa((w) => ({ ...w, code: v }));
              setError(null);
              if (v.length === 6) verify(v);
            }}
          />
          {wa.hint && <div style={{ textAlign: 'center', fontSize: 12, color: UMBER, fontFamily: FONT_DISPLAY }}>{wa.hint}</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, letterSpacing: '.12em' }}>
            <button type="button" className="pc-auth-link" onClick={() => setWa((w) => ({ ...w, step: 'number', code: '' }))}>
              {t.changeNumber}
            </button>
            <button type="button" className="pc-auth-link" disabled={wait > 0 || busy} onClick={sendCode} style={{ opacity: wait > 0 ? 0.5 : 1, fontVariantNumeric: 'lining-nums' }}>
              {wait > 0 ? t.resendIn.replace('{s}', String(wait)) : t.resend}
            </button>
          </div>
        </>
      );
    } else {
      sheetTitle = t.aboutYou;
      sheetSub = t.aboutYouSub;
      action = ordering ? t.createOrder : t.createBtn;
      onSubmit = () => {
        if (f.name.trim().length < 2) return fail(t.fFullName);
        verify(wa.code, { name: f.name.trim(), company: f.company.trim(), city: f.city.trim() });
      };
      body = nameFields;
    }
  }

  // The buyer's own cuttings, fanned under the book: what they are about to order.
  const cuttings = studio.fabrics
    .flatMap((x) => studio.pins.filter((p) => p.fabricId === x.id).map((p) => ({ x, c: x.colours.find((cc) => cc.order === p.colourOrder) })))
    .filter((k): k is { x: (typeof studio.fabrics)[number]; c: NonNullable<(typeof k)['c']> } => !!k.c);
  const fan = cuttings.slice(0, 7);
  const nFabrics = new Set(cuttings.map((k) => k.x.id)).size;
  const cover = sheet === 'create' || (sheet === 'wa' && wa.step === 'details') ? f.name.trim() || studio.userName : studio.userName;
  const opening = leaving === 'open';

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
            {fabricOrder ? t.fabricOrderBack : ordering ? t.book : t.closeWord}
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
          <div style={{ marginTop: 40, fontSize: 9.5, letterSpacing: '.46em', textTransform: 'uppercase', color: UMBER, paddingLeft: '.46em', animation: 'pcRiseIn .9s .5s cubic-bezier(.2,.8,.2,1) both' }}>Poddar Creation</div>
          <h1 style={{ margin: '12px 0 0', fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(38px,9.5vw,54px)', lineHeight: 1.04, color: INK, perspective: 400 }}>
            {title.split(' ').map((w, i, all) => (
              <span
                key={i}
                style={{ display: 'inline-block', marginRight: i < all.length - 1 ? '.24em' : 0, fontStyle: i === all.length - 1 ? 'italic' : undefined, transformOrigin: '50% 100%', animation: `pcWordIn 1s ${0.62 + i * 0.1}s cubic-bezier(.2,.8,.2,1) both` }}
              >
                {w}
              </span>
            ))}
          </h1>
          <p style={{ margin: '12px 0 0', maxWidth: 330, fontFamily: FONT_DISPLAY, fontSize: 17, lineHeight: 1.45, color: UMBER, animation: 'pcRiseIn 1s 1s cubic-bezier(.2,.8,.2,1) both' }}>{sub}</p>

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

          {/* The ways in, as buttons; each opens its form in a sheet. */}
          <div style={{ width: '100%', marginTop: 26, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button className="pc-auth-btn" onClick={() => (intent === 'whatsapp' || waReady ? openSheet(intent === 'whatsapp' ? 'number' : 'wa') : setNote(t.waSoon))} style={{ animation: 'pcFieldIn .8s 1.3s cubic-bezier(.2,.8,.2,1) both' }}>
              <WhatsAppMark />
              {intent === 'whatsapp' ? t.authWaTitle : t.continueWhatsapp}
            </button>
            {intent !== 'whatsapp' && (
              <>
                <button className="pc-auth-alt" onClick={google_} style={{ animation: 'pcFieldIn .8s 1.38s cubic-bezier(.2,.8,.2,1) both' }}>
                  <GoogleMark />
                  {t.continueGoogle}
                </button>
                {note && (
                  <div key={note} style={{ textAlign: 'center', fontFamily: FONT_DISPLAY, fontSize: 14, color: UMBER, animation: 'pcRiseIn .5s ease both' }}>
                    {note}
                  </div>
                )}
                <div className="pc-auth-or" style={{ animation: 'pcFieldIn .8s 1.46s cubic-bezier(.2,.8,.2,1) both' }}>
                  <span />
                  {t.orWord}
                  <span />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <button className="pc-auth-ghost" onClick={() => openSheet('signin')} style={{ animation: 'pcFieldIn .8s 1.54s cubic-bezier(.2,.8,.2,1) both' }}>
                    {t.signInTab}
                  </button>
                  <button className="pc-auth-ghost" onClick={() => openSheet('create')} style={{ animation: 'pcFieldIn .8s 1.6s cubic-bezier(.2,.8,.2,1) both' }}>
                    {t.createTab}
                  </button>
                </div>
              </>
            )}
          </div>
          <p style={{ margin: '24px 0 0', maxWidth: 320, fontSize: 11.5, lineHeight: 1.6, color: 'rgba(28,25,23,.45)', animation: 'pcRiseIn .9s 1.8s ease both' }}>{PREVIEW ? t.authPreview : t.authFine}</p>
        </div>
      </Room>

      {/* The form, in a sheet risen over the page. */}
      {sheet &&
        createPortal(
          <div className="pc-sheet-root" role="dialog" aria-modal="true" aria-label={sheetTitle}>
            <div className={`pc-sheet-backdrop${sheetLeaving ? ' is-leaving' : ''}`} onClick={() => !busy && closeSheet()} />
            <div className={`pc-sheet${sheetLeaving ? ' is-leaving' : ''}`}>
              <div aria-hidden className="pc-sheet-grip" />
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div key={`${sheet}-${wa.step}`} style={{ animation: 'pcRiseIn .6s .1s cubic-bezier(.2,.8,.2,1) both' }}>
                  <h2 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 30, lineHeight: 1.1, color: INK }}>{sheetTitle}</h2>
                  <p style={{ margin: '6px 0 0', fontFamily: FONT_DISPLAY, fontSize: 15.5, lineHeight: 1.4, color: UMBER, fontVariantNumeric: 'lining-nums' }}>{sheetSub}</p>
                </div>
                <button aria-label={t.closeWord} className="pc-sheet-close" onClick={() => closeSheet()} disabled={busy}>
                  <span aria-hidden>×</span>
                </button>
              </div>
              <form
                key={`${sheet}-${wa.step}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  onSubmit();
                }}
                style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'pcFieldIn .6s .15s cubic-bezier(.2,.8,.2,1) both' }}>{body}</div>
                <div key={error?.n ?? 0} role="alert" aria-live="polite" style={{ minHeight: 18, marginTop: -2, fontSize: 12.5, color: '#A5392B', textAlign: 'center', animation: error ? 'pcShake .5s cubic-bezier(.36,.07,.19,.97) both' : undefined }}>
                  {error?.text}
                </div>
                <button type="submit" disabled={busy || !!leaving} className="pc-auth-btn" style={{ animation: 'pcFieldIn .6s .25s cubic-bezier(.2,.8,.2,1) both' }}>
                  {ordering && !busy && <span aria-hidden className="pc-auth-star">✦</span>}
                  {busy ? <Dots /> : action}
                </button>
                {sheet === 'signin' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    {!PREVIEW && (
                      <a href="/forgot-password" className="pc-auth-link">
                        {t.forgotPw}
                      </a>
                    )}
                    <button type="button" className="pc-auth-link" onClick={() => openSheet('create')}>
                      {t.createTab} →
                    </button>
                  </div>
                )}
                {sheet === 'create' && (
                  <button type="button" className="pc-auth-link" style={{ alignSelf: 'center' }} onClick={() => openSheet('signin')}>
                    {t.haveAccount} →
                  </button>
                )}
              </form>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function Dots() {
  return (
    <span aria-label="…" style={{ display: 'inline-flex', gap: 6 }}>
      {[0, 1, 2].map((k) => (
        <span key={k} className="pc-auth-dot" style={{ animationDelay: `${k * 0.16}s` }} />
      ))}
    </span>
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
  label, value, onChange, type = 'text', autoComplete, inputMode, required, numeric, ok, autoFocus, children,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string;
  inputMode?: 'tel' | 'email' | 'text'; required?: boolean; numeric?: boolean; ok?: boolean; autoFocus?: boolean; children?: ReactNode;
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
        autoFocus={autoFocus}
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

/**
 * The six-digit code: one real input, drawn as six boxes. Each digit pops into its box as it is
 * typed; the box waiting for the next digit glows. Phones offer the code from the message
 * (`one-time-code`).
 */
function OtpBoxes({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="pc-otp">
      <span className="pc-otp-label">{label}</span>
      <span style={{ position: 'relative', display: 'block' }}>
        <input
          className="pc-otp-input"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          autoFocus
          aria-label={label}
        />
        <span aria-hidden className="pc-otp-boxes">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={`pc-otp-box${i === value.length ? ' is-next' : ''}${value[i] ? ' is-filled' : ''}`}>
              {value[i] && <span key={value[i] + i} className="pc-otp-digit">{value[i]}</span>}
            </span>
          ))}
        </span>
      </span>
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

function WhatsAppMark() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" style={{ flex: 'none' }}>
      <path d="M12 2.2a9.8 9.8 0 0 0-8.4 14.8L2.2 21.8l4.9-1.3A9.8 9.8 0 1 0 12 2.2Z" fill="#25D366" />
      <path d="M8.6 7.9c.3-.6.6-.6.9-.6h.6c.2 0 .4 0 .6.5l.8 1.8c.1.2.1.4 0 .6l-.5.7c-.1.2-.2.4 0 .6.6 1 1.4 1.8 2.5 2.4.2.1.4.1.6-.1l.7-.8c.2-.2.4-.2.6-.1l1.8.8c.2.1.4.2.4.4 0 .6-.2 1.3-.8 1.7-.6.4-1.6.6-2.7.2-2.3-.8-4.1-2.6-5.2-4.6-.6-1.1-.6-2.3-.3-3.5Z" fill="#fff" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden width="17" height="17" viewBox="0 0 48 48" style={{ flex: 'none' }}>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
