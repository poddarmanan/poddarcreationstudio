import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { isStaff } from '@/server/core/rbac';
import { getContainer } from '@/server/container';
import { SalesWorkspace } from '@/components/admin/SalesWorkspace';

/** Sales workspace (Phase 3 M16): pipeline, overdue reminders, samples, customers. */
export default async function SalesWorkspacePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin?next=/admin/sales');
  if (!isStaff(session.user.role)) redirect('/');

  const svc = getContainer().salesService;
  const [pipeline, customers] = await Promise.all([svc.pipeline(), svc.customers()]);

  return <SalesWorkspace pipeline={JSON.parse(JSON.stringify(pipeline))} customers={JSON.parse(JSON.stringify(customers))} />;
}
