'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { Studio } from './state';
import type { ColourRow, FabricRow } from '@/lib/types';
import { FONT_DISPLAY, fabricTex } from './helpers';
import { CartGlyph } from './CartGlyph';

const INK = '#1C1917';
const UMBER = '#8A6D45';
const PRESETS = [50, 100, 250, 500];
const inr = (n: number) => n.toLocaleString('en-IN');

/**
 * Where the shades go: asked in a sheet that rises over the lab. Two cards, one above the other —
 * the cart, to order the fabric itself by the metre (with the metres chosen right there and the
 * line's value), and the swatch book, for a cutting of each shade. Choosing the cart sends the
 * cuttings flying into the cart in the tab bar (or the header on a desktop), which bumps as they
 * land; choosing the book hands on to the lab's own "Added to your book".
 */
export function AddChooser({
  studio, fabric, colours, leaving, onBook, onCart, onClose,
}: {
  studio: Studio; fabric: FabricRow; colours: ColourRow[]; leaving: boolean; onBook: () => void; onCart: (metres: number, from: DOMRect | null) => void; onClose: () => void;
}) {
  const { t } = studio;
  const [metres, setMetres] = useState(100);
  const cartCard = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const inCart = colours.every((c) => studio.cart.some((l) => l.fabricId === fabric.id && l.colourOrder === c.order));
  const inBook = colours.every((c) => studio.pins.some((p) => p.fabricId === fabric.id && p.colourOrder === c.order));
  const fan = colours.slice(0, 6);

  return createPortal(
    <div className="pc-sheet-root" role="dialog" aria-modal="true" aria-label={t.addWhere}>
      <div className={`pc-sheet-backdrop${leaving ? ' is-leaving' : ''}`} onClick={onClose} />
      <div className={`pc-sheet${leaving ? ' is-leaving' : ''}`}>
        <div aria-hidden className="pc-sheet-grip" />
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ animation: 'pcRiseIn .6s .1s cubic-bezier(.2,.8,.2,1) both' }}>
            <div style={{ fontSize: 9, letterSpacing: '.36em', textTransform: 'uppercase', color: UMBER }}>
              {fabric.name} · {colours.length} {colours.length === 1 ? t.shade : t.shades}
            </div>
            <h2 style={{ margin: '6px 0 0', fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 30, lineHeight: 1.1, color: INK }}>{t.addWhere}</h2>
            <p style={{ margin: '6px 0 0', fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 15.5, lineHeight: 1.4, color: UMBER }}>{t.addWhereSub}</p>
          </div>
          <button aria-label={t.closeWord} className="pc-sheet-close" onClick={onClose}>
            <span aria-hidden>×</span>
          </button>
        </div>

        {/* The shades in question, fanned. */}
        <div aria-hidden style={{ display: 'flex', justifyContent: 'center', height: 50, marginTop: 16 }}>
          {fan.map((c, k) => {
            const mid = (fan.length - 1) / 2;
            return (
              <span key={c.order} style={{ width: 34, height: 44, marginLeft: k ? -10 : 0, animation: `pcFanIn .7s ${0.15 + k * 0.05}s cubic-bezier(.2,.8,.2,1) both`, ['--r' as string]: `${(k - mid) * 8}deg`, ['--y' as string]: `${Math.abs(k - mid) * 3}px` } as CSSProperties}>
                <span className="pc-pinked" style={{ display: 'block', width: '100%', height: '100%', background: fabricTex(fabric, c, 3), boxShadow: '0 3px 6px rgba(40,26,12,.25)' }} />
              </span>
            );
          })}
        </div>

        {/* The cart: the fabric itself, by the metre. */}
        <div ref={cartCard} className="pc-choice is-cart" style={{ marginTop: 18, animation: 'pcFieldIn .6s .2s cubic-bezier(.2,.8,.2,1) both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span aria-hidden className="pc-choice-icon">
              <CartGlyph size={22} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, lineHeight: 1.1 }}>{t.toCart}</div>
              <div style={{ marginTop: 2, fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(250,248,245,.6)' }}>{t.toCartSub}</div>
            </div>
            <div style={{ textAlign: 'right', flex: 'none', fontFamily: FONT_DISPLAY, fontVariantNumeric: 'lining-nums' }}>
              <div style={{ fontSize: 20, color: '#E9CF8F' }}>₹ {inr(fabric.price)}</div>
              <div style={{ fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(250,248,245,.55)', fontFamily: 'inherit' }}>{t.perMetre}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 14 }}>
            {PRESETS.map((v) => (
              <button key={v} className={`pc-choice-chip${metres === v ? ' is-on' : ''}`} onClick={() => setMetres(v)}>
                {v} m
              </button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 10, letterSpacing: '.12em', color: 'rgba(250,248,245,.6)', fontVariantNumeric: 'lining-nums' }}>
              {colours.length > 1 ? `${colours.length} × ` : ''}
              {metres} m
            </span>
          </div>
          <button className="pc-choice-go" onClick={() => onCart(metres, cartCard.current?.getBoundingClientRect() ?? null)}>
            <span key={metres} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, animation: 'pcTick .35s cubic-bezier(.2,1.4,.4,1)' }}>
              <span aria-hidden>✦</span>
              {inCart ? t.inCart : t.toCart} · ₹ {inr(metres * colours.length * fabric.price)}
            </span>
          </button>
        </div>

        {/* Or the swatch book: a cutting of each shade. */}
        <button className="pc-choice is-book" onClick={onBook} style={{ marginTop: 12, animation: 'pcFieldIn .6s .3s cubic-bezier(.2,.8,.2,1) both' }}>
          <span aria-hidden className="pc-choice-icon is-light">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
              <path d="M5 17h14" />
            </svg>
          </span>
          <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
            <span style={{ display: 'block', fontFamily: FONT_DISPLAY, fontSize: 22, lineHeight: 1.1, color: INK }}>{inBook ? t.inBook : t.toBook}</span>
            <span style={{ display: 'block', marginTop: 2, fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(28,25,23,.5)' }}>{t.toBookSub}</span>
          </span>
          <span aria-hidden className="pc-choice-arrow">→</span>
        </button>
      </div>
    </div>,
    document.body,
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
