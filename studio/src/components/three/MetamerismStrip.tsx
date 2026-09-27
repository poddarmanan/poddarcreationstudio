'use client';

import { useMemo } from 'react';
import type { LightKey } from '@/lib/fabric-generator';
import { LIGHTS } from '@/lib/fabric-generator';
import { metamerism, shiftVerdict } from '@/lib/three/metamerism';

/**
 * How much a shade moves between lighting conditions (Phase 4 M26).
 *
 * This is the lighting studio's actual product. A buyer approves a shade under the seller's
 * lights and the garment is worn under someone else's; when those two disagree the complaint
 * comes back as a rejected lot, and for a wholesale dyed-fabric business that is the most
 * expensive routine failure there is.
 *
 * The five chips are the same shade rendered under the five rigs the viewer offers, computed
 * with the renderer's own arithmetic so the strip and the canvas agree. The figure is the worst
 * shift from neutral, in OKLab units: under 2 nobody would argue, 2-5 a buyer notices side by
 * side, above 5 is two different shades.
 *
 * It is not a spectral simulation — real metamerism needs spectral reflectance for the dye and
 * spectral power for the lamp, and this catalogue records neither. It captures the chromatic
 * adaptation part, which is the part the customer sees.
 */

const GOLD = '#8A6D45';
const VERDICT: Record<ReturnType<typeof shiftVerdict>, { label: string; colour: string }> = {
  steady: { label: 'holds its colour', colour: '#3D6B45' },
  noticeable: { label: 'shifts noticeably', colour: GOLD },
  strong: { label: 'shifts strongly', colour: '#A33' },
};

export function MetamerismStrip({ albedoHex, current, onSelect, vertical = false }: { albedoHex: string; current: LightKey; onSelect?: (light: LightKey) => void; vertical?: boolean }) {
  const { readings, worst } = useMemo(() => metamerism(albedoHex), [albedoHex]);
  const verdict = VERDICT[shiftVerdict(worst)];

  if (vertical) {
    // On the stage's right edge: the five chips stacked, each a button that sets the light —
    // the lighting control and the metamerism reading are one thing, the shade under each
    // light, and choosing a light is choosing which of them to look at.
    return (
      <div role="group" aria-label="Lighting" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        {readings.map((r) => {
          const name = LIGHTS[r.light as LightKey]?.en ?? r.light;
          const on = r.light === current;
          return (
            <button
              key={r.light}
              onClick={() => onSelect?.(r.light as LightKey)}
              title={`${name} — ${r.shiftFromNeutral.toFixed(1)} from neutral`}
              aria-label={name}
              aria-pressed={on}
              className="pc-hv-scale-06"
              style={{
                cursor: 'pointer', width: 32, height: 32, borderRadius: 8, border: 'none', padding: 0, background: r.hex,
                boxShadow: on ? `0 0 0 2px #FAF8F5, 0 0 0 3.5px ${GOLD}` : 'inset 0 0 0 1px rgba(28,25,23,.14)',
                transform: on ? 'scale(1.08)' : 'none',
                transition: 'box-shadow .45s ease, transform .5s cubic-bezier(.2,.8,.2,1)',
              }}
            />
          );
        })}
        <span title={verdict.label} style={{ fontSize: 10, letterSpacing: '.06em', color: verdict.colour, marginTop: 2 }}>{worst.toFixed(1)}</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 9.5, letterSpacing: '.24em', color: GOLD, textTransform: 'uppercase' }}>Under each light</span>
      <div style={{ display: 'flex', gap: 4 }}>
        {readings.map((r) => (
          <span
            key={r.light}
            title={`${LIGHTS[r.light as LightKey]?.en ?? r.light} — ${r.shiftFromNeutral.toFixed(1)} from neutral`}
            aria-label={`${LIGHTS[r.light as LightKey]?.en ?? r.light}: shift ${r.shiftFromNeutral.toFixed(1)}`}
            style={{
              width: 26,
              height: 26,
              borderRadius: 5,
              background: r.hex,
              // The rail's current choice is outlined, so the strip reads as "you are here".
              boxShadow: r.light === current ? `0 0 0 1.5px ${GOLD}` : 'inset 0 0 0 1px rgba(28,25,23,.14)',
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: 11.5, color: verdict.colour }}>
        {verdict.label} · {worst.toFixed(1)}
      </span>
    </div>
  );
}
