import { cookies, headers } from 'next/headers';
import type { Metadata } from 'next';
import { getContainer } from '@/server/container';
import { PublicCatalogue, CatalogueLock, CatalogueUnavailable } from '@/components/share/PublicCatalogue';

/**
 * A shared catalogue (Phase 3 M17). Public by design — the link is the capability — so this
 * route is deliberately outside every auth guard, and equally deliberately renders nothing
 * beyond the shades themselves.
 */
export const metadata: Metadata = {
  // A shared link should not be indexed: it is private-by-obscurity content, not a public page.
  robots: { index: false, follow: false },
};

export default async function SharedCataloguePage({ params }: PageProps<'/c/[token]'>) {
  const { token } = await params;
  const svc = getContainer().shareService;
  const jar = await cookies();

  let result = await svc.resolve(token);

  // A visitor who already answered the passphrase carries a short-lived ticket.
  if (!result.ok && result.reason === 'PASSWORD_REQUIRED') {
    const unlocked = await svc.resolveWithTicket(token, jar.getAll());
    if (unlocked) result = { ok: true, share: unlocked };
  }

  if (!result.ok) {
    if (result.reason === 'PASSWORD_REQUIRED') return <CatalogueLock token={token} />;
    return <CatalogueUnavailable reason={result.reason} />;
  }

  // Count the open. Best-effort: a view counter must never keep a buyer from seeing the cloth.
  const head = await headers();
  const visitorKey = head.get('x-forwarded-for')?.split(',')[0]?.trim() || head.get('x-real-ip') || null;
  await svc.recordView(result.share.id, visitorKey, head.get('referer')).catch(() => {});

  const url = svc.urlFor(token);
  const qr = await svc.qrDataUrl(url).catch(() => null);

  return <PublicCatalogue share={JSON.parse(JSON.stringify(result.share))} token={token} qr={qr} />;
}
