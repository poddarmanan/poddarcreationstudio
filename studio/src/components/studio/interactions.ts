'use client';

import { useRef, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react';

/**
 * Pointer drag-to-scroll for horizontal galleries (showroom walk, chip rails, "more
 * fabrics"). Mirrors the prototype's dsDown/dsMove/dsUp/dsClick: a drag past a small
 * threshold captures the pointer and pans the container; a captured drag also swallows the
 * click that would otherwise open whatever was under the cursor, so dragging never
 * mis-fires a navigation. Touch is left to the browser: native scrolling both ways, with momentum.
 */
export function useDragScroll() {
  const st = useRef<{ x: number; sl: number; moved: boolean; id: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    // A finger scrolls the gallery natively (with its momentum, as Safari on an iPhone expects);
    // only a mouse is dragged by hand.
    if (e.pointerType !== 'mouse') return;
    st.current = { x: e.clientX, sl: e.currentTarget.scrollLeft, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const s = st.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 5 && !s.moved) {
      s.moved = true;
      try { e.currentTarget.setPointerCapture(s.id); } catch { /* capture is best-effort */ }
    }
    if (s.moved) e.currentTarget.scrollLeft = s.sl - dx;
  };
  const onPointerUp = () => {
    // Defer clearing so the click handler (which fires after pointerup) still sees `moved`.
    const s = st.current;
    if (s) setTimeout(() => { st.current = null; }, 0);
  };
  const onClickCapture = (e: ReactMouseEvent<HTMLElement>) => {
    if (st.current?.moved) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onClickCapture };
}

/** Smoothly nudge a scroll container found by id — powers the ‹ › walk/rail arrows. */
export function scrollByEl(id: string, dx: number) {
  const el = document.getElementById(id);
  if (el) el.scrollBy({ left: dx, behavior: 'smooth' });
}
