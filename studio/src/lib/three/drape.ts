/**
 * How a length of cloth falls (Phase 4 M23).
 *
 * Pure, so it can be tested across the whole parameter space rather than eyeballed in one
 * screenshot. That matters more than it sounds: the first version of this lived inside the
 * frame callback, and a negative base raised to a fractional exponent produced a NaN on
 * exactly one row of vertices — which degenerated the recomputed normals and drew a hard black
 * band across the top of every fabric in the studio. It read as a lighting bug for as long as
 * it took to find, and no unit test could reach it.
 *
 * This is not a cloth solver. A real one is milliseconds per frame per garment, needs a fixed
 * timestep, and would put a phone on the floor. What this does is sum standing waves whose
 * wavelength and amplitude come from the fabric's own figures — the look of drape, for the cost
 * of a little arithmetic per vertex.
 */

export interface DrapeInput {
  /** Vertex position in the panel's rest pose, metres. */
  x: number;
  y: number;
  /** Panel height, metres. */
  height: number;
  /** The merchant's `flow`, 0-1: how fluid the cloth is. Sets fold count and depth. */
  flow: number;
  /** The merchant's `stretch`, 0-1. */
  stretch: number;
  /** Wind strength, 0-3, from the lab's rail. */
  wind: number;
  /** How far into the stretch test we are, 0-1 (eased, not a switch). */
  pull: number;
  /** Seconds. */
  time: number;
}

export interface DrapeOutput {
  /** Displacement out of the plane: folds, drift and gust together. */
  z: number;
  /**
   * The wind's share of `z` on its own. A garment on a form damps its folds towards the side
   * seams but is pushed by the wind as a whole, so it needs the two apart; a hanging panel
   * uses `z` and never reads this.
   */
  gust: number;
  /** Where the vertex ends up once stretch has narrowed and lengthened the cloth. */
  x: number;
  y: number;
}

export function drape({ x, y, height, flow, stretch, wind, pull, time }: DrapeInput): DrapeOutput {
  // A fluid cloth folds more often and more deeply; a stiff one holds a few broad waves. Pulling
  // it taut flattens the folds, which is exactly what happens to real cloth under tension.
  const folds = 2 + flow * 5;
  const depth = (0.012 + flow * 0.055) * (1 - pull * 0.85);

  // Folds settle towards the top edge, where the cloth is held.
  //
  // `Math.max(0, …)` is load-bearing, not defensive. The top row's `y` comes out one ULP above
  // `height / 2`, so without it the base goes very slightly negative — and a negative base with
  // a fractional exponent is NaN.
  const hang = 0.12 + Math.max(0, 0.5 - y / height) ** 1.15 * 0.88;

  const fold = Math.sin(x * folds * Math.PI * 2 + time * 0.35) * depth * hang;
  // A second wave at an incommensurable wavelength stops the folds reading as a regular
  // corrugation. Real cloth never repeats exactly.
  const drift = Math.sin(x * folds * 1.61 * Math.PI + time * 0.21 + y * 2) * depth * 0.4 * hang;
  const gust = wind * 0.02 * Math.sin(time * 1.4 + y * 3.1) * hang;

  return {
    z: fold + drift + gust,
    gust,
    // Stretch narrows and lengthens, and the fabric's own recovery figure decides how much: a
    // cotton lycra pulls far and springs back, a gajji barely moves.
    x: x * (1 - pull * stretch * 0.22),
    y: y * (1 + pull * stretch * 0.3),
  };
}
