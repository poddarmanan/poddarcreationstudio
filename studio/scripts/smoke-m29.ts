import 'dotenv/config';
import assert from 'node:assert';
import { frameBudgetMs } from '../src/lib/three/capability';
import { initialState, step, TIERS } from '../src/lib/three/adaptive';

/**
 * M29 — the Performance Engine.
 *
 * Adaptive quality is a feedback loop, and the failure mode of a feedback loop is oscillation:
 * a viewer that drops to medium, finds headroom, climbs to high, stutters, drops again, and
 * does that every eight seconds forever is worse than one that never adapts at all. So most of
 * this tests the *dynamics* rather than a single decision.
 */
function run(samples: number[], start: 'low' | 'medium' | 'high' = 'high', ceiling: 'low' | 'medium' | 'high' = 'high') {
  let state = initialState(start);
  const changes: string[] = [];
  for (const ms of samples) {
    const d = step(state, ms, ceiling);
    state = d.state;
    if (d.changed) changes.push(`${d.reason}:${d.tier}`);
  }
  return { tier: state.tier, changes };
}

async function main() {
  const fast = 8;
  const slow = 60;

  // ---- A device that cannot hold its tier drops, promptly but not instantly ---------------
  assert(run([slow]).changes.length === 0, 'one bad second must not drop the tier — a single hitch is not a trend');
  const dropped = run([slow, slow]);
  assert(dropped.tier === 'medium', `two bad seconds should drop high→medium, got ${dropped.tier}`);
  console.log('a sustained overrun drops the tier; a single hitch does not ✓');

  // It keeps dropping while the device keeps missing, and stops at the floor.
  const floored = run(Array(40).fill(slow));
  assert(floored.tier === 'low', `sustained overrun should reach the floor, got ${floored.tier}`);
  assert(floored.changes.length === 2, `high→medium→low is two changes, got ${floored.changes.length}`);
  console.log('it reaches the floor and stays there ✓');

  // ---- Climbing is slow, and never above the ceiling ---------------------------------------
  const climbing = run(Array(7).fill(fast), 'low', 'high');
  assert(climbing.tier === 'low', 'seven good seconds is not enough to climb');
  const climbed = run(Array(8).fill(fast), 'low', 'high');
  assert(climbed.tier === 'medium', `eight good seconds should climb low→medium, got ${climbed.tier}`);
  console.log('climbing needs eight good seconds, dropping needs two ✓');

  const capped = run(Array(80).fill(fast), 'low', 'medium');
  assert(capped.tier === 'medium', `adaptation must never exceed the probe's ceiling, got ${capped.tier}`);
  console.log("adaptation never climbs above the device's own ceiling ✓");

  // ---- No oscillation on a device sitting right at the boundary -----------------------------
  // This is the case that ruins a naive implementation: a machine that just misses at high and
  // just makes it at medium. It must settle, not flap.
  let state = initialState('high');
  let flips = 0;
  for (let i = 0; i < 400; i++) {
    const budget = frameBudgetMs(state.tier);
    // Just over budget at high, comfortably inside at medium.
    const ms = state.tier === 'high' ? budget * 1.08 : budget * 0.5;
    const d = step(state, ms, 'high');
    state = d.state;
    if (d.changed) flips += 1;
  }
  // One drop is correct. Climbing back and dropping again forever is not.
  assert(flips <= 40, `the tier changed ${flips} times in 400 samples — that is oscillation, not adaptation`);
  console.log(`a borderline device settles rather than flapping (${flips} changes in 400 samples) ✓`);

  // ---- A good run never degrades a healthy device --------------------------------------------
  const healthy = run(Array(200).fill(fast), 'high', 'high');
  assert(healthy.tier === 'high', 'a device comfortably inside budget must be left alone');
  assert(healthy.changes.length === 0, 'and must not be touched at all');
  console.log('a healthy device is never disturbed ✓');

  // ---- Recovery: throttled, then cool again ----------------------------------------------------
  //
  // Six bad seconds costs two tiers, and each of those tiers has now failed once — so climbing
  // back needs 16 good seconds per step rather than 8. That is the backoff working as designed,
  // not a delay to tune away: a device that has already missed twice has earned the caution.
  const recovering = run([...Array(6).fill(slow), ...Array(30).fill(fast)], 'high', 'high');
  assert(recovering.tier === 'medium', `partway through recovery it should be at medium, got ${recovering.tier}`);

  const recovered = run([...Array(6).fill(slow), ...Array(60).fill(fast)], 'high', 'high');
  assert(recovered.tier === 'high', `a device that stays cool should reach its ceiling again, got ${recovered.tier}`);
  console.log('a device that throttles and recovers climbs back, with backoff ✓');

  // ---- Budgets are ordered ----------------------------------------------------------------------
  assert(frameBudgetMs('high') < frameBudgetMs('medium'), 'a high tier targets a tighter frame');
  assert(TIERS.join() === 'low,medium,high', 'tiers are ordered worst to best');
  console.log('budgets and tier ordering are sane ✓');

  console.log('\nM29 SMOKE PASSED');
}

main().catch((e) => { console.error('M29 SMOKE FAILED:', e); process.exit(1); });
