'use client';

import type { Studio, View } from './state';
import { WeaveMark } from './brand';
import { FONT_DISPLAY, FONT_BODY } from './helpers';

export function Nav({ studio }: { studio: Studio }) {
  const { t, view, go, compare, pins, signedIn, approved, isStaff, userName } = studio;

  const items: { k: View; label: string; count?: number; hidden?: boolean }[] = [
    { k: 'home', label: t.home },
    { k: 'showroom', label: t.showroom },
    { k: 'collection', label: t.collection },
    { k: 'colours', label: t.colours },
    { k: 'compare', label: t.compare, count: compare.length },
    { k: 'book', label: t.book, count: pins.length },
    { k: 'admin', label: t.admin, hidden: !isStaff },
  ];

  const signLabel = signedIn ? (approved || isStaff ? t.signed : userName ?? t.signed) : t.signin;

  return (
    <nav
      style={{
        position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 clamp(12px,3vw,40px)', height: 64, background: 'rgba(250,248,245,.82)',
        backdropFilter: 'blur(18px)', borderBottom: '1px solid rgba(28,25,23,.08)',
      }}
    >
      <div onClick={() => go('home')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9 }}>
        <WeaveMark />
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 600, letterSpacing: '.14em' }}>PODDAR</span>
          <span style={{ fontSize: 9, letterSpacing: '.42em', color: '#8A6D45', marginTop: 2 }}>STUDIO</span>
        </span>
      </div>
      <div
        className="pc-nav"
        style={{ display: 'flex', gap: 0, flex: 1, justifyContent: 'safe center', flexWrap: 'nowrap', minWidth: 0, overflowX: 'auto' }}
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={studio.toggleLang}
          className="pc-hv-border-ink"
          style={{
            cursor: 'pointer', background: 'none', border: '1px solid rgba(28,25,23,.15)', borderRadius: 999,
            padding: '5px 10px', fontFamily: FONT_BODY, fontSize: 11.5, color: '#1C1917', whiteSpace: 'nowrap', transition: 'border-color .25s',
          }}
        >
          {studio.lang === 'en' ? 'EN · हिं' : 'हिं · EN'}
        </button>
        <button
          onClick={() => (signedIn ? studio.doSignOut() : studio.openSignIn())}
          className="pc-hv-gold-fill-cream"
          title={signedIn ? 'Sign out' : undefined}
          style={{
            cursor: 'pointer',
            background: signedIn ? '#1C1917' : 'transparent',
            color: signedIn ? '#FAF8F5' : '#1C1917',
            border: '1px solid rgba(28,25,23,.85)', borderRadius: 999, padding: '5px 13px',
            fontFamily: FONT_BODY, fontSize: 11.5, whiteSpace: 'nowrap', transition: 'background .25s',
          }}
        >
          {signLabel}
        </button>
      </div>
    </nav>
  );
}
