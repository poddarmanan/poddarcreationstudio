import { SignInScreen } from '@/components/auth/SignInScreen';

/**
 * Server wrapper so this route renders dynamically (Phase 4).
 *
 * Prerendered statically, Next's inline bootstrap scripts carry no nonce, and the per-request
 * CSP nonce from `proxy.ts` then refuses them — the page never hydrates and the form never
 * appears. Rendering dynamically lets Next stamp the request's nonce into the markup. There is
 * nothing to cache here anyway; the form is the whole page.
 */
export const dynamic = 'force-dynamic';

export default function Page() {
  return <SignInScreen />;
}
