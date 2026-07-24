import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getContainer } from '@/server/container';
import { prisma } from '@/lib/prisma';
import { QuoteDesk } from '@/components/admin/QuoteDesk';

/** Staff inquiry desk (Priority 7): triage, assign, and track quotations. */
export default async function AdminQuotesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin?next=/admin/quotes');
  if (!['ADMIN', 'MANAGER', 'SALES'].includes(session.user.role)) redirect('/');

  const [quotes, staff] = await Promise.all([
    getContainer().quoteService.list({}),
    prisma.user.findMany({ where: { role: { in: ['ADMIN', 'MANAGER', 'SALES'] } }, select: { id: true, name: true, role: true }, orderBy: { name: 'asc' } }),
  ]);

  return <QuoteDesk quotes={JSON.parse(JSON.stringify(quotes))} staff={staff} me={{ id: session.user.id, name: session.user.name ?? 'Me' }} />;
}
