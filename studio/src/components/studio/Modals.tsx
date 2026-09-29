'use client';

import { useMemo, useState } from 'react';
import type { Studio } from './state';
import { MicroscopeView } from '@/components/three/MicroscopeView';
import { FONT_DISPLAY, FONT_BODY, fabricTex, colourCss, colourFg } from './helpers';

export function UnrollTransition({ studio }: { studio: Studio }) {
  const { trans } = studio;
  if (!trans) return null;
  return (
    // The card fades away at the end of its time rather than vanishing in a frame (1.25 s, the
    // time the studio holds it for).
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, overflow: 'hidden', pointerEvents: 'none', animation: 'pcUnrollOut 1.25s linear both' }}>
      <div
        style={{
          position: 'absolute', inset: 0, background: trans.tex, transformOrigin: '50% 0',
          animation: 'unfurl .75s cubic-bezier(.6,.05,.2,1) both', boxShadow: 'inset 0 -80px 120px rgba(28,25,23,.3)',
        }}
      />
      <div style={{ position: 'absolute', left: 0, right: 0, top: '45%', textAlign: 'center', color: trans.fg, animation: 'rise .5s .25s both' }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 'clamp(30px,4vw,52px)', fontWeight: 500 }}>{trans.name}</div>
        <div style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 'clamp(15px,1.6vw,20px)', opacity: 0.8, marginTop: 6 }}>{trans.story}</div>
      </div>
    </div>
  );
}

export function ScopeModal({ studio }: { studio: Studio }) {
  const { scope, scopeP, currentFabric: f, currentColour: col, t } = studio;
  if (!scope) return null;
  const level = scopeP >= 96 ? '500×' : scopeP >= 48 ? '200×' : '100×';
  return (
    <div
      onClick={studio.closeScope}
      style={{
        position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(28,25,23,.5)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out',
      }}
    >
      <div
        style={{
          position: 'relative', width: 'min(640px,92vw)', aspectRatio: '4/3', borderRadius: 6, overflow: 'hidden',
          boxShadow: '0 40px 100px rgba(0,0,0,.4)', background: fabricTex(f, col, scopeP),
          animation: 'rise .75s cubic-bezier(.22,.8,.2,1) both',
        }}
      >
        {/* The weave is regenerated at the resolution the magnification needs, so 500× is more
            detail rather than bigger pixels. The flat texture behind stays as the fallback. */}
        <MicroscopeView
          fabric={f}
          colour={col}
          power={scopeP}
          label={`${f.name} in ${col.name} at ${level}`}
          fallback={<div style={{ position: 'absolute', inset: 0, background: fabricTex(f, col, scopeP) }} />}
        />
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(circle at 50% 45%, transparent 40%, rgba(28,25,23,.55) 95%)' }} />
        <span style={{ position: 'absolute', top: 16, left: 18, fontSize: 11, letterSpacing: '.3em', color: '#FAF8F5' }}>
          {f.name} · {col.name} · {level}
        </span>
        <span style={{ position: 'absolute', bottom: 16, right: 18, fontSize: 10, letterSpacing: '.2em', color: 'rgba(250,248,245,.7)' }}>{t.scopeNote}</span>
      </div>
    </div>
  );
}

