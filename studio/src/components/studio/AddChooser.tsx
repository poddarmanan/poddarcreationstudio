'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Studio } from './state';
import type { ColourRow, FabricRow } from '@/lib/types';
import { fabricTex } from './helpers';
import { CartGlyph } from './CartGlyph';

const inr = (n: number) => n.toLocaleString('en-IN');

/**
 * Where the shades go, asked in a compact sheet over the lab. A line names the fabric with its
 * shades as small pinked chips; a gold slider chooses between the cart (the fabric itself, by the
 * metre) and the swatch book (a cutting of each shade); a single ruled row gives what that choice
 * means — for the cart, the price by the metre and that the metres are chosen in the cart, so
 * nothing is assumed — and one button acts on it. Either way the cuttings fly into the tab they were added to — the cart or
 * the swatch book — which bumps as they land.
 */
export function AddChooser({
  studio, fabric, colours, leaving, onBook, onCart, onClose,
}: {
  studio: Studio; fabric: FabricRow; colours: ColourRow[]; leaving: boolean; onBook: (from: DOMRect | null) => void; onCart: (from: DOMRect | null) => void; onClose: () => void;
}) {
  const { t } = studio;
  const [where, setWhere] = useState<'cart' | 'book'>('cart');
  const sheet = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const n = colours.length;
  const inCartM = colours.reduce((s, c) => s + (studio.cart.find((l) => l.fabricId === fabric.id && l.colourOrder === c.order)?.metres ?? 0), 0);
  const inBook = colours.every((c) => studio.pins.some((p) => p.fabricId === fabric.id && p.colourOrder === c.order));
  const chips = colours.slice(0, 5);
  const already = where === 'cart' ? inCartM > 0 : inBook;

  return createPortal(
    <div className="pc-sheet-root" role="dialog" aria-modal="true" aria-label={t.addWhere}>
      <div className={`pc-sheet-backdrop${leaving ? ' is-leaving' : ''}`} onClick={onClose} />
      <div ref={sheet} className={`pc-sheet pc-add${leaving ? ' is-leaving' : ''}`}>
        <div aria-hidden className="pc-sheet-grip" />

        <button aria-label={t.closeWord} className="pc-sheet-close pc-add-close" onClick={onClose}>
          <span aria-hidden>×</span>
        </button>

        {/* The shades as pinned cuttings, fanned; the fabric and the shades by name beneath. */}
        <div className="pc-add-hero">
          <span aria-hidden className="pc-add-fan">
            {chips.map((c, k) => {
              const mid = (chips.length - 1) / 2;
              return (
                <span
                  key={c.order}
                  className="pc-pinked"
                  style={{
                    background: `linear-gradient(155deg, rgba(255,255,255,.22), transparent 40%, rgba(0,0,0,.14)), ${fabricTex(fabric, c, 3)}`,
                    zIndex: 10 - Math.round(Math.abs(k - mid)),
                    ['--fan' as string]: `translate(${(k - mid) * 14}px, ${Math.abs(k - mid) * 3}px) rotate(${(k - mid) * 9}deg)`,
                    animationDelay: `${0.05 + k * 0.06}s`,
                  }}
                />
              );
            })}
          </span>
          <span className="pc-add-eyebrow">{fabric.name}</span>
          <span className="pc-add-fabric">{colours.length > 2 ? `${n} ${t.shades}` : colours.map((c) => c.name).join(' · ')}</span>
        </div>

        <div aria-hidden className="pc-add-rule">
          <span />
          <i />
          <span />
        </div>
        <h2 className="pc-add-title">{t.addWhere}</h2>

        {/* Two tiles of paper: the chosen one turns to ink edged in gold, a tick at its corner. */}
        <div role="radiogroup" aria-label={t.addWhere} className="pc-add-tiles">
          {(['cart', 'book'] as const).map((w) => (
            <button key={w} role="radio" aria-checked={where === w} className={`pc-add-tile${where === w ? ' is-on' : ''}`} onClick={() => setWhere(w)}>
              <span aria-hidden className="pc-add-tick">✓</span>
              <span aria-hidden className="pc-add-icon">{w === 'cart' ? <CartGlyph size={15} /> : <BookGlyph />}</span>
              <span className="pc-add-tile-name">{w === 'cart' ? t.cartWord : t.book}</span>
              <span className="pc-add-tile-sub">{w === 'cart' ? t.tileCart : t.tileBook}</span>
            </button>
          ))}
        </div>

        {/* What the choice means, in a line. */}
        <div key={where} className="pc-add-detail">
          {where === 'cart' ? (
            <>
              <span>
                ₹ {inr(fabric.price)} / {t.metre}
              </span>
              <i aria-hidden>✦</i>
              <span>{t.chooseInCartLong}</span>
            </>
          ) : (
            <span>{t.bookLine}</span>
          )}
        </div>
        {/* The action; when the shade is there already, the button says so, in the house's
            "added" beige with a tick, and takes the buyer to it instead. */}
        {already ? (
          <button
            className="pc-auth-btn is-done"
            onClick={() => {
              onClose();
              studio.go(where === 'cart' ? 'cart' : 'book');
            }}
            style={{ marginTop: 16 }}
          >
            <span aria-hidden className="pc-auth-tick">✓</span>
            {where === 'cart' ? `${inr(inCartM)} m ${t.inCartAlready}` : t.inBook}
          </button>
        ) : (
          <button
            className="pc-auth-btn"
            onClick={() => (where === 'cart' ? onCart : onBook)(sheet.current?.getBoundingClientRect() ?? null)}
            style={{ marginTop: 16 }}
          >
            <span aria-hidden className="pc-auth-star">✦</span>
            {where === 'cart' ? t.toCart : t.toBook}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

function BookGlyph() {
  return (
    <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
      <path d="M5 17h14" />
    </svg>
  );
}

/**
 * Cuttings flying into the cart or the swatch book: each a small pinked scrap that arcs from where
 * it was chosen to that tab, shrinking and turning as it goes; the tab bumps as they land. Drawn as
 * plain elements moved by transform, removed when they arrive.
 */
export function flyInto(kind: 'cart' | 'book', from: DOMRect | null, backgrounds: string[]) {
  if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const target = [...document.querySelectorAll<HTMLElement>(`[data-${kind}-target]`)].find((el) => el.offsetParent !== null);
  if (!target) return;
  const to = target.getBoundingClientRect();
  const sx = from ? from.left + from.width / 2 : window.innerWidth / 2;
  const sy = from ? from.top + from.height / 3 : window.innerHeight / 2;
  const tx = to.left + to.width / 2;
  const ty = to.top + to.height / 2;
  backgrounds.slice(0, 6).forEach((bg, i) => {
    const el = document.createElement('span');
    el.className = 'pc-pinked';
    Object.assign(el.style, {
      position: 'fixed', left: `${sx - 22}px`, top: `${sy - 28}px`, width: '44px', height: '56px', zIndex: '150', pointerEvents: 'none',
      background: bg, boxShadow: '0 6px 14px rgba(40,26,12,.35)', willChange: 'transform, opacity',
    });
    document.body.appendChild(el);
    const dx = tx - sx + (i - 2) * 3;
    const dy = ty - sy;
    const lift = -Math.min(220, Math.abs(dy) * 0.45 + 90);
    const anim = el.animate(
      [
        { transform: `translate(${(i - 2.5) * 14}px, 0) rotate(${(i - 2.5) * 8}deg) scale(1)`, opacity: 0 },
        { transform: `translate(${(i - 2.5) * 14}px, -18px) rotate(${(i - 2.5) * 8}deg) scale(1.05)`, opacity: 1, offset: 0.12 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 + lift}px) rotate(${180 + i * 30}deg) scale(.75)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${360 + i * 40}deg) scale(.18)`, opacity: 0.2 },
      ],
      { duration: 900, delay: i * 70, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'both' },
    );
    anim.onfinish = () => el.remove();
  });
}

/**
 * "Added to your cart" (or book), briefly: a small cream note on the studio's paper with a gold
 * hairline, its shades as pinked chips, what was added in two short lines, and the way there. On a
 * phone it stands just above the tab it was added to, a small point aimed at it; on a wide screen
 * it sits under that item in the top bar.
 */
export function AddedToast({
  studio, kind, eyebrow, text, swatches, leaving, onView,
}: {
  studio: Studio; kind: 'cart' | 'book'; eyebrow: string; text: string; swatches: string[]; leaving: boolean; onView: () => void;
}) {
  const { t } = studio;
  const card = useRef<HTMLDivElement | null>(null);
  const [place, setPlace] = useState<{ left: number; caret: number; top?: number; bottom?: number; up: boolean } | null>(null);
  useLayoutEffect(() => {
    const target = [...document.querySelectorAll<HTMLElement>(`[data-${kind}-target]`)].find((el) => el.offsetParent !== null);
    const el = card.current;
    if (!el) return;
    const w = el.offsetWidth;
    const vw = window.innerWidth;
    const r = target?.getBoundingClientRect();
    const cx = r ? r.left + r.width / 2 : vw / 2;
    const left = Math.max(12, Math.min(vw - w - 12, cx - w / 2));
    const caret = Math.max(18, Math.min(w - 18, cx - left));
    const up = !!r && r.top < window.innerHeight / 2;
    setPlace(up ? { left, caret, top: (r?.bottom ?? 0) + 12, up } : { left, caret, bottom: window.innerHeight - (r?.top ?? window.innerHeight - 24) + 12, up });
  }, [kind]);
  return createPortal(
    <div
      ref={card}
      role="status"
      className={`pc-added${place?.up ? ' is-up' : ''}${leaving ? ' is-leaving' : ''}`}
      style={{ left: place?.left ?? 0, top: place?.top, bottom: place?.bottom, visibility: place ? 'visible' : 'hidden', ['--caret' as string]: `${place?.caret ?? 0}px` }}
    >
      <span aria-hidden className="pc-added-chips">
        {swatches.slice(0, 3).map((bg, k) => (
          <span key={k} className="pc-pinked" style={{ background: bg, marginLeft: k ? -9 : 0, zIndex: 3 - k, transform: `rotate(${(k - 1) * 7}deg)` }} />
        ))}
      </span>
      <span className="pc-added-text">
        <span className="pc-added-eyebrow">✓ {eyebrow}</span>
        <span className="pc-added-line">{text}</span>
      </span>
      <button onClick={onView} className="pc-added-go">
        {kind === 'cart' ? t.viewCart : t.viewBook}
        <span aria-hidden> →</span>
      </button>
    </div>,
    document.body,
  );
}
