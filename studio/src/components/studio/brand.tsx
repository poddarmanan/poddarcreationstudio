import type { CSSProperties } from 'react';

/** The interlaced-thread glyph — Poddar Creation's ownable mark. */
export function WeaveMark({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path d="M1 0h2v16H1zM7 0h2v16H7zM13 0h2v16h-2z" fill="#1C1917" />
      <path d="M0 3h16v2H0zM0 11h16v2H0z" fill="#8A6D45" opacity=".9" />
    </svg>
  );
}

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
