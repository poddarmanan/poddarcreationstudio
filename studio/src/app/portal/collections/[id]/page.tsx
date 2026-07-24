import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getContainer } from '@/server/container';
import { CollectionBoard } from '@/components/portal/CollectionBoard';

/** A single saved collection (Phase 3 M13). Server-rendered, owner-scoped. */
export default async function CollectionPage({ params }: PageProps<'/portal/collections/[id]'>) {
  const session = await auth();
  const { id } = await params;
  if (!session?.user?.id) redirect(`/signin?next=/portal/collections/${id}`);

  const { collectionService, shareService } = getContainer();
  const [collection, shares] = await Promise.all([
    collectionService.get(session.user.id, id),
    shareService.list(session.user.id, id),
  ]);

  return (
    <CollectionBoard
      initial={JSON.parse(JSON.stringify(collection))}
      canQuote={collection.items.length > 0}
      shares={JSON.parse(JSON.stringify(shares))}
    />
  );
}
