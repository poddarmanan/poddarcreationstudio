'use client';

import { useSyncExternalStore } from 'react';
import { detectCapability, SERVER_CAPABILITY, type Capability } from '@/lib/three/capability';

/** Capability never changes within a page load, so there is nothing to subscribe to. */
const subscribe = () => () => {};

/**
 * The device's 3D capability, safe to read during render.
 *
 * Reading `detectCapability()` directly in a component would be a hydration mismatch on every
 * page — the server has no GPU and says "off" while the browser says "high". Going through
 * `useSyncExternalStore` lets React render the server's answer for hydration and then
 * reconcile to the real one, which is exactly the shape this problem has.
 */
export function useCapability(): Capability {
  return useSyncExternalStore(subscribe, detectCapability, () => SERVER_CAPABILITY);
}
