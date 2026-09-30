import type { CSSProperties } from 'react';

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
