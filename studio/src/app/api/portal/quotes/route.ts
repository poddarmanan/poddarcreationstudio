import { NextResponse } from 'next/server';
import { getContainer } from '@/server/container';
import { run } from '@/server/core/http';
import { requireUser } from '@/server/core/session';

export async function GET(req: Request) {
  return run(req, async () => {
    const user = await requireUser();
    const quotes = await getContainer().dealerService.listQuotes(user.id);
    return NextResponse.json({ quotes });
  });
}
