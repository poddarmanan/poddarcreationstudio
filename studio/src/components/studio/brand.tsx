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

/** The house's number, to talk about a price: 98258 87554. */
export const PRICE_PHONE = '+919825887554';

/**
 * A small note under a price, on two lines: "Not satisfied with the price?", and beneath it "Give
 * us a call", a tap away (it dials the house). Kept quiet, in small type.
 */
export function PriceCall({ ask, call, style }: { ask: string; call: string; style?: CSSProperties }) {
  return (
    <a className="pc-price-call" href={`tel:${PRICE_PHONE}`} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} style={style}>
      <span className="pc-price-call-ask">{ask}</span>
      <span className="pc-price-call-go">
        <svg aria-hidden width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
        </svg>
        {call}
      </span>
    </a>
  );
}
