# M23 — Fabric Viewer 2.0

The Fabric Lab's stage now shows the real cloth: lit, draping, and turnable. The chrome around
it — lighting rail, wind rail, test pills, specification, shade wall — is untouched. Only what
stands on the stage changed.

## Why turning matters

Cloth is judged at an angle. A buyer tilts a swatch under the shop light to see whether the shade
shifts and whether the weave catches; that answer is often the reason an order is placed or
isn't, and no flat image can give it.

The cloth **rocks** rather than spins. A merchant rocks a bolt through maybe forty degrees to
watch the shade move; nobody turns it through 360°, and letting it do so shows the back of a
surface that has no back. Dragging is clamped to ±69° for the same reason.

## Hold and spin

The turntable listens on the canvas element, not the mesh, so a drag works wherever a thumb
lands on the stage, and it captures the pointer so a flick that leaves the stage still finishes.
Release carries momentum with exponential friction; a hold-and-release stops dead. Left alone
for three seconds it eases back into its own motion — the rock, or a slow full turn under
"Watch in 3D" — and any touch takes over instantly. `touch-action: pan-y` on the stage lets a
vertical swipe still scroll the page on a phone.

The "Watch in 3D" toggle used to whip the cloth through a turn or more, because the rock counter
had been running since the lab opened and was read straight into the free-turn formula; it is
now re-based to the current angle on each transition.

## Drape comes from the spec sheet

`src/lib/three/drape.ts` sums standing waves whose wavelength and amplitude come from the
merchant's own `flow` and `stretch` figures. A 20kg gajji hangs in a few deep folds because a
heavy, stiff cloth resists bending; a 14kg rayon breaks into many shallow ones because it does
not. That difference is the single most useful thing a buyer can see before ordering, and a
photograph of a flat swatch never shows it.

It is **not** a cloth solver. A real one is milliseconds per frame per garment, needs a fixed
timestep, and would put a phone on the floor.

The maths is a pure function, deliberately, so it can be swept across the whole parameter space
rather than eyeballed in one screenshot — see below.

## Three real bugs, and what they taught

**A negative base with a fractional exponent is NaN.** `(0.5 - y / height) ** 1.15` — the top
row's `y` lands one ULP *above* `height / 2`, so the base went very slightly negative. The NaN
propagated into the vertex position, degenerated the recomputed normals, and drew a hard black
band across the top of every fabric in the studio. It read as a lighting bug through two wrong
fixes. `Math.max(0, …)` there is load-bearing, and `smoke-m23.ts` now sweeps 47,000 vertex
positions asserting every output is finite.

**three.js reads `aoMap` from the second UV set by default.** None of our geometry has one, so
occlusion was sampling undefined coordinates. Fixed by pointing the packed map's channel at UV0.

**A renderer is shared state.** Writing `gl.toneMappingExposure` during render puts the value on
whichever frame happens to be in flight; it belongs in the frame callback, which is the one place
guaranteed to be between two draws.

## Verifying

```bash
npx tsx scripts/smoke-m23.ts
```

- 47,040 drape samples across every height, flow, wind, tension and time — all finite
- fold depth stays physical (never deeper than a swatch)
- a fluid rayon falls in deeper folds than a crisp PC/PC
- tension flattens the folds, lengthens the panel and narrows it, and a 0.1-stretch gajji barely
  moves where a 0.9-stretch lycra pulls far
- the wind rail actually moves the cloth
- all eleven qualities produce distinct materials — a viewer that renders every fabric
  identically is the failure mode that looks fine
