import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getContainer } from '@/server/container';
import { PortalDashboard } from '@/components/portal/PortalDashboard';

/** Dealer portal (Priority 6). Server-rendered from the dealer service; requires sign-in. */
export default async function PortalPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin?next=/portal');

  const { dealerService: svc, sampleService, customerService, collectionService } = getContainer();
  const uid = session.user.id;
  const [account, stats, favourites, collections, recent, downloads, quotes, samples] = await Promise.all([
    customerService.account(uid),
    svc.dashboard(uid),
    svc.listFavourites(uid),
    collectionService.list(uid),
    svc.listRecent(uid),
    svc.listDownloads(uid),
    svc.listQuotes(uid),
    sampleService.list({ userId: uid }),
  ]);
  const { user, profile, addresses, contacts } = account;

  return (
    <PortalDashboard
      user={{ name: user.name, email: user.email, role: user.role, approved: user.approved, emailVerified: !!user.emailVerifiedAt }}
      addresses={JSON.parse(JSON.stringify(addresses))}
      contacts={JSON.parse(JSON.stringify(contacts))}
      profile={JSON.parse(JSON.stringify(profile))}
      stats={stats}
      favourites={JSON.parse(JSON.stringify(favourites))}
      collections={JSON.parse(JSON.stringify(collections))}
      recent={JSON.parse(JSON.stringify(recent))}
      downloads={JSON.parse(JSON.stringify(downloads))}
      quotes={JSON.parse(JSON.stringify(quotes))}
      samples={JSON.parse(JSON.stringify(samples))}
    />
  );
}
