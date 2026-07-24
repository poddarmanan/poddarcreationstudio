import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { isAdmin } from '@/server/core/rbac';
import { getContainer } from '@/server/container';
import { mediaUrl } from '@/lib/storage';
import { CatalogueOps } from '@/components/admin/CatalogueOps';

/** Catalogue Ops (Priority 11): bulk media ops, upload queue + retry, CSV, activity feed. */
export default async function AdminCataloguePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin?next=/admin/catalogue');
  if (!isAdmin(session.user.role)) redirect('/');

  const { adminService } = getContainer();
  const [{ media, nextCursor }, jobs, feed, fabrics] = await Promise.all([
    adminService.listMedia({ includeDeleted: true, take: 40 }),
    adminService.listUploadJobs(20),
    adminService.activity(25),
    getContainer().fabricService.listCatalogue(),
  ]);

  return (
    <CatalogueOps
      media={JSON.parse(JSON.stringify(media.map((m) => ({ ...m, thumbUrl: mediaUrl(m.thumbPath) }))))}
      nextCursor={nextCursor}
      jobs={JSON.parse(JSON.stringify(jobs))}
      activity={JSON.parse(JSON.stringify(feed.events))}
      fabrics={fabrics.map((f) => ({ id: f.id, name: f.name }))}
    />
  );
}