export function SceneModal({ studio }: { studio: Studio }) {
  const { scene, currentFabric: f, currentColour: col } = studio;
  if (!scene) return null;
  return (
    <div
      onClick={studio.closeScene}
      style={{
        position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(28,25,23,.5)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out',
      }}
    >
      <div
        style={{
          position: 'relative', width: 'min(760px,94vw)', aspectRatio: '4/3', borderRadius: 6, overflow: 'hidden',
          boxShadow: '0 40px 100px rgba(0,0,0,.4)', background: scene.css, animation: 'rise .75s cubic-bezier(.22,.8,.2,1) both',
        }}
      >
        {scene.moving && (
          <div
            style={{
              position: 'absolute', top: 0, bottom: 0, left: 0, width: '30%',
              background: 'linear-gradient(100deg,transparent, rgba(255,255,255,.3), transparent)',
              animation: 'shineSweep 2.6s ease-in-out infinite',
            }}
          />
        )}
        <span style={{ position: 'absolute', top: 16, left: 18, fontSize: 11, letterSpacing: '.3em', color: scene.fg }}>
          {f.name} · {col.name} · {scene.label.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

export function QuoteModal({ studio }: { studio: Studio }) {
  const { quoteOpen, quoteSent, quoteFromBook, quoteBusy, t, currentFabric: f, currentColour: col, pins } = studio;
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [quantity, setQuantity] = useState('');
  if (!quoteOpen) return null;

  const subject = quoteFromBook
    ? pins
        .map((p) => {
          const x = studio.fab(p.fabricId);
          const c = x.colours.find((cc) => cc.order === p.colourOrder);
          return c ? `${c.name} (${x.name})` : '';
        })
        .filter(Boolean)
        .join(', ') || '—'
    : `${f.name} · ${col.name} · ${f.weight}`;

  const inputStyle = {
    border: '1px solid rgba(28,25,23,.15)', borderRadius: 6, padding: '12px 14px',
    fontFamily: FONT_BODY, fontSize: 14, background: '#fff', outlineColor: '#8A6D45',
  } as const;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(28,25,23,.45)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: 'min(440px,94vw)', background: '#FAF8F5', borderRadius: 8, padding: 32, boxShadow: '0 40px 100px rgba(0,0,0,.35)', animation: 'rise .75s cubic-bezier(.22,.8,.2,1) both' }}>
        {quoteSent ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 30, fontWeight: 500 }}>{t.quoteThanks}</div>
            <p style={{ fontWeight: 300, color: 'rgba(28,25,23,.6)', fontSize: 14, lineHeight: 1.6 }}>{t.quoteFollow}</p>
            <button
              onClick={studio.closeQuote}
              style={{ cursor: 'pointer', marginTop: 10, background: '#1C1917', color: '#FAF8F5', border: 'none', borderRadius: 999, padding: '11px 28px', fontFamily: FONT_BODY, fontSize: 12, letterSpacing: '.12em' }}
            >
              OK
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 500 }}>{quoteFromBook ? t.orderBook : t.quote}</div>
              <button onClick={studio.closeQuote} style={{ cursor: 'pointer', border: 'none', background: 'none', fontSize: 18, color: 'rgba(28,25,23,.5)' }}>
                ×
              </button>
            </div>
            <div style={{ fontSize: 13, color: 'rgba(28,25,23,.55)', margin: '4px 0 20px' }}>{subject}</div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!name || !company || !quantity || quoteBusy) return;
                studio.sendQuote({ name, company, quantity });
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <input required placeholder={t.fName} value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
              <input required placeholder={t.fCompany} value={company} onChange={(e) => setCompany(e.target.value)} style={inputStyle} />
              <input required placeholder={t.fQty} value={quantity} onChange={(e) => setQuantity(e.target.value)} style={inputStyle} />
              <button
                type="submit"
                disabled={quoteBusy}
                className="pc-hv-gold-bg"
                style={{
                  cursor: quoteBusy ? 'wait' : 'pointer', background: '#1C1917', color: '#FAF8F5', border: 'none', borderRadius: 999,
                  padding: 13, fontFamily: FONT_BODY, fontSize: 12.5, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 6, opacity: quoteBusy ? 0.7 : 1,
                }}
              >
                {quoteBusy ? '…' : t.quoteSend}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export function AiModal({ studio }: { studio: Studio }) {
  const { aiOpen, aiBusy, ai, t, fabrics } = studio;
  const match = useMemo(() => {
    if (!ai) return null;
    const x = fabrics[ai.fi % fabrics.length];
    const c = x.colours[ai.ci % x.colours.length];
    return { x, c };
  }, [ai, fabrics]);
  if (!aiOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(28,25,23,.45)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: 'min(480px,94vw)', background: '#FAF8F5', borderRadius: 8, padding: 32, boxShadow: '0 40px 100px rgba(0,0,0,.35)', animation: 'rise .75s cubic-bezier(.22,.8,.2,1) both' }}>
        {aiBusy && (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'flex-end', height: 44, marginBottom: 18 }}>
              <span style={{ width: 4, height: 26, borderRadius: 2, background: '#1C1917', animation: 'threadUp 1s ease-in-out infinite' }} />
              <span style={{ width: 4, height: 26, borderRadius: 2, background: '#8A6D45', animation: 'threadUp 1s ease-in-out -.33s infinite' }} />
              <span style={{ width: 4, height: 26, borderRadius: 2, background: '#1C1917', animation: 'threadUp 1s ease-in-out -.66s infinite' }} />
            </div>
            <div style={{ fontSize: 13, letterSpacing: '.2em', color: 'rgba(28,25,23,.6)' }}>{t.aiBusy}</div>
          </div>
        )}
        {match && ai && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 500 }}>{t.aiTitle}</div>
              <button onClick={studio.closeAi} style={{ cursor: 'pointer', border: 'none', background: 'none', fontSize: 18, color: 'rgba(28,25,23,.5)' }}>
                ×
              </button>
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 20, padding: 16, background: '#fff', border: '1px solid rgba(28,25,23,.08)', borderRadius: 6 }}>
              <div style={{ width: 74, height: 74, borderRadius: 4, background: fabricTex(match.x, match.c, 3), flex: 'none' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 21, fontWeight: 600 }}>{match.x.name}</div>
                <div style={{ fontSize: 12.5, color: 'rgba(28,25,23,.55)' }}>
                  {match.c.name} · {match.x.weight} · {match.x.width}
                </div>
                <div style={{ height: 4, background: 'rgba(28,25,23,.08)', borderRadius: 2, marginTop: 10 }}>
                  <div style={{ height: 4, width: `${ai.conf}%`, background: '#8A6D45', borderRadius: 2 }} />
                </div>
                <div style={{ fontSize: 10.5, letterSpacing: '.14em', color: '#8A6D45', marginTop: 4 }}>
                  {ai.conf}% {t.aiConf}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 11, letterSpacing: '.2em', color: 'rgba(28,25,23,.45)', margin: '18px 0 10px', textTransform: 'uppercase' }}>{t.aiAlts}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[(ai.ci + 3) % 24, (ai.ci + 9) % 24, (ai.ci + 15) % 24].map((j) => {
                const alt = match.x.colours[j % match.x.colours.length];
                return (
                  <div
                    key={j}
                    onClick={() => {
                      studio.closeAi();
                      studio.openFabric(match.x.id, j);
                    }}
                    style={{ cursor: 'pointer', flex: 1, height: 56, borderRadius: 4, background: colourCss(alt), display: 'flex', alignItems: 'flex-end', padding: 7 }}
                  >
                    <span style={{ fontSize: 10, color: colourFg(alt) }}>{alt.name}</span>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => {
                studio.closeAi();
                studio.openFabric(match.x.id, ai.ci % match.x.colours.length);
              }}
              className="pc-hv-gold-bg"
              style={{
                cursor: 'pointer', width: '100%', marginTop: 20, background: '#1C1917', color: '#FAF8F5', border: 'none', borderRadius: 999,
                padding: 13, fontFamily: FONT_BODY, fontSize: 12.5, letterSpacing: '.14em', textTransform: 'uppercase',
              }}
            >
              {t.open} →
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function SignInModal({ studio }: { studio: Studio }) {
  const { signInOpen, t } = studio;
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!signInOpen) return null;

  const inputStyle = {
    border: '1px solid rgba(28,25,23,.15)', borderRadius: 6, padding: '12px 14px',
    fontFamily: FONT_BODY, fontSize: 14, background: '#fff', outlineColor: '#8A6D45',
  } as const;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err =
      mode === 'signin'
        ? await studio.doSignIn(email, password)
        : await studio.doRegister(name, email, password, company);
    setBusy(false);
    if (err) setError(err);
    else studio.closeSignIn();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(28,25,23,.45)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: 'min(420px,94vw)', background: '#FAF8F5', borderRadius: 8, padding: 32, boxShadow: '0 40px 100px rgba(0,0,0,.35)', animation: 'rise .75s cubic-bezier(.22,.8,.2,1) both' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 500 }}>{mode === 'signin' ? t.signin : 'Create account'}</div>
          <button onClick={studio.closeSignIn} style={{ cursor: 'pointer', border: 'none', background: 'none', fontSize: 18, color: 'rgba(28,25,23,.5)' }}>
            ×
          </button>
        </div>
        <div style={{ fontSize: 13, fontWeight: 300, color: 'rgba(28,25,23,.55)', margin: '4px 0 20px' }}>
          {mode === 'signin' ? 'Approved buyers see wholesale pricing.' : 'New accounts see pricing once approved by our sales team.'}
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {mode === 'register' && (
            <>
              <input required placeholder={t.fName} value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
              <input placeholder={t.fCompany} value={company} onChange={(e) => setCompany(e.target.value)} style={inputStyle} />
            </>
          )}
          <input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
          <input required type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} minLength={mode === 'register' ? 8 : undefined} />
          {error && <div style={{ fontSize: 12.5, color: '#A33' }}>{error}</div>}
          <button
            type="submit"
            disabled={busy}
            className="pc-hv-gold-bg"
            style={{
              cursor: busy ? 'wait' : 'pointer', background: '#1C1917', color: '#FAF8F5', border: 'none', borderRadius: 999,
              padding: 13, fontFamily: FONT_BODY, fontSize: 12.5, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 6, opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? '…' : mode === 'signin' ? t.signin : 'Create account'}
          </button>
        </form>
        <button
          onClick={() => {
            setMode((m) => (m === 'signin' ? 'register' : 'signin'));
            setError(null);
          }}
          className="pc-hv-ink"
          style={{ cursor: 'pointer', marginTop: 14, background: 'none', border: 'none', fontFamily: FONT_BODY, fontSize: 12, color: 'rgba(28,25,23,.55)', letterSpacing: '.06em' }}
        >
          {mode === 'signin' ? 'New buyer? Create an account →' : '← Back to sign in'}
        </button>
        {mode === 'signin' && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(28,25,23,.08)', fontSize: 11.5, fontWeight: 300, color: 'rgba(28,25,23,.5)', lineHeight: 1.7 }}>
            Demo accounts (password <b style={{ fontWeight: 500 }}>poddar123</b>):
            <br />
            buyer@example.com · sales@poddarcreation.studio · admin@poddarcreation.studio
          </div>
        )}
      </div>
    </div>
  );
}
