'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { Studio } from './state';
import { jumpTo } from './helpers';

/** One stop on a page's tour: what to point at (the first of these on screen), and what to say. */
type Step = { at?: string; title: string; text: string };
/** A page's tour, and how to know the page is showing (a view, and something on screen). */
type Tour = { key: string; view?: string[]; when?: string; steps: Step[] };

/**
 * The tours, one to a page. The order review and the dispatch live inside the cart and the swatch
 * book, so they are known by what is on screen. The first tour that fits is taken; a stop whose
 * target is not on screen (search on a phone, a closet not yet open) is passed over.
 */
const TOURS: Tour[] = [
  {
    key: 'dispatch',
    when: '.pc-addr-list',
    steps: [
      { at: '.pc-steps', title: 'The last step', text: 'Your order is reviewed; now tell us where it goes, when you need it, and how you will pay.' },
      { at: '.pc-addr-list', title: 'Where it goes', text: 'Choose one of your saved addresses, or add a new one.' },
      { at: '.pc-when-tiles', title: 'When you need it', text: 'Pick how soon the fabric should be dispatched.' },
      { at: '.pc-pay-list', title: 'How you pay', text: 'Pay online now, securely with Razorpay, or choose to pay later once the price is confirmed.' },
      { at: '.pc-order-dock', title: 'Place the order', text: 'Your metres and total, and the button that places the order.' },
    ],
  },
  {
    key: 'review',
    when: '.pc-print',
    steps: [
      { at: '.pc-steps', title: 'Three steps', text: 'Your cart, this review, then dispatch.' },
      { at: '.pc-printer', title: 'Your order slip', text: 'It prints here, line by line: every fabric, every shade and its metres, and the estimate.' },
      { at: '.pc-tearline', title: 'Tear it off yourself', text: 'Once it has printed, take the torn corner and pull it along the dots. That takes you on to dispatch.' },
      { at: '.pc-sticky', title: 'A note for the mill', text: 'Anything we should know? Write it on the sticky note.' },
      { at: '.pc-order-dock', title: 'Your total', text: 'Metres, shades and the estimate. We confirm the final price and the dispatch date on WhatsApp.' },
    ],
  },
  {
    key: 'closet',
    view: ['colours'],
    steps: [
      { at: '.pc-closet-count', title: 'A closet for each quality', text: 'Step between closets with the arrows, or tap the name for the full list. You can also swipe the closet itself.' },
      { at: '.pc-closet.is-here .pc-closet-body', title: 'Open the doors', text: 'Tap the doors to open a closet. Inside, its shades hang on rails.' },
      { at: '.pc-closet.is-here.is-open .pc-crod-run', title: 'Look through the shades', text: 'Slide a finger along a rail to part the slips. Tap a slip to part the rail there; tap it again to see it in the Lab.' },
      { at: '.pc-closet-make', title: 'Each closet is made differently', text: 'Its wood and doors suit the cloth. Flick along a rail, or swipe, for the next closet: the doors shut first.' },
    ],
  },
  {
    key: 'fabric',
    view: ['fabric'],
    steps: [
      { at: '.pc-fab-head', title: 'This fabric', text: 'Its number, name and make. Swipe here, or tap a number, for the next fabric.' },
      { at: '.pc-lab-stage', title: 'The cloth, live', text: 'Drag to turn it. The round buttons change the light, pull the cloth, show its shine and set the wind.' },
      { at: 'button[aria-label="Light"]', title: 'Change the light', text: 'See the shade in daylight, at golden hour, in the studio or a boutique; the lights show how much it shifts.' },
      { at: '.pc-shades-mobile .pc-shadestrip, .pc-shades-desktop .pc-shadestrip', title: 'Every shade', text: 'Tap a shade to see it on the cloth. Drag along the bar above to jump through the range.' },
      { at: '.pc-book', title: 'Add to…', text: 'Put this shade in your cart, to order by the metre, or in your swatch book, for a cutting.' },
      { at: '.pc-price-call', title: 'Talk about the price', text: 'Not satisfied with the price? Call us directly.' },
    ],
  },
  {
    key: 'showroom',
    view: ['showroom'],
    steps: [
      { at: '[data-guide="rooms"]', title: 'Three rooms', text: 'The Cotton Gallery, the Rayon Room and the Silk Gallery. Tap one to walk straight there.' },
      { at: '#pc-walk', title: 'Walk the hall', text: 'Swipe or drag along the dress forms; each turns to face you, and the room changes around you as you go.' },
      { at: '#pc-walk [data-room]', title: 'Open a fabric', text: 'Tap a form to step up close: the Lab opens on that garment, with all its shades and its price.' },
    ],
  },
  {
    key: 'book',
    view: ['book'],
    steps: [
      { at: '.pc-fill-title', title: 'Your swatch book', text: 'The shades you pin, one fabric after another, bound into a book of real cuttings.' },
      { at: '[aria-roledescription="sheets"]', title: 'Slide the sheets', text: 'Slide a sheet left to open a fabric’s cuttings, and right for the next fabric.' },
      { at: '.pc-primary', title: 'Order the book', text: 'We bind a cutting of every shade and send the book to you.' },
      { at: '.pc-quiet-link', title: 'See it first', text: 'Preview your book, bound, before you order it.' },
      { at: '.pc-direct', title: 'Or order the fabric', text: 'Skip the swatch book and order the fabric itself, by the metre.' },
    ],
  },
  {
    key: 'cart',
    view: ['cart'],
    steps: [
      { at: '[aria-roledescription="sheets"]', title: 'Your fabrics', text: 'One sheet for each fabric. Tap a cutting to set its metres; slide the sheets for every fabric.' },
      { at: '.pc-sheet-set', title: 'Metres for all', text: 'Set the same metres for every shade of a fabric at once.' },
      { at: '.pc-price-call', title: 'Talk about the price', text: 'Not satisfied with the price? Call us directly.' },
      { at: '.pc-order-place', title: 'Checkout', text: 'Once every shade has its metres, check out to review your order.' },
    ],
  },
  {
    key: 'track',
    view: ['track'],
    steps: [
      { at: '.pc-fill-title', title: 'Your orders', text: 'Every order you have placed, newest first, and where each one stands.' },
      { at: '.pc-track-find', title: 'Find an order', text: 'Type its reference (PC- and six letters, on your label and WhatsApp) to find it.' },
      { at: '.pc-track-card', title: 'An order', text: 'Tap an order to open it or close it: its reference, when you placed it and the shades in it.' },
      { at: '.pc-track-line', title: 'Where it stands', text: 'Received, price confirmed, in the dye house, dispatched, delivered: the gold line runs to where it is now.' },
      { at: '.pc-track-call', title: 'Ask about it', text: 'Call us about this order; keep its reference handy.' },
    ],
  },
  {
    key: 'home',
    view: ['home'],
    steps: [
      { at: '.pc-hero-title', title: 'Welcome to Poddar Creation', text: 'A wholesale dyeing house in Surat, open online. This short tour shows you around.' },
      { at: '.pc-hero-enter', title: 'The Fabric Hall', text: 'Walk past every quality made up on its dress form, from cotton to silk.' },
      { at: '.pc-hero-link', title: 'The Colour Closet', text: 'Every shade of every quality, hung in a closet of its own.' },
      { at: '.pc-hero-search', title: 'Search', text: 'Search by name, describe what you need, or search by image.' },
      { at: '.pc-bottomnav-pill, .pc-hdrnav', title: 'Find your way', text: 'The Showroom, the Closet, your Swatch Book and your Cart are always here.' },
    ],
  },
];
const HELP: Step = { at: '.pc-guide-btn', title: 'Help, on every page', text: 'Tap ⓘ on any page for a tour of it.' };

