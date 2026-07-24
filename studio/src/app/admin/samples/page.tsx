import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { isStaff } from '@/server/core/rbac';
import { getContainer } from '@/server/container';
import { SampleDesk } from '@/components/admin/SampleDesk';

/** Staff sample desk (Priority 8): approve, dispatch with courier + tracking, deliver. */
export default async function AdminSamplesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin?next=/admin/samples');
  if (!isStaff(session.user.role)) redirect('/');

  const samples = await getContainer().sampleService.list({});
  return <SampleDesk samples={JSON.parse(JSON.stringify(samples))} />;
}
