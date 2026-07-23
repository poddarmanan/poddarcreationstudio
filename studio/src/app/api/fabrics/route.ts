import { NextResponse } from 'next/server';
import { getContainer } from '@/server/container';
import { run } from '@/server/core/http';

export async function GET(req: Request) {
  return run(req, async () => {
    const fabrics = await getContainer().fabricService.listCatalogue();
    return NextResponse.json({ fabrics });
  });
}
