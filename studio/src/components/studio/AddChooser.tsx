'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Studio } from './state';
import type { ColourRow, FabricRow } from '@/lib/types';
import { fabricTex } from './helpers';
import { CartGlyph } from './CartGlyph';

const PRESETS = [50, 100, 250, 500];
const inr = (n: number) => n.toLocaleString('en-IN');

/**
 * Where the shades go, asked in a compact sheet over the lab. A line names the fabric with its
 * shades as small pinked chips; a gold slider chooses between the cart (the fabric itself, by the
 * metre) and the swatch book (a cutting of each shade); a single ruled row gives what that choice
 * means — for the cart, the metres and the value, both in the display face on one baseline — and
 * one button acts on it. Choosing the cart sends the cuttings flying into the cart button, which
 * bumps as they land; choosing the book hands on to the lab's own "Added to your book".
 */
export function AddChooser({
  studio, fabric, colours, leaving, onBook, onCart, onClose,
}: {
  studio: Studio; fabric: FabricRow; colours: ColourRow[]; leaving: boolean; onBook: () => void; onCart: (metres: number, from: DOMRect | null) => void; onClose: () => void;
}) {
  const { t } = studio;
  const [where, setWhere] = useState<'cart' | 'book'>('cart');
  const [metres, setMetres] = useState(100);
  const sheet = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const n = colours.length;
  const inCartM = colours.reduce((s, c) => s + (studio.cart.find((l) => l.fabricId === fabric.id && l.colourOrder === c.order)?.metres ?? 0), 0);
  const inBook = colours.every((c) => studio.pins.some((p) => p.fabricId === fabric.id && p.colourOrder === c.order));
  const value = metres * n * fabric.price;
  const chips = colours.slice(0, 5);

  return createPortal(
    <div className="pc-sheet-root" role="dialog" aria-modal="true" aria-label={t.addWhere}>
      <div className={`pc-sheet-backdrop${leaving ? ' is-leaving' : ''}`} onClick={onClose} />
      <div ref={sheet} className={`pc-sheet pc-add${leaving ? ' is-leaving' : ''}`}>
        <div aria-hidden className="pc-sheet-grip" />

        {/* The fabric, its shades as small chips, and the way out. */}
        <div className="pc-add-head">
          <span aria-hidden className="pc-add-chips">
            {chips.map((c, k) => (
              <span key={c.order} className="pc-pinked" style={{ background: fabricTex(fabric, c, 3), marginLeft: k ? -8 : 0, zIndex: chips.length - k, animation: `pcFieldIn .5s ${0.1 + k * 0.05}s cubic-bezier(.2,.8,.2,1) both` }} />
            ))}
          </span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span className="pc-add-eyebrow">
              {n} {n === 1 ? t.shade : t.shades}
            </span>
            <span className="pc-add-fabric">{fabric.name}</span>
          </span>
          <button aria-label={t.closeWord} className="pc-sheet-close" onClick={onClose}>
            <span aria-hidden>×</span>
          </button>
        </div>

        <h2 className="pc-add-title">{t.addWhere}</h2>

        {/* Cart or swatch book: a gold slider moves to the one chosen. */}
        <div role="radiogroup" aria-label={t.addWhere} className="pc-add-switch">
          <span aria-hidden className="pc-add-thumb" style={{ transform: `translateX(${where === 'book' ? 100 : 0}%)` }} />
          {(['cart', 'book'] as const).map((w) => (
            <button key={w} role="radio" aria-checked={where === w} className={where === w ? 'is-on' : undefined} onClick={() => setWhere(w)}>
              {w === 'cart' ? <CartGlyph size={15} /> : <BookGlyph />}
              {w === 'cart' ? t.cartWord : t.book}
            </button>
          ))}
        </div>

        {/* What the choice means, on one ruled line of the same scale. */}
        <div key={where} className="pc-add-detail">
          {where === 'cart' ? (
            <>
              <div className="pc-add-row">
                <span className="pc-add-label">{t.metresWord}</span>
                <span className="pc-add-seg" role="radiogroup" aria-label={t.metresWord}>
                  {PRESETS.map((v) => (
                    <button key={v} role="radio" aria-checked={metres === v} className={metres === v ? 'is-on' : undefined} onClick={() => setMetres(v)}>
                      {v}
                    </button>
                  ))}
                </span>
              </div>
              <div className="pc-add-row">
                <span className="pc-add-label">
                  ₹ {inr(fabric.price)} / {t.metre}
                  {n > 1 ? ` · ${n} × ${metres} m` : ''}
                </span>
                <span key={value} className="pc-add-value">₹ {inr(value)}</span>
              </div>
              {inCartM > 0 && <div className="pc-add-note">✓ {inr(inCartM)} m {t.inCartAlready}</div>}
            </>
          ) : (
            <>
              <p className="pc-add-copy">{t.toBookSub}.</p>
              {inBook && <div className="pc-add-note">✓ {t.inBook}</div>}
            </>
          )}
        </div>

        <button
          className="pc-auth-btn"
          onClick={() => (where === 'cart' ? onCart(metres, sheet.current?.getBoundingClientRect() ?? null) : onBook())}
          style={{ marginTop: 18 }}
        >
          <span aria-hidden className="pc-auth-star">✦</span>
          {where === 'cart' ? `${t.toCart} · ₹ ${inr(value)}` : t.toBook}
        </button>
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
 * Cuttings flying into the cart: each a small pinked scrap that arcs from where it was chosen to
 * the cart button, shrinking and turning as it goes; the cart bumps as they land. Drawn as plain
 * elements moved by transform, removed when they arrive.
 */
export function flyToCart(from: DOMRect | null, backgrounds: string[]) {
  if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const target = [...document.querySelectorAll<HTMLElement>('[data-cart-target]')].find((el) => el.offsetParent !== null);
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

/** "Added to your cart", briefly, above the tab bar, with the way to the cart. */
export function CartToast({ studio, text, leaving, onView }: { studio: Studio; text: string; leaving: boolean; onView: () => void }) {
  const { t } = studio;
  return createPortal(
    <div className={`pc-cart-toast${leaving ? ' is-leaving' : ''}`} role="status">
      <span aria-hidden className="pc-cart-toast-icon">
        <CartGlyph size={16} />
      </span>
      <span style={{ minWidth: 0, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
      <button onClick={onView} className="pc-cart-toast-go">
        {t.viewCart} →
      </button>
    </div>,
    document.body,
  );
}
