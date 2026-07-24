import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getContainer } from '@/server/container';
import { PortalDashboard } from '@/components/portal/PortalDashboard';

/**
 * Customer dashboard (Priority 6; expanded in Phase 3 M14). Every panel is assembled by
 * `DashboardService` in one parallel read, so the page is a single database round trip.
 */
export default async function PortalPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin?next=/portal');

  const { dashboardService, customerService } = getContainer();
  const uid = session.user.id;
  const [account, dashboard] = await Promise.all([customerService.account(uid), dashboardService.forUser(uid)]);
  const { user, profile, addresses, contacts } = account;

  // Prisma rows carry Date objects; the dashboard is a client component, so serialise once.
  const json = <T,>(value: T) => JSON.parse(JSON.stringify(value));

  return (
    <PortalDashboard
      user={{ name: user.name, email: user.email, role: user.role, approved: user.approved, emailVerified: !!user.emailVerifiedAt }}
      addresses={json(addresses)}
      contacts={json(contacts)}
      profile={json(profile)}
      stats={dashboard.stats}
      favourites={json(dashboard.favourites)}
      collections={json(dashboard.collections)}
      recent={json(dashboard.recent)}
      downloads={json(dashboard.downloads)}
      quotes={json(dashboard.quotes)}
      samples={json(dashboard.samples)}
      activity={json(dashboard.activity)}
      followUps={json(dashboard.followUps)}
      recommendations={json(dashboard.recommendations)}
      notifications={json(dashboard.notifications)}
      unread={dashboard.unread}
      notificationPreferences={dashboard.notificationPreferences}
    />
  );
}
