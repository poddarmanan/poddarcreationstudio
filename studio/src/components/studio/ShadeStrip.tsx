'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { ColourRow } from '@/lib/types';
import { colourCss, colourFg, spectrum } from './helpers';

/**
 * A quality's shades, kept beside the cloth: a few rows of swatches in one run of colour that
 * scroll sideways, over a thin bar of the whole range. The bar shows which stretch of the range is
 * in view and where the shade on the stage sits; a touch or a drag on it sends the swatches there.
 * The shade on the stage is kept in view. So a buyer picks a shade and sees it on the cloth
 * without scrolling the page away from the stage and back.
 */
export function ShadeStrip({
  colours, current, picking, picked, onPick,
}: {
  colours: ColourRow[];
  current: number;
  picking: boolean;
  picked: number[];
  onPick: (j: number) => void;
}) {
  const order = useMemo(() => colours.map((c, j) => ({ c, j })).sort((a, b) => spectrum(a.c, b.c)), [colours]);
  const strip = useRef<HTMLDivElement | null>(null);
  const bar = useRef<HTMLDivElement | null>(null);
  const win = useRef<HTMLSpanElement | null>(null);

  // The bar's window follows the swatches as they scroll.
  useEffect(() => {
    const el = strip.current;
    const w = win.current;
    if (!el || !w) return;
    let raf = 0;
    const paint = () => {
      raf = 0;
      const total = el.scrollWidth || 1;
      w.style.left = `${(el.scrollLeft / total) * 100}%`;
      w.style.width = `${Math.min(100, (el.clientWidth / total) * 100)}%`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };
    paint();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  // The shade on the stage is kept in view: at once when the strip first shows, gently after.
  const first = useRef(true);
  useEffect(() => {
    const el = strip.current;
    const on = el?.querySelector<HTMLElement>(`[data-j="${current}"]`);
    if (!el || !on) return;
    const left = on.offsetLeft - el.offsetLeft;
    const inView = left >= el.scrollLeft && left + on.offsetWidth <= el.scrollLeft + el.clientWidth;
    if (!inView || first.current) {
      const quick = first.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const x = left - (el.clientWidth - on.offsetWidth) / 2;
      if (quick) el.scrollLeft = x;
      else el.scrollTo({ left: x, behavior: 'smooth' });
    }
    first.current = false;
  }, [current]);

  // A touch on the bar sends the swatches to that stretch; a drag scrubs through them.
  useEffect(() => {
    const b = bar.current;
    const el = strip.current;
    if (!b || !el) return;
    let id = -1;
    const to = (clientX: number, smooth: boolean) => {
      const r = b.getBoundingClientRect();
      const k = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      const x = k * el.scrollWidth - el.clientWidth / 2;
      if (smooth) el.scrollTo({ left: x, behavior: 'smooth' });
      else el.scrollLeft = x;
    };
    const down = (e: PointerEvent) => {
      id = e.pointerId;
      b.setPointerCapture(e.pointerId);
      to(e.clientX, true);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId === id) to(e.clientX, false);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === id) id = -1;
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointermove', move);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    return () => {
      b.removeEventListener('pointerdown', down);
      b.removeEventListener('pointermove', move);
      b.removeEventListener('pointerup', up);
      b.removeEventListener('pointercancel', up);
    };
  }, []);

  const at = order.findIndex((o) => o.j === current);
  return (
    <div className="pc-shadestrip">
      <div ref={bar} className="pc-shadebar" aria-hidden>
        <span className="pc-shadebar-run">
          {order.map(({ c, j }) => (
            <i key={j} style={{ background: colourCss(c) }} />
          ))}
        </span>
        <span ref={win} className="pc-shadebar-window" />
        {at >= 0 && <span className="pc-shadebar-mark" style={{ left: `${((at + 0.5) / order.length) * 100}%` }} />}
      </div>
      <div ref={strip} className="pc-shadestrip-run">
        {order.map(({ c, j }, k) => {
          const on = picking ? picked.includes(j) : j === current;
          return (
            <button
              key={j}
              data-j={j}
              onClick={() => onPick(j)}
              title={c.name}
              aria-pressed={picking ? picked.includes(j) : j === current}
              className={`pc-pink pc-shadechip${on ? (picking ? ' is-picked' : ' is-on') : ''}`}
              style={{ background: colourCss(c), animationDelay: `${Math.min(k, 18) * 22}ms` }}
            >
              {picking && <span aria-hidden className="pc-shadechip-tick">{picked.includes(j) ? '✓' : ''}</span>}
              <span style={{ color: colourFg(c) }}>{c.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
