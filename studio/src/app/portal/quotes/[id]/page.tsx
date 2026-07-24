import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getContainer } from '@/server/container';
import { QuoteTracker } from '@/components/portal/QuoteTracker';

/** Customer quotation tracking (Phase 3 M15). Owner-scoped; internal notes are stripped. */
export default async function QuotePage({ params }: PageProps<'/portal/quotes/[id]'>) {
  const session = await auth();
  const { id } = await params;
  if (!session?.user?.id) redirect(`/signin?next=/portal/quotes/${id}`);

  const quote = await getContainer().quoteService.forCustomer(id, session.user.id);
  return <QuoteTracker initial={JSON.parse(JSON.stringify(quote))} />;
}
