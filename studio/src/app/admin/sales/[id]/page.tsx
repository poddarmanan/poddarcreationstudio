import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { isStaff } from '@/server/core/rbac';
import { getContainer } from '@/server/container';
import { CustomerProfile } from '@/components/admin/CustomerProfile';

/** One customer's whole story (Phase 3 M16). Staff only. */
export default async function CustomerProfilePage({ params }: PageProps<'/admin/sales/[id]'>) {
  const session = await auth();
  const { id } = await params;
  if (!session?.user?.id) redirect(`/signin?next=/admin/sales/${id}`);
  if (!isStaff(session.user.role)) redirect('/');

  const [customer, staff] = await Promise.all([
    getContainer().salesService.customer(id),
    prisma.user.findMany({ where: { role: { in: ['ADMIN', 'MANAGER', 'SALES'] } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);

  return <CustomerProfile initial={JSON.parse(JSON.stringify(customer))} staff={staff} />;
}
