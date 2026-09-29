'use client';

import { useEffect, useState } from 'react';
import type { Studio, View } from './state';
import { FONT_DISPLAY } from './helpers';

/**
 * A change of page, announced. The moment a page changes, a cream curtain carrying the new page's
 * name covers it, holds for a beat, and lifts away as the page lays in underneath — so going from
 * the Entrance into the Fabric Hall (or anywhere) reads as arriving somewhere rather than as a
 * cut. Navigation is not delayed: the curtain only ever fades out. The first page of a visit has
 * none, and a fabric has the Showroom's unroll instead.
 */
export function ViewCurtain({ studio }: { studio: Studio }) {
  const { view, t } = studio;
  const [first] = useState<View>(view);
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    if (view === first || moved) return;
    const tm = window.setTimeout(() => setMoved(true), 0);
    return () => window.clearTimeout(tm);
  }, [view, first, moved]);
  if ((view === first && !moved) || view === 'fabric') return null;
  const label: Record<View, string> = {
    home: 'Poddar Studio',
    showroom: t.hall,
    fabric: '',
    colours: t.colourWall,
    book: t.book,
    cart: t.cartWord,
    admin: t.adminTitle,
  };
  return (
    <div
      key={view}
      aria-hidden
      style={{
        position: 'fixed', inset: 0, zIndex: 190, pointerEvents: 'none', display: 'grid', placeItems: 'center',
        background: 'radial-gradient(80% 60% at 50% 40%, #FBF9F5, #EFE9DF)',
        animation: 'pcCurtain 1.5s cubic-bezier(.4,0,.2,1) both',
      }}
    >
      <div style={{ textAlign: 'center', animation: 'pcCurtainText 1.5s cubic-bezier(.22,.8,.2,1) both' }}>
        <div style={{ fontSize: 10, letterSpacing: '.5em', color: '#8A6D45', textTransform: 'uppercase' }}>Poddar Studio</div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 'clamp(30px,4.4vw,56px)', fontWeight: 500, marginTop: 10, color: '#1C1917' }}>{label[view]}</div>
        <div style={{ width: 56, height: 1, background: '#8A6D45', margin: '14px auto 0', transformOrigin: 'center', animation: 'pcCurtainRule 1.5s cubic-bezier(.22,.8,.2,1) both' }} />
      </div>
    </div>
  );
}
