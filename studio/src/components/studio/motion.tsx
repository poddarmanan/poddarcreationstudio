'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * Keeps something mounted long enough to animate out. `shown` says whether to render it at all;
 * `leaving` is true for the last `ms` milliseconds before it goes, while its closing keyframes
 * play. Opening and closing both go through timers, so nothing is set synchronously in an effect.
 */
export function usePresence(open: boolean, ms = 460) {
  const [state, setState] = useState({ shown: open, leaving: false });
  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => setState({ shown: true, leaving: false }), 0);
      return () => window.clearTimeout(t);
    }
    const start = window.setTimeout(() => setState((s) => (s.shown ? { shown: true, leaving: true } : s)), 0);
    const end = window.setTimeout(() => setState({ shown: false, leaving: false }), ms);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(end);
    };
  }, [open, ms]);
  return state;
}

/**
 * A section that eases up into place the first time it scrolls into view — slowly, so the page
 * reads as laid out rather than switched on. Visible at once when motion is reduced or the
 * browser has no IntersectionObserver.
 */
export function Reveal({ children, delay = 0, style, as: Tag = 'div' }: { children: ReactNode; delay?: number; style?: CSSProperties; as?: 'div' | 'section' }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const t = window.setTimeout(() => setSeen(true), 0);
      return () => window.clearTimeout(t);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.06 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref}
      className={`pc-reveal${seen ? ' is-in' : ''}`}
      style={{ ...style, transitionDelay: seen ? `${delay}ms` : '0ms' }}
    >
      {children}
    </Tag>
  );
}
