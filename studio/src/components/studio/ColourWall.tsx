'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Studio } from './state';
import type { ColourRow, FabricRow } from '@/lib/types';
import { Selvage } from './brand';
import { FONT_DISPLAY, FONT_BODY, colourCss, colourFg, colourShade, chipStyle, fabricTex } from './helpers';

/** A shade on the wall, with where it comes from. */
type Shade = { key: string; c: ColourRow; x: FabricRow; j: number; css: string; fg: string; fam: Family };

/**
 * Colour families, by OKLCH hue, and the near-greys by chroma. The order is the spectrum, the
 * neutrals first, as a dye house shelves its yarn.
 */
const FAMILIES = ['neutral', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'violet', 'pink'] as const;
type Family = (typeof FAMILIES)[number];
function familyOf(c: ColourRow): Family {
  if (c.c < 0.035) return 'neutral';
  const h = ((c.h % 360) + 360) % 360;
  if (h < 40 || h >= 350) return 'red';
  if (h < 75) return 'orange';
  if (h < 115) return 'yellow';
  if (h < 170) return 'green';
  if (h < 220) return 'teal';
  if (h < 275) return 'blue';
  if (h < 315) return 'violet';
  return 'pink';
}

/** The variables every rendering of a shade uses: the colour, a darker and a lighter tone of it. */
const tones = (c: ColourRow) => ({ ['--c' as string]: colourCss(c), ['--cd' as string]: colourShade(c, -0.14), ['--cl' as string]: colourShade(c, 0.1) }) as CSSProperties;

const ITERATIONS = [
  { k: 'thread', n: 'I' },
  { k: 'rail', n: 'II' },
  { k: 'atlas', n: 'III' },
  { k: 'bolts', n: 'IV' },
] as const;
type Iteration = (typeof ITERATIONS)[number]['k'];

/**
 * The Colour Wall, in four iterations to choose between: the thread room, the swatch rail, the
 * colour atlas and the bolt wall. Each shows one quality's shades at a time and opens its fabric
 * on a tap, after a small lift, as if taken off the wall. The iteration chosen is remembered on
 * this device, and `?wall=1…4` picks one outright.
 */
