import { frameBudgetMs, type QualityTier } from './capability';

/**
 * Adaptive quality (Phase 4 M29).
 *
 * The tier chosen at startup is a guess from a renderer string. It is a decent guess and it is
 * routinely wrong: a mid-range phone throttles after ninety seconds, a laptop switches to its
 * integrated GPU on battery, and a browser tab sharing a machine with a video call gets a
 * fraction of the frames it did a minute ago. None of that is visible to a capability probe.
 *
 * So the tier is measured rather than assumed. What matters in the design:
 *
 * **Judge on the 95th percentile, not the mean.** A scene at a steady 55fps with one 400ms hitch
 * per second averages fine and feels broken. The tail is what people perceive.
 *
 * **Be quick to drop and slow to climb.** Dropping a tier costs a little fidelity; climbing into
 * a tier the device cannot hold costs a stutter, a drop, and a visible oscillation. So a
 * downgrade needs a couple of bad seconds and an upgrade needs eight good ones.
 *
 * **Remember what already failed.** Hysteresis alone is not enough, and the smoke proves it: a
 * machine sitting right at the boundary — just missing at high, comfortable at medium — drops,
 * waits out the eight good seconds, climbs, misses, and drops again, forever. Measured at 80
 * tier changes in 400 samples. So each failed attempt at a tier doubles the good run needed to
 * try it again, and after three failures that tier is closed for the session. The device has
 * told us three times; believing it the fourth time is not adaptation, it is a bug.
 *
 * **Never climb back above where the device started.** The probe's ceiling is a statement about
 * the hardware; adaptation is a statement about the moment.
 */

export const TIERS: QualityTier[] = ['low', 'medium', 'high'];

export interface AdaptiveDecision {
  tier: QualityTier;
  changed: boolean;
  reason: 'holding' | 'too-slow' | 'headroom';
}

export interface AdaptiveState {
  tier: QualityTier;
  /** Consecutive samples over budget. */
  bad: number;
  /** Consecutive samples comfortably inside budget. */
  good: number;
  /** How many times each tier has been tried and dropped out of, this session. */
  failures: Partial<Record<QualityTier, number>>;
}

/** Two bad seconds to drop. Long enough to ignore a single hitch, short enough to feel prompt. */
const BAD_SAMPLES_TO_DROP = 2;
/** Eight good seconds to climb — deliberately much longer, to stop the tier oscillating. */
const GOOD_SAMPLES_TO_RAISE = 8;
/** Only climb when there is real headroom, not when the device is merely scraping past. */
const HEADROOM = 0.65;
/** After this many failed attempts, a tier is closed for the session. */
const MAX_ATTEMPTS = 3;

export function initialState(tier: QualityTier): AdaptiveState {
  return { tier, bad: 0, good: 0, failures: {} };
}

/** Good seconds needed to try a tier again — doubling with each time it has failed. */
export function goodSamplesToReach(state: AdaptiveState, tier: QualityTier): number {
  return GOOD_SAMPLES_TO_RAISE * 2 ** (state.failures[tier] ?? 0);
}

/**
 * One second of measurement in, a decision out.
 *
 * @param p95FrameMs the slowest frame in the sample window, in milliseconds
 * @param ceiling    the tier the capability probe allowed — adaptation never exceeds it
 */
export function step(state: AdaptiveState, p95FrameMs: number, ceiling: QualityTier): AdaptiveDecision & { state: AdaptiveState } {
  const budget = frameBudgetMs(state.tier);
  const index = TIERS.indexOf(state.tier);
  const ceilingIndex = TIERS.indexOf(ceiling);

  const over = p95FrameMs > budget;
  const comfortable = p95FrameMs < budget * HEADROOM;

  const bad = over ? state.bad + 1 : 0;
  const good = comfortable ? state.good + 1 : 0;

  if (bad >= BAD_SAMPLES_TO_DROP && index > 0) {
    const tier = TIERS[index - 1];
    const failures = { ...state.failures, [state.tier]: (state.failures[state.tier] ?? 0) + 1 };
    return { tier, changed: true, reason: 'too-slow', state: { tier, bad: 0, good: 0, failures } };
  }

  const target = index < ceilingIndex ? TIERS[index + 1] : null;
  const closed = target ? (state.failures[target] ?? 0) >= MAX_ATTEMPTS : true;
  if (target && !closed && good >= goodSamplesToReach(state, target)) {
    return { tier: target, changed: true, reason: 'headroom', state: { tier: target, bad: 0, good: 0, failures: state.failures } };
  }

  return { tier: state.tier, changed: false, reason: 'holding', state: { ...state, bad, good } };
}
