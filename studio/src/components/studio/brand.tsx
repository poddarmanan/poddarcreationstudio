import { SELVAGE_STYLE } from './helpers';
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

/** The gold-and-ink running-stitch divider that sits under every page heading. */
export function Selvage({ style }: { style?: CSSProperties }) {
  return <span style={{ ...SELVAGE_STYLE, ...style }} aria-hidden />;
}
