'use client';

import { useSyncExternalStore } from 'react';
import type { QualityTier } from '@/lib/three/capability';
import { initialState, step, type AdaptiveState } from '@/lib/three/adaptive';
import { reportClientEvent } from '@/lib/telemetry-client';

/**
 * The tier every 3D surface actually renders at (Phase 4 M29).
 *
 * One value for the whole tab, deliberately. If each viewer adapted on its own, a page showing
 * four fabrics would end up rendering them at four different qualities — which is exactly the
 * comparison the Comparison Studio exists to make fair. They share a GPU, so they share a
 * verdict.
 */

let state: AdaptiveState | null = null;
let ceiling: QualityTier = 'high';
let current: QualityTier = 'high';
let locked = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

/**
 * `locked` is for a tier that was asked for by name. Adaptation exists to protect a visitor
 * from a guess that was wrong; a stated preference is not a guess, and a QA pass that asked
 * for `high` on a slow machine needs to see high, not what the machine would rather draw.
 */
export function primeQuality(tier: QualityTier, lock = false): void {
  if (state) return;
  ceiling = tier;
  current = tier;
  locked = lock;
  state = initialState(tier);
}

/** Feed one second of measurement in. Returns true when the tier moved. */
export function recordFrameSample(worstFrameMs: number): boolean {
  if (!state || locked) return false;
  const decision = step(state, worstFrameMs, ceiling);
  state = decision.state;
  if (!decision.changed) return false;

  current = decision.tier;
  if (decision.reason === 'too-slow') {
    reportClientEvent('three.slow', { from: ceiling, to: decision.tier, worstFrameMs: Math.round(worstFrameMs) });
  }
  emit();
  return true;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test seam, so a smoke can put the tab back to a known state. */
export function __resetQuality(): void {
  state = null;
  locked = false;
  ceiling = 'high';
  current = 'high';
  emit();
}

export function useEffectiveTier(fallback: QualityTier): QualityTier {
  return useSyncExternalStore(
    subscribe,
    () => (state ? current : fallback),
    () => fallback
  );
}
