import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getContainer } from '@/server/container';
import { PortalDashboard } from '@/components/portal/PortalDashboard';

/** Dealer portal (Priority 6). Server-rendered from the dealer service; requires sign-in. */
export default async function PortalPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin?next=/portal');

  const { dealerService: svc, sampleService } = getContainer();
  const uid = session.user.id;
  const [profile, stats, favourites, collections, recent, downloads, quotes, samples] = await Promise.all([
    svc.getProfile(uid),
    svc.dashboard(uid),
    svc.listFavourites(uid),
    svc.listCollections(uid),
    svc.listRecent(uid),
    svc.listDownloads(uid),
    svc.listQuotes(uid),
    sampleService.list({ userId: uid }),
  ]);

  return (
    <PortalDashboard
      user={{ name: session.user.name ?? 'Dealer', email: session.user.email ?? '', role: session.user.role, approved: session.user.approved }}
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