/** The first element matching any of the selectors that is on screen (has a size). */
function find(at?: string): HTMLElement | null {
  if (!at) return null;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(at))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') return el;
  }
  return null;
}

/** Whether an element stays put on screen as the page scrolls (fixed, or inside something fixed). */
function pinned(el: HTMLElement) {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    if (getComputedStyle(n).position === 'fixed') return true;
  }
  return false;
}

/**
 * Help, on every page: a very small ⓘ, fixed under the account button, that stays in place as
 * the page scrolls. A tap starts a short tour of the page in view: each stop dims the page but for
 * what it is about, rings that in gold, and says what it is and how to use it in a small card, with
 * Back, Next and Done. The page scrolls to each stop. Escape or a tap on the dimmed page ends it;
 * the arrow keys step through it.
 */
export function Guide({ studio }: { studio: Studio }) {
  const btn = useRef<HTMLButtonElement | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [at, setAt] = useState(0);

  // The button sits centred under the account button, wherever the header puts it.
  useLayoutEffect(() => {
    const place = () => {
      const acc = document.querySelector<HTMLElement>('.pc-hdricon');
      const b = btn.current;
      if (!acc || !b) return;
      const r = acc.getBoundingClientRect();
      b.style.left = `${Math.round(r.left + r.width / 2 - b.offsetWidth / 2)}px`;
      b.style.top = `${Math.round(Math.max(r.bottom, 0) + 10)}px`;
    };
    place();
    window.addEventListener('resize', place);
    const tm = window.setTimeout(place, 400);
    return () => {
      window.removeEventListener('resize', place);
      window.clearTimeout(tm);
    };
  }, [studio.view, studio.signInOpen]);

  const start = () => {
    const tour = TOURS.find((tr) => (tr.when ? !!document.querySelector(tr.when) : true) && (!tr.view || tr.view.includes(studio.view))) ?? null;
    const list = [...(tour?.steps ?? []), HELP].filter((s) => !s.at || find(s.at));
    setSteps(list);
    setAt(0);
  };
  const end = useCallback(() => setSteps(null), []);
  const go = useCallback(
    (d: 1 | -1) => {
      if (!steps) return;
      const n = at + d;
      if (n < 0) return;
      if (n >= steps.length) return end();
      setAt(n);
    },
    [steps, at, end],
  );

  // Leaving the page ends its tour.
  useEffect(() => {
    const tm = window.setTimeout(() => setSteps(null), 0);
    return () => window.clearTimeout(tm);
  }, [studio.view]);

  // Keys: Escape ends, the arrows step.
  useEffect(() => {
    if (!steps) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') end();
      if (e.key === 'ArrowRight' || e.key === 'Enter') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [steps, go, end]);

  // Each stop: the page brought round to it, then the ring and the card kept on it a frame at a
  // time (it may move as the page settles).
  const ring = useRef<HTMLDivElement | null>(null);
  const card = useRef<HTMLDivElement | null>(null);
  const step = steps?.[at];
  useEffect(() => {
    if (!step) return;
    const el = find(step.at);
    if (el && !pinned(el)) {
      const r = el.getBoundingClientRect();
      const fits = r.top >= 90 && r.bottom <= window.innerHeight - 200;
      if (!fits) {
        const quick = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const y = window.scrollY + r.top - Math.max(90, (window.innerHeight - Math.min(r.height, window.innerHeight * 0.5)) / 2 - 60);
        if (quick) jumpTo(Math.max(0, y));
        else window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      }
    }
    let raf = 0;
    const frame = () => {
      const target = find(step.at);
      const rg = ring.current;
      const cd = card.current;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (rg && cd) {
        const cw = cd.offsetWidth;
        const ch = cd.offsetHeight;
        if (target) {
          const r = target.getBoundingClientRect();
          const pad = 8;
          const top = Math.max(4, r.top - pad);
          const bottom = Math.min(vh - 4, r.bottom + pad);
          const left = Math.max(4, r.left - pad);
          const right = Math.min(vw - 4, r.right + pad);
          rg.style.transform = `translate3d(${left}px, ${top}px, 0)`;
          rg.style.width = `${Math.max(0, right - left)}px`;
          rg.style.height = `${Math.max(0, bottom - top)}px`;
          rg.style.opacity = '1';
          // The card below what it is about, or above it, or over its foot when neither has room.
          const x = Math.max(12, Math.min(vw - cw - 12, (left + right) / 2 - cw / 2));
          let y: number;
          let below = true;
          if (bottom + 14 + ch <= vh - 12) y = bottom + 14;
          else if (top - 14 - ch >= 12) {
            y = top - 14 - ch;
            below = false;
          } else y = Math.max(12, vh - ch - 110);
          cd.style.transform = `translate3d(${x}px, ${y}px, 0)`;
          cd.dataset.side = below ? 'below' : 'above';
          const arrow = Math.max(18, Math.min(cw - 18, (left + right) / 2 - x));
          cd.style.setProperty('--arrow', `${arrow}px`);
        } else {
          // A stop with nothing to point at: the card in the middle, the page dimmed.
          rg.style.opacity = '0';
          cd.style.transform = `translate3d(${(vw - cw) / 2}px, ${(vh - ch) / 2}px, 0)`;
          cd.dataset.side = 'none';
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [step]);

  return (
    <>
      <button ref={btn} className="pc-guide-btn" aria-label="Help: a tour of this page" title="Help: a tour of this page" onClick={start}>
        <i>i</i>
      </button>
      {steps &&
        step &&
        createPortal(
          <div className="pc-guide" role="dialog" aria-modal="true" aria-label={step.title}>
            <div className="pc-guide-veil" onClick={end} />
            <div ref={ring} className="pc-guide-ring" />
            <div ref={card} key={at} className="pc-guide-card" style={{ '--arrow': '50%' } as CSSProperties}>
              <div className="pc-guide-count">
                {String(at + 1).padStart(2, '0')} <span>/ {String(steps.length).padStart(2, '0')}</span>
              </div>
              <button className="pc-guide-close" aria-label="Close" onClick={end}>
                <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
              <div className="pc-guide-title">{step.title}</div>
              <p className="pc-guide-text">{step.text}</p>
              <div className="pc-guide-dots" aria-hidden>
                {steps.map((_, i) => (
                  <i key={i} className={i === at ? 'is-on' : i < at ? 'is-done' : undefined} />
                ))}
              </div>
              <div className="pc-guide-ways">
                {at > 0 ? (
                  <button className="pc-guide-back" onClick={() => go(-1)}>
                    Back
                  </button>
                ) : (
                  <button className="pc-guide-back" onClick={end}>
                    Skip
                  </button>
                )}
                <button className="pc-guide-next" onClick={() => go(1)}>
                  {at === steps.length - 1 ? 'Done' : 'Next'}
                  {at < steps.length - 1 && (
                    <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
