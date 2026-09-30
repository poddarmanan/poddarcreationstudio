'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** One detail the buyer gave: what it is, what they typed, and whether it is a secret (a password or code). */
export type SealEntry = { label: string; value: string; secret?: boolean; hash?: boolean };

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** A stable stand-in for a detail's sealed form: the same characters every time for the same value. */
function sealedOf(value: string, len: number, hash: boolean) {
  let h = 2166136261;
  for (const ch of value) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  let out = '';
  for (let i = 0; out.length < len; i++) {
    h = Math.imul(h ^ (i + 0x9e37), 2654435761) >>> 0;
    out += GLYPHS[h % GLYPHS.length];
  }
  return hash ? `$2b$10$${out.slice(7)}` : out;
}

/**
 * Signed in, or an account made: the details go into the house, sealed. An ivory veil rises; the
 * details the buyer gave stand as slips, each named and as typed (a password as dots). One after
 * another their characters turn into sealed text, a password into its one-way hash. Then the slips
 * travel down into a brass padlock marked with the house's monogram, its dial turning as each goes
 * in; the shackle closes with a ring of light, and a line says, truthfully, how they are kept: sent
 * over an encrypted connection, and a password kept only as a one-way hash. Then the next page is
 * laid in and the veil lifts away over it like a curtain.
 */
export function SealMoment({ entries, title, sealed, lines, onDone }: { entries: SealEntry[]; title: string; sealed: string; lines: string[]; onDone: () => void }) {
  const [stage, setStage] = useState<'in' | 'seal' | 'send' | 'shut' | 'gone'>('in');
  const root = useRef<HTMLDivElement | null>(null);
  const texts = useRef<(HTMLSpanElement | null)[]>([]);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    const quick = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (quick) {
      const tm = window.setTimeout(() => done.current(), 250);
      return () => window.clearTimeout(tm);
    }
    // Each slip's characters turn to sealed text in turn, left to right, the rest flickering.
    const n = entries.length;
    const SEAL_AT = 850;
    const EACH = 520;
    const GAP = 140;
    const plain = entries.map((e) => (e.secret ? '•'.repeat(Math.min(12, Math.max(6, e.value.length))) : e.value));
    const target = entries.map((e, i) => sealedOf(e.value + e.label, Math.max(plain[i].length, e.hash ? 30 : 16), !!e.hash));
    const started = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const t = now - started;
      let busy = false;
      entries.forEach((_, i) => {
        const el = texts.current[i];
        if (!el) return;
        const k = Math.max(0, Math.min(1, (t - SEAL_AT - i * GAP) / EACH));
        if (k <= 0) return;
        if (k < 1) busy = true;
        const to = target[i];
        const upTo = Math.floor(to.length * k);
        let s = to.slice(0, upTo);
        for (let j = upTo; j < Math.min(to.length, upTo + 4); j++) s += GLYPHS[(Math.random() * GLYPHS.length) | 0];
        el.textContent = k >= 1 ? to : s + plain[i].slice(Math.min(plain[i].length, upTo + 4));
      });
      if (busy || t < SEAL_AT + n * GAP + EACH) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const sealEnd = SEAL_AT + (n - 1) * GAP + EACH;
    const timers = [
      window.setTimeout(() => setStage('seal'), SEAL_AT),
      window.setTimeout(() => setStage('send'), sealEnd + 200),
      window.setTimeout(() => setStage('shut'), sealEnd + 200 + 450 + n * 90),
      // Handed on: the page underneath changes at once (the sign-in page goes), so the curtain
      // that lifts is a copy of this one, left in the page on its own and removed when it is up.
      window.setTimeout(() => {
        const node = root.current;
        if (node) {
          const copy = node.cloneNode(true) as HTMLElement;
          copy.removeAttribute('role');
          copy.setAttribute('aria-hidden', 'true');
          copy.classList.add('is-copy');
          document.body.appendChild(copy);
          requestAnimationFrame(() => requestAnimationFrame(() => copy.classList.add('is-out')));
          window.setTimeout(() => copy.remove(), 900);
        }
        setStage('gone');
        done.current();
      }, sealEnd + 200 + 450 + n * 90 + 1500),
    ];
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((x) => window.clearTimeout(x));
    };
  }, [entries]);

  if (stage === 'gone') return null;
  return createPortal(
    <div ref={root} className={`pc-seal is-${stage}`} role="status" aria-live="polite" aria-label={title}>
      <div aria-hidden className="pc-seal-veil" />
      <div className="pc-seal-stage">
        <div className="pc-seal-eyebrow">{title}</div>
        <div className="pc-seal-slips">
          {entries.map((e, i) => (
            <div key={e.label} className="pc-seal-slip" style={{ ['--i' as string]: i, ['--n' as string]: entries.length }}>
              <span className="pc-seal-label">
                {e.label}
                {e.secret && (
                  <svg aria-hidden width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                )}
              </span>
              <span
                ref={(el) => {
                  texts.current[i] = el;
                }}
                className="pc-seal-text"
              >
                {e.secret ? '•'.repeat(Math.min(12, Math.max(6, e.value.length))) : e.value}
              </span>
            </div>
          ))}
        </div>
        {/* The house's padlock: a brass body with the monogram, a turning dial, and its shackle. */}
        <div aria-hidden className="pc-seal-lock">
          <span className="pc-seal-shackle" />
          <span className="pc-seal-body">
            <span className="pc-seal-dial" />
            <b>PC</b>
          </span>
          <span className="pc-seal-ring" />
        </div>
        <div className="pc-seal-done">
          <b>{sealed}</b>
          {lines.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
