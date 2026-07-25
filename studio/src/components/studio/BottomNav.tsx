'use client';

import type { Studio, View } from './state';
import { FONT_BODY } from './helpers';

/**
 * The mobile navigation: a floating pill anchored to the bottom of the screen.
 *
 * Why bottom, and why a pill. On a phone the top of the screen is the hardest place to reach
 * and the most valuable place to show cloth; the thumb lives at the bottom. The old header put
 * seven text links in a scrolling row at the top, which cost ~155px of the viewport, cut off
 * the last two items, and gave every one of them a 24px tap target — half the 44px minimum.
 *
 * This renders only under 768px (see `.pc-bottomnav` in globals.css); the desktop header is
 * untouched. Icons carry the meaning at a glance and the label sits underneath, so the pill
 * stays legible without needing horizontal scroll.
 */

const GOLD = '#8A6D45';
const INK = '#1C1917';

/** Line icons in the studio's own weight — 1.6px strokes, rounded caps, no fills. */
function Icon({ name }: { name: View }) {
  const common = { width: 21, height: 21, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'home': // the weave mark, simplified
      return (
        <svg {...common}>
          <path d="M4 8h16M4 16h16M8 4v16M16 4v16" />
        </svg>
      );
    case 'showroom': // an archway into the hall
      return (
        <svg {...common}>
          <path d="M4 20V9l8-5 8 5v11" />
          <path d="M9 20v-6a3 3 0 0 1 6 0v6" />
        </svg>
      );
    case 'collection': // stacked bolts of cloth
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="5" rx="1.5" />
          <rect x="3" y="11" width="18" height="5" rx="1.5" />
          <path d="M6 18h12" />
        </svg>
      );
    case 'colours': // the shade wall
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 3.5v17M3.5 12h17" />
        </svg>
      );
    case 'compare': // two panels side by side
      return (
        <svg {...common}>
          <rect x="3" y="5" width="7.5" height="14" rx="1.5" />
          <rect x="13.5" y="5" width="7.5" height="14" rx="1.5" />
        </svg>
      );
    case 'book': // the swatch book
      return (
        <svg {...common}>
          <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
          <path d="M5 17h14" />
        </svg>
      );
    case 'admin':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
        </svg>
      );
    default:
      return <svg {...common} />;
  }
}

/**
 * A sixth of a 390px screen is about 60px. "Swatch Book" and "स्वॉच बुक" do not fit, so the
 * pill shows the first word and the full name goes to the accessible name — the icon above it
 * is doing the identifying work anyway.
 */
const short = (label: string) => label.split(' ')[0];

export function BottomNav({ studio }: { studio: Studio }) {
  const { t, view, go, compare, pins, isStaff } = studio;

  // Six is the most a pill can hold at a 44px target on a 360px screen without crowding.
  // Admin replaces Compare for staff, who reach comparison from the fabric view anyway.
  const items: { k: View; label: string; count?: number }[] = [
    { k: 'home', label: t.home },
    { k: 'showroom', label: t.showroom },
    { k: 'collection', label: t.collection },
    { k: 'colours', label: t.colours },
    ...(isStaff
      ? [{ k: 'admin' as View, label: t.admin }]
      : [{ k: 'compare' as View, label: t.compare, count: compare.length }]),
    { k: 'book', label: t.book, count: pins.length },
  ];

  return (
    <nav className="pc-bottomnav" aria-label="Main">
      <div className="pc-bottomnav-pill">
        {items.map((item) => {
          const active = view === item.k;
          return (
            <button
              key={item.k}
              onClick={() => go(item.k)}
              aria-current={active ? 'page' : undefined}
              aria-label={item.label}
              className="pc-bottomnav-item"
              style={{ color: active ? INK : 'rgba(28,25,23,.5)' }}
            >
              <span className="pc-bottomnav-icon" style={{ background: active ? 'rgba(28,25,23,.07)' : 'transparent' }}>
                <Icon name={item.k} />
                {item.count ? <span className="pc-bottomnav-badge">{item.count > 9 ? '9+' : item.count}</span> : null}
              </span>
              <span
                className="pc-bottomnav-label"
                style={{ fontFamily: FONT_BODY, color: active ? INK : 'rgba(28,25,23,.5)' }}
              >
                {short(item.label)}
              </span>
              {active && <span aria-hidden className="pc-bottomnav-dot" style={{ background: GOLD }} />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
