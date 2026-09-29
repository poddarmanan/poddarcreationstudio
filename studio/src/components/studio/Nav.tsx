'use client';

import { useEffect, useState } from 'react';
import { usePresence } from './motion';
import type { Studio, View } from './state';
import { WeaveMark } from './brand';
import { FONT_DISPLAY, FONT_BODY } from './helpers';

export function Nav({ studio }: { studio: Studio }) {
  const { t, view, go, pins, signedIn, approved, isStaff, userName } = studio;

  const items: { k: View; label: string; count?: number; hidden?: boolean }[] = [
    { k: 'home', label: t.home },
    { k: 'showroom', label: t.showroom },
    { k: 'colours', label: t.colours },
    { k: 'book', label: t.book, count: pins.length },
    { k: 'admin', label: t.admin, hidden: !isStaff },
  ];

  const signLabel = signedIn ? (approved || isStaff ? t.signed : userName ?? t.signed) : t.signin;

  return (
    <nav
      className="pc-topbar"
      style={{
        position: 'sticky', top: 0, zIndex: 50, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px',
        // Near-opaque rather than frosted: a backdrop blur is recomputed on every scrolled frame.
        background: 'rgba(250,248,245,.97)',
        borderBottom: '1px solid rgba(28,25,23,.08)',
      }}
    >
      <div onClick={() => go('home')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9, flex: 'none' }}>
        <WeaveMark />
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 600, letterSpacing: '.14em' }}>PODDAR</span>
          <span style={{ fontSize: 9, letterSpacing: '.42em', color: '#8A6D45', marginTop: 2 }}>STUDIO</span>
        </span>
      </div>
      <div
        className="pc-nav pc-hdrnav"
        style={{ gap: 0, justifyContent: 'safe center', flexWrap: 'nowrap', minWidth: 0, overflowX: 'auto' }}
      >
        {items.filter((n) => !n.hidden).map((n) => (
          <button
            key={n.k}
            onClick={() => go(n.k)}
            className="pc-hv-ink"
            style={{
              cursor: 'pointer', border: 'none',
              background: view === n.k ? 'rgba(28,25,23,.07)' : 'transparent',
              color: view === n.k ? '#1C1917' : 'rgba(28,25,23,.55)',
              fontFamily: FONT_BODY, fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase',
              padding: '6px 8px', borderRadius: 999, whiteSpace: 'nowrap', transition: 'color .25s,background .25s',
            }}
          >
            {n.label}
            {n.count ? <span style={{ color: '#8A6D45', marginLeft: 4, fontSize: 10 }}>{n.count}</span> : null}
          </button>
        ))}
      </div>
      {/* The account, alone at the far right: the user icon opens a small menu with sign in or
          out and the language. There is no search in the header. */}
      <div style={{ display: 'flex', alignItems: 'center', flex: 'none', marginLeft: 'auto' }}>
        <UserMenu studio={studio} signLabel={signLabel} />
      </div>
    </nav>
  );
}

function UserMenu({ studio, signLabel }: { studio: Studio; signLabel: string }) {
  const { signedIn, lang } = studio;
  const [open, setOpen] = useState(false);
  const menu = usePresence(open, 420);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const item = { cursor: 'pointer', width: '100%', textAlign: 'left' as const, border: 'none', background: 'none', padding: '10px 12px', borderRadius: 10, fontFamily: FONT_BODY, fontSize: 12.5, color: '#1C1917' };
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        className="pc-hv-gold-fill-cream pc-hdricon"
        title={signLabel}
        aria-label="Account and language"
        aria-expanded={open}
        aria-haspopup="menu"
        style={{
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
          background: signedIn || open ? '#1C1917' : 'transparent',
          color: signedIn || open ? '#FAF8F5' : '#1C1917',
          border: '1px solid rgba(28,25,23,.85)', borderRadius: '50%', transition: 'background .25s,color .25s',
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </svg>
      </button>
      {menu.shown && (
        <>
          {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 59 }} />}
          <div
            role="menu"
            aria-label="Account and language"
            style={{
              position: 'absolute', right: 0, top: 'calc(100% + 10px)', zIndex: 60, width: 220, padding: 6, borderRadius: 16,
              background: 'rgba(250,248,245,.97)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(28,25,23,.08)', boxShadow: '0 18px 44px rgba(28,25,23,.18)',
              transformOrigin: 'top right', animation: menu.leaving ? 'pcMenuOut .4s ease both' : 'pcMenuIn .7s cubic-bezier(.22,.8,.2,1) both',
            }}
          >
            {signedIn && (
              <div style={{ padding: '8px 12px 6px', fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#8A6D45' }}>{signLabel}</div>
            )}
            <button
              role="menuitem"
              className="pc-hv-ink"
              onClick={() => {
                setOpen(false);
                if (signedIn) studio.doSignOut();
                else studio.openSignIn();
              }}
              style={item}
            >
              {signedIn ? 'Sign out' : studio.t.signin}
            </button>
            <div style={{ height: 1, background: 'rgba(28,25,23,.08)', margin: '4px 8px' }} />
            <div style={{ padding: '8px 12px 6px', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(28,25,23,.45)' }}>Language · भाषा</div>
            <div role="group" aria-label="Language" style={{ display: 'flex', gap: 4, padding: '2px 6px 6px' }}>
              {(['en', 'hi'] as const).map((l) => (
                <button
                  key={l}
                  role="menuitemradio"
                  aria-checked={lang === l}
                  onClick={() => {
                    if (lang !== l) studio.toggleLang();
                  }}
                  style={{
                    cursor: 'pointer', flex: 1, borderRadius: 999, padding: '8px 0', fontFamily: FONT_BODY, fontSize: 12,
                    border: lang === l ? '1px solid #1C1917' : '1px solid rgba(28,25,23,.15)',
                    background: lang === l ? '#1C1917' : 'transparent', color: lang === l ? '#FAF8F5' : '#1C1917',
                    transition: 'background .3s ease, color .3s ease',
                  }}
                >
                  {l === 'en' ? 'English' : 'हिंदी'}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
