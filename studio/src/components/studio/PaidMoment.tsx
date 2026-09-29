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
 * Paid online, the moment it is confirmed: the order slip drops in, and a wooden rubber stamp is
 * brought down on it with force. It swings in and hovers, its shadow sharpening on the paper, draws
 * back, and slams down. The rubber squashes, the slip and the page jolt (and a phone gives a short
 * buzz), ink specks spatter, and it is rocked side to side as it is pressed home. Then it lifts
 * away, revealing a worn, grainy impression that bleeds a little into the paper. ₹ coins and notes
 * shower past after the thud. After a few seconds, or at a tap, the parcel is wrapped.
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
    const tm = window.setTimeout(() => done.current(), quick ? 1600 : 5000);
    // The thud, felt: a short buzz on phones that have it, at the moment the stamp lands.
    const thud = window.setTimeout(() => {
      if (!quick && 'vibrate' in navigator) navigator.vibrate?.([45, 30, 20]);
    }, 1560);
    return () => {
      window.clearTimeout(tm);
      window.clearTimeout(thud);
    };
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

          {/* Worn ink: a grain of pale spots where the rubber met the paper less than fully. */}
          <svg aria-hidden width="0" height="0" style={{ position: 'absolute' }}>
            <filter id="pc-ink-rough" x="-5%" y="-5%" width="110%" height="110%">
              <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="7" result="grain" />
              <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.7 0 0 0 1.55" result="worn" />
              <feComposite in="SourceGraphic" in2="worn" operator="in" result="ink" />
              <feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="3" result="wobble" />
              <feDisplacementMap in="ink" in2="wobble" scale="2.5" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </svg>
          {/* The impression, left where the stamp came down. */}
          <div className="pc-bigstamp">
            <span className="pc-bigstamp-word">{t.paidWord}</span>
            <span className="pc-bigstamp-line">
              ₹ {inr(amount / 100)} · {today}
            </span>
            <span className="pc-bigstamp-ref">{reference}</span>
          </div>
          {/* Ink specks thrown out at the thud, and the ring of the blow. */}
          <div aria-hidden className="pc-stamp-impact">
            <span className="pc-stamp-ring" />
            {Array.from({ length: 12 }, (_, i) => (
              <i key={i} style={{ ['--a' as string]: `${i * 30 + seeded(i, 8) * 18}deg`, ['--d' as string]: `${110 + seeded(i, 9) * 70}px`, width: 3 + seeded(i, 10) * 4, height: 3 + seeded(i, 10) * 4 } as CSSProperties} />
            ))}
          </div>
          {/* The stamp's shadow on the slip, sharpening as it comes down. */}
          <div aria-hidden className="pc-stamptool-shadow" />
          {/* The stamp itself: a turned wooden knob, a brass collar, the block and its rubber. */}
          <div aria-hidden className="pc-stamptool">
            <span className="pc-stamptool-knob" />
            <span className="pc-stamptool-neck" />
            <span className="pc-stamptool-collar" />
            <span className="pc-stamptool-block">
              <b>Poddar Creation</b>
            </span>
            <span className="pc-stamptool-rubber" />
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
        animationDelay: `${(1.75 + seeded(i, 4) * 1.3).toFixed(2)}s`,
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
