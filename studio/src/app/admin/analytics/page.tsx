import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { isStaff } from '@/server/core/rbac';
import { getContainer } from '@/server/container';
import { AnalyticsDashboard } from '@/components/admin/AnalyticsDashboard';

/** Business analytics (Phase 3 M18). Staff only; every figure is a database aggregate. */
export default async function AnalyticsPage({ searchParams }: PageProps<'/admin/analytics'>) {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin?next=/admin/analytics');
  if (!isStaff(session.user.role)) redirect('/');

  const { days } = await searchParams;
  const window = Math.min(Math.max(Number(days) || 30, 7), 365);
  const data = await getContainer().analyticsService.overview(window);

  return <AnalyticsDashboard data={JSON.parse(JSON.stringify(data))} />;
}
