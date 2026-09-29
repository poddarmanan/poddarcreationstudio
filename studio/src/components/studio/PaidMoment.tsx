'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Studio } from './state';
import type { ColourRow, FabricRow } from '@/lib/types';
import { Room } from './SwatchBook';

const inr = (n: number) => n.toLocaleString('en-IN');

/** A seeded pseudo-random in [0, 1), so the shower falls the same way each time. */
const seeded = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Paid online, the moment it is confirmed: the order slip drops in, a rubber stamp comes down on it
 * with a thud (the slip jolts, the ink spreads), and ₹ coins and notes shower past. After a few
 * seconds, or at a tap, the parcel is wrapped.
 */
export function PaidMoment({
  studio, lines, total, amount, reference, onDone,
}: {
  studio: Studio; lines: { x: FabricRow; c: ColourRow; metres: number }[]; total: number; amount: number; reference: string; onDone: () => void;
}) {
  const { t } = studio;
  const [today] = useState(() => new Date().toLocaleDateString(studio.lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' }));
  // Moves on by itself once the shower has fallen; kept to one timer however often this renders.
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const quick = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tm = window.setTimeout(() => done.current(), quick ? 1600 : 4200);
    return () => window.clearTimeout(tm);
  }, []);
  const shown = lines.slice(0, 5);

  return (
    <Room center>
      <div className="pc-paid" onClick={onDone} role="status" aria-live="polite">
        <div className="pc-paid-eyebrow">{t.paymentReceived}</div>
        <div className="pc-paid-amount">₹ {inr(amount / 100)}</div>

        {/* The slip, with the stamp brought down on it. */}
        <div className="pc-paid-slip">
          <div className="pc-slip" style={{ borderRadius: 6 }}>
            <div className="pc-slip-head">
              <div>
                <span className="pc-slip-small">Poddar Creation · Surat</span>
                <b>{t.orderSlip}</b>
              </div>
              <span className="pc-slip-small" style={{ textAlign: 'right' }}>{today}</span>
            </div>
            <div aria-hidden className="pc-slip-rule" />
            {shown.map((l) => (
              <div key={`${l.x.id}:${l.c.id}`} className="pc-slip-leader">
                <span>
                  {l.c.name} · {l.x.name}
                </span>
                <i aria-hidden />
                <span>{inr(l.metres)} m</span>
              </div>
            ))}
            {lines.length > shown.length && <div className="pc-slip-leader"><span>+ {lines.length - shown.length}</span></div>}
            <div className="pc-slip-leader is-grand">
              <span>{t.metresWord}</span>
              <i aria-hidden />
              <b>{inr(total)} m</b>
            </div>
          </div>
          <div aria-hidden className="pc-slip-edge" />

          <div aria-hidden className="pc-bigstamp-ink" />
          <div className="pc-bigstamp">
            <span className="pc-bigstamp-word">{t.paidWord}</span>
            <span className="pc-bigstamp-line">
              ₹ {inr(amount / 100)} · {today}
            </span>
            <span className="pc-bigstamp-ref">{reference}</span>
          </div>
        </div>

        <p className="pc-paid-copy">{t.paidThanks}</p>
      </div>
      <MoneyShower />
    </Room>
  );
}

/** ₹ coins and notes falling past, each on its own line, turn and sway; drawn once and gone. */
function MoneyShower() {
  const pieces = Array.from({ length: 26 }, (_, i) => {
    const note = i % 3 === 0;
    return {
      note,
      style: {
        left: `${(seeded(i, 1) * 96 + 2).toFixed(1)}%`,
        ['--sway' as string]: `${((seeded(i, 2) - 0.5) * 120).toFixed(0)}px`,
        ['--spin' as string]: `${((seeded(i, 3) - 0.5) * (note ? 540 : 900)).toFixed(0)}deg`,
        animationDelay: `${(1.05 + seeded(i, 4) * 1.3).toFixed(2)}s`,
        animationDuration: `${(note ? 2.8 : 2.1) + seeded(i, 5) * 0.9}s`,
        scale: String(0.8 + seeded(i, 6) * 0.45),
      } as CSSProperties,
    };
  });
  return (
    <div aria-hidden className="pc-money">
      {pieces.map((p, i) =>
        p.note ? (
          <span key={i} className="pc-money-note" style={p.style}>
            <b>₹</b>
          </span>
        ) : (
          <span key={i} className="pc-money-coin" style={p.style}>
            ₹
          </span>
        ),
      )}
    </div>
  );
}
