import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';

/**
 * The rule under every page heading: a fine gold line that fades out at both ends and draws
 * itself out from the middle as the heading arrives. (It was a gold-and-ink running stitch; the
 * owner asked for that pattern never to be seen again, so it is gone everywhere with it.)
 */
export function Selvage({ style }: { style?: CSSProperties }) {
  return (
    <span
      aria-hidden
      className="pc-rule"
      style={{
        display: 'block', width: 72, height: 1.5,
        background: 'linear-gradient(90deg, transparent, #8A6D45 20%, #8A6D45 80%, transparent)',
        ...style,
      }}
    />
  );
}

/**
 * A page's headline, set to fill its line: measured at a reference size, then sized so its one
 * line runs the width of the page (never above 160px), and measured again on resize and once the
 * fonts have loaded. The Colour Closet and the Swatch Book are headed with it.
 */
export function FillLine({ children }: { children: ReactNode }) {
  const box = useRef<HTMLHeadingElement | null>(null);
  const line = useRef<HTMLSpanElement | null>(null);
  useLayoutEffect(() => {
    const h = box.current;
    const l = line.current;
    if (!h || !l) return;
    const fit = () => {
      l.style.fontSize = '100px';
      const w = l.getBoundingClientRect().width;
      if (w > 0) l.style.fontSize = `${Math.min(160, (100 * h.clientWidth) / w) - 0.5}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(h);
    document.fonts?.ready.then(fit).catch(() => {});
    return () => ro.disconnect();
  }, []);
  return (
    <h1 ref={box} className="pc-fill-title">
      <span ref={line}>{children}</span>
    </h1>
  );
}