export function ColourWall({ studio }: { studio: Studio }) {
  const { t, fabrics, wallFab } = studio;
  // Always one quality at a time: the one chosen, or the first.
  const fab = fabrics.find((x) => x.id === wallFab) ?? fabrics[0];
  const [it, setIt] = useState<Iteration>('thread');
  useEffect(() => {
    const tm = window.setTimeout(() => {
      const fromUrl = Number(new URLSearchParams(window.location.search).get('wall'));
      let saved: string | null = null;
      try {
        saved = localStorage.getItem('pc-wall-iteration');
      } catch {}
      const pick = fromUrl >= 1 && fromUrl <= 4 ? ITERATIONS[fromUrl - 1].k : ITERATIONS.find((i) => i.k === saved)?.k;
      if (pick) setIt(pick);
    }, 0);
    return () => window.clearTimeout(tm);
  }, []);
  const choose = (k: Iteration) => {
    setIt(k);
    try {
      localStorage.setItem('pc-wall-iteration', k);
    } catch {}
  };

  const shades = useMemo(() => {
    if (!fab) return [];
    return fab.colours.map((c, j): Shade => ({ key: `${fab.id}-${j}`, c, x: fab, j, css: colourCss(c), fg: colourFg(c), fam: familyOf(c) }));
  }, [fab]);
  // Grouped by family, each light to dark.
  const byFamily = useMemo(
    () =>
      FAMILIES.map((f) => ({ f, items: shades.filter((s) => s.fam === f).sort((a, b) => b.c.l - a.c.l || a.c.h - b.c.h) })).filter((g) => g.items.length),
    [shades],
  );

  // Taking a shade off the wall: it lifts, then its fabric opens.
  const [picked, setPicked] = useState<string | null>(null);
  const pick = (s: Shade) => {
    if (picked) return;
    setPicked(s.key);
    window.setTimeout(() => {
      setPicked(null);
      studio.openFabric(s.x.id, s.j);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 420);
  };
  const famName = (f: Family) => t[`fam_${f}`] ?? f;
  const view = { byFamily, shades, picked, pick, famName, t };

  return (
    <div style={{ padding: 'clamp(30px,5vw,56px) clamp(16px,5vw,64px) 80px', animation: 'layCloth .95s cubic-bezier(.22,.8,.2,1) both' }}>
      <div style={{ fontSize: 10, letterSpacing: '.5em', color: '#8A6D45', marginBottom: 8 }}>PODDAR CREATION</div>
      <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(34px,4.5vw,58px)' }}>{t.colourWall}</h1>
      <Selvage style={{ marginTop: 12 }} />
      <p style={{ margin: '8px 0 18px', fontSize: 14, fontWeight: 300, color: 'rgba(28,25,23,.55)' }}>
        {fab?.name} · {shades.length} {t.shades} · {t.wallSub}
      </p>

      {/* The iterations, to compare and choose between. */}
      <div className="pc-iter" role="radiogroup" aria-label={t.wallIteration}>
        <span className="pc-iter-k">{t.wallIteration}</span>
        {ITERATIONS.map((i) => (
          <button key={i.k} role="radio" aria-checked={it === i.k} className={it === i.k ? 'is-on' : undefined} onClick={() => choose(i.k)}>
            <b>{i.n}</b>
            {t[`iter_${i.k}`]}
          </button>
        ))}
      </div>
      <p key={it} className="pc-iter-sub">{t[`iter_${it}_sub`]}</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0 26px' }}>
        {fabrics.map((chip) => {
          const on = fab?.id === chip.id;
          const cs = chipStyle(on);
          return (
            <button
              key={chip.id}
              aria-pressed={on}
              onClick={() => studio.setWallFab(chip.id)}
              style={{ cursor: 'pointer', background: cs.background, color: cs.color, border: `1px solid ${cs.borderColor}`, borderRadius: 999, padding: '8px 16px', fontFamily: FONT_BODY, fontSize: 12 }}
            >
              {chip.name}
            </button>
          );
        })}
      </div>

      <div key={it + (fab?.id ?? '')}>
        {it === 'thread' && <ThreadRoom {...view} />}
        {it === 'rail' && <SwatchRail {...view} />}
        {it === 'atlas' && <ColourAtlas {...view} />}
        {it === 'bolts' && <BoltWall {...view} />}
      </div>
    </div>
  );
}

type ViewProps = {
  byFamily: { f: Family; items: Shade[] }[];
  shades: Shade[];
  picked: string | null;
  pick: (s: Shade) => void;
  famName: (f: Family) => string;
  t: Record<string, string>;
};

/** A family's heading: its name, a swatch of its span light to dark, and its count. */
function FamilyHead({ name, items }: { name: string; items: Shade[] }) {
  const span = items.length > 1 ? `linear-gradient(90deg, ${items[0].css}, ${items[Math.floor(items.length / 2)].css}, ${items[items.length - 1].css})` : items[0].css;
  return (
    <div className="pc-famhead">
      <span className="pc-famhead-span" style={{ background: span }} />
      <b>{name}</b>
      <span>{items.length}</span>
    </div>
  );
}

// ─── I. The thread room ──────────────────────────────────────────────────────────────────────────

/**
 * The thread room: every shade wound on a yarn cone, shelved by family on a pegboard, light to dark
 * along each shelf, as a dye house keeps its yarn. Each cone is shaded as a cylinder, wound with
 * thread, on a paper tube, and casts its shadow on the board; each shelf is a plank with a lip. A
 * shelf scrolls sideways when it holds more than fits. Hover or tap lifts a cone off its peg.
 */
function ThreadRoom({ byFamily, picked, pick, famName }: ViewProps) {
  return (
    <div className="pc-threadroom">
      {byFamily.map(({ f, items }, gi) => (
        <section key={f} className="pc-shelf" style={{ animationDelay: `${gi * 0.06}s` }}>
          <FamilyHead name={famName(f)} items={items} />
          <div className="pc-shelf-track">
            {items.map((s, i) => (
              <button
                key={s.key}
                title={`${s.c.name} · ${s.x.name}`}
                aria-label={`${s.c.name}, ${s.x.name}`}
                className={`pc-cone${picked === s.key ? ' is-picked' : ''}`}
                style={{ ...tones(s.c), animationDelay: `${Math.min(i, 24) * 0.025 + gi * 0.05}s` }}
                onClick={() => pick(s)}
              >
                <span className="pc-cone-shadow" />
                <span className="pc-cone-body" />
                <span className="pc-cone-tip" />
                <span className="pc-cone-base" />
                <span className="pc-cone-name">{s.c.name}</span>
              </button>
            ))}
          </div>
          <div className="pc-shelf-plank" />
        </section>
      ))}
    </div>
  );
}

// ─── II. The swatch rail ─────────────────────────────────────────────────────────────────────────

/**
 * The swatch rail: every shade a hanging swatch card, its header printed with the shade's name and
 * number and its body a cutting of the cloth, hung close on a brass rail, one rail to a family.
 * The cards stand turned in depth, overlapping like cards in a file; the one under the hand (or
 * tapped) swings round to face you and those after it slide along to make room.
 */
function SwatchRail({ byFamily, picked, pick, famName }: ViewProps) {
  return (
    <div className="pc-rails">
      {byFamily.map(({ f, items }, gi) => (
        <section key={f} className="pc-rail" style={{ animationDelay: `${gi * 0.06}s` }}>
          <FamilyHead name={famName(f)} items={items} />
          <div className="pc-rail-track">
            <span aria-hidden className="pc-rail-rod" />
            {items.map((s, i) => (
              <button
                key={s.key}
                title={`${s.c.name} · ${s.x.name}`}
                aria-label={`${s.c.name}, ${s.x.name}`}
                className={`pc-card${picked === s.key ? ' is-picked' : ''}`}
                style={{ animationDelay: `${Math.min(i, 24) * 0.03 + gi * 0.05}s`, zIndex: i + 1 } as CSSProperties}
                onClick={() => pick(s)}
              >
                <span aria-hidden className="pc-card-hook" />
                <span className="pc-card-head">
                  <b>{s.c.name}</b>
                  <i>
                    {s.x.name} · {String(s.c.order).padStart(2, '0')}
                  </i>
                </span>
                <span aria-hidden className="pc-card-cloth" style={{ background: `linear-gradient(90deg, rgba(0,0,0,.1), transparent 30%, rgba(255,255,255,.08) 55%, rgba(0,0,0,.14)), ${fabricTex(s.x, s.c, 3)}` }} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ─── III. The colour atlas ───────────────────────────────────────────────────────────────────────

const ATLAS_H = 260; // lightness, bottom to top
const ATLAS_R = 560; // px per unit of chroma

/**
 * The colour atlas: every shade placed where it truly sits in colour, as in a Munsell tree: its hue
 * around the axis, its lightness up the axis, its strength outward from it. The solid turns in 3D:
 * drag to turn it (it turns once by itself as it arrives). The shades on the page facing you are
 * laid out below, light to dark, to choose from.
 */
function ColourAtlas({ shades, picked, pick, famName, t }: ViewProps) {
  const solid = useRef<HTMLDivElement | null>(null);
  const rot = useRef(-40);
  const [facing, setFacing] = useState(40);
  const drag = useRef<{ x: number; from: number } | null>(null);
  const apply = () => {
    const el = solid.current;
    if (!el) return;
    el.style.transform = `rotateX(-14deg) rotateY(${rot.current}deg)`;
    // The chips turn back by as much, so each always faces you, like a card held up.
    el.style.setProperty('--rot', `${rot.current}deg`);
  };
  const settle = () => setFacing((((-rot.current % 360) + 360) % 360));
  useEffect(() => {
    // Arriving, the atlas turns a little over a quarter by itself.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      apply();
      settle();
      return;
    }
    const from = rot.current;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 1800);
      rot.current = from - 100 * (1 - Math.pow(1 - k, 3));
      apply();
      if (k < 1) raf = requestAnimationFrame(step);
      else settle();
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      rot.current = d.from + (e.clientX - d.x) * 0.45;
      apply();
    };
    const up = () => {
      if (!drag.current) return;
      drag.current = null;
      settle();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  // The page facing you: the shades within 24° of hue of it (and, from the axis, the greys).
  const near = (h: number) => Math.abs(((h - facing + 540) % 360) - 180) <= 24;
  const page = shades.filter((s) => s.c.c >= 0.035 && near(s.c.h)).sort((a, b) => b.c.l - a.c.l || b.c.c - a.c.c);
  const pageFam = page[Math.floor(page.length / 2)]?.fam;

  return (
    <div className="pc-atlas-wrap">
      <div
        className="pc-atlas"
        onPointerDown={(e) => {
          e.preventDefault();
          drag.current = { x: e.clientX, from: rot.current };
        }}
      >
        <div ref={solid} className="pc-atlas-solid" style={{ transform: 'rotateX(-14deg) rotateY(-40deg)', ['--rot' as string]: '-40deg' } as CSSProperties}>
          {/* The axis: white at the top to black at the foot, where the greys sit. */}
          <span className="pc-atlas-axis" style={{ height: ATLAS_H }} />
          {/* The floor: a ring for each step of strength. */}
          {[0.05, 0.1, 0.15, 0.2].map((c) => (
            <span key={c} className="pc-atlas-ring" style={{ width: c * ATLAS_R * 2, height: c * ATLAS_R * 2, marginLeft: -c * ATLAS_R, marginTop: -c * ATLAS_R, transform: `translateY(${ATLAS_H / 2 + 6}px) rotateX(90deg)` }} />
          ))}
          {shades.map((s) => (
            <button
              key={s.key}
              tabIndex={-1}
              aria-hidden
              className={`pc-atlas-chip${near(s.c.h) && s.c.c >= 0.035 ? ' is-near' : ''}`}
              style={{ background: s.css, transform: `rotateY(${s.c.h}deg) translateZ(${(s.c.c * ATLAS_R).toFixed(1)}px) translateY(${((0.62 - s.c.l) * ATLAS_H * 1.6).toFixed(1)}px) rotateY(calc(${-s.c.h}deg - var(--rot)))` }}
              onClick={() => pick(s)}
            />
          ))}
        </div>
        <span className="pc-atlas-hint">{t.dragToTurn}</span>
      </div>

      {/* The page facing you, to choose from. */}
      <div className="pc-atlas-page">
        <div className="pc-famhead">
          <b>{t.facingYou}</b>
          <span>
            {pageFam ? famName(pageFam) : ''} · {Math.round(facing)}°
          </span>
        </div>
        <div className="pc-atlas-grid">
          {page.map((s, i) => (
            <button key={s.key} className={`pc-atlas-swatch${picked === s.key ? ' is-picked' : ''}`} style={{ background: s.css, color: s.fg, animationDelay: `${Math.min(i, 30) * 0.02}s` }} onClick={() => pick(s)}>
              <b>{s.c.name}</b>
              <i>{s.x.name}</i>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── IV. The bolt wall ───────────────────────────────────────────────────────────────────────────

/**
 * The bolt wall: every shade a rolled bolt of its own cloth, seen end-on, stacked six to a cubby in
 * the showroom's shelving, three, two and one, as bolts rest. The cubbies are deep: shaded inside,
 * framed in wood; each bolt shows its spiral of cloth round a card core, lit from the upper left.
 * Hover or tap draws a bolt out towards you.
 */
function BoltWall({ byFamily, picked, pick, famName }: ViewProps) {
  return (
    <div className="pc-boltwall">
      {byFamily.map(({ f, items }, gi) => {
        const cubbies: Shade[][] = [];
        for (let i = 0; i < items.length; i += 6) cubbies.push(items.slice(i, i + 6));
        return (
          <section key={f} className="pc-boltsec" style={{ animationDelay: `${gi * 0.06}s` }}>
            <FamilyHead name={famName(f)} items={items} />
            <div className="pc-cubbies">
              {cubbies.map((cub, ci) => (
                <div key={ci} className="pc-cubby">
                  <div className="pc-cubby-in">
                    {cub.map((s, k) => {
                      // Three on the floor, two on those, one on top.
                      const row = k < 3 ? 0 : k < 5 ? 1 : 2;
                      const inRow = k < 3 ? k : k < 5 ? k - 3 : 0;
                      const perRow = [3, 2, 1][row];
                      return (
                        <button
                          key={s.key}
                          title={`${s.c.name} · ${s.x.name}`}
                          aria-label={`${s.c.name}, ${s.x.name}`}
                          className={`pc-boltend${picked === s.key ? ' is-picked' : ''}`}
                          style={{ ...tones(s.c), left: `calc(50% + ${(inRow - (perRow - 1) / 2) * 33.5}% - 16.5%)`, bottom: `${6 + row * 29}%`, animationDelay: `${ci * 0.04 + k * 0.05 + gi * 0.04}s` } as CSSProperties}
                          onClick={() => pick(s)}
                        >
                          <span className="pc-boltend-name">{s.c.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

