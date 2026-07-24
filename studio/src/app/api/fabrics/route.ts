import { NextResponse } from 'next/server';
import { getContainer } from '@/server/container';
import { run } from '@/server/core/http';

export async function GET(req: Request) {
  return run(req, async () => {
    const fabrics = await getContainer().fabricService.listCatalogue();
    // Edge/CDN caching (Priority 12): the catalogue changes rarely; serve stale while
    // revalidating so a CDN absorbs the read traffic at 100k-SKU scale.
    return NextResponse.json(
      { fabrics },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } }
    );
  });
}
