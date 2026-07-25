'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Studio } from './state';
import { FONT_BODY, fabricTex, heroColour } from './helpers';

/**
 * Search on a phone: a small icon in the top-right corner of the header that unfurls into a
 * full-width pill.
 *
 * The entrance's search bar is the last thing on the tallest screen in the studio, which on a
 * phone means it is the first thing to fall off the bottom — and it only exists on the
 * entrance at all, so a buyer three taps into the colour wall has no way to search. Moving it
 * into the header solves both: it is reachable from every view, and it costs nothing until it
 * is wanted.
 *
 * The pill is anchored to the same right edge the icon sits on, so opening it grows the bar
 * leftward from under the icon rather than moving the icon — the one thing on screen the
 * thumb is already aimed at stays exactly where it was.
 *
 * Renders only under 768px (see `.pc-msearch` in globals.css); the desktop hero keeps its own
 * search bar untouched.
 */

const GOLD = '#8A6D45';

function Magnifier() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

export function MobileSearch({ studio }: { studio: Studio }) {
  const { t, q, setQ } = studio;
  const { results, asst, hasResults } = studio.search;
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQ('');
    inputRef.current?.blur();
  }, [setQ]);

  // Tapping anywhere else, or pressing Escape, puts the bar away — a search field that has to
  // be dismissed with a specific button is a search field people leave open by accident.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    setOpen(true);
    // Focus on the next frame: focusing mid-layout can make the keyboard open before the bar
    // has any width, and the browser then scrolls to a field that is 36px wide.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const choose = (go: () => void) => {
    go();
    setOpen(false);
  };

  return (
    <div className="pc-msearch-root" ref={rootRef}>
      <div className={`pc-msearch${open ? ' is-open' : ''}`}>
        <span className="pc-msearch-glyph" aria-hidden style={{ color: GOLD }}>
          <Magnifier />
        </span>
        <input
          ref={inputRef}
          className="pc-msearch-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.searchPh}
          aria-label={t.searchPh}
          aria-hidden={!open}
          tabIndex={open ? 0 : -1}
          enterKeyHint="search"
          autoComplete="off"
          style={{ fontFamily: FONT_BODY }}
        />
        {open && (
          <button
            type="button"
            className="pc-msearch-image"
            onClick={studio.runAi}
            aria-label={t.byImage}
            title={t.byImage}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className="pc-msearch-toggle"
          onClick={toggle}
          aria-label={open ? 'Close search' : 'Search'}
          aria-expanded={open}
        >
          {/* Both glyphs stay mounted and cross-fade — swapping the node would restart the
              width transition the bar is in the middle of. */}
          <span className="pc-msearch-icon pc-msearch-icon-search" aria-hidden>
            <Magnifier />
          </span>
          <span className="pc-msearch-icon pc-msearch-icon-close" aria-hidden>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </span>
        </button>
      </div>

      {open && hasResults && (
        <div className="pc-msearch-results">
          {asst && (
            <div style={{ padding: '13px 16px 11px', borderBottom: '1px solid rgba(28,25,23,.06)' }}>
              <div style={{ fontSize: 9.5, letterSpacing: '.28em', color: GOLD, marginBottom: 6 }}>STUDIO ASSISTANT</div>
              <div style={{ fontSize: 13, fontWeight: 300, color: 'rgba(28,25,23,.75)' }}>{asst.note}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                {asst.ids.map((id) => {
                  const x = studio.fab(id);
                  return (
                    <div
                      key={id}
                      onClick={() => choose(() => { setQ(''); studio.openFabric(x.id); })}
                      className="pc-hv-gold-border"
                      style={{ cursor: 'pointer', flex: 1, border: '1px solid rgba(28,25,23,.1)', borderRadius: 8, overflow: 'hidden' }}
                    >
                      <div style={{ height: 40, background: fabricTex(x, heroColour(x), 3) }} />
                      <div style={{ padding: '6px 8px' }}>
                        <div style={{ fontSize: 11.5 }}>{x.name}</div>
                        <div style={{ fontSize: 9.5, color: 'rgba(28,25,23,.5)' }}>{x.weight}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {results.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => choose(r.go)}
              className="pc-msearch-result pc-hv-row"
            >
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: r.dot, border: '1px solid rgba(28,25,23,.1)', flex: 'none' }} />
              <span style={{ fontSize: 14 }}>{r.label}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'rgba(28,25,23,.5)' }}>{r.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
