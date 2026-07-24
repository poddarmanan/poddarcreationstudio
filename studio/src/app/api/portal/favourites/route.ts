import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { run, parseJson } from '@/server/core/http';
import { requireUser } from '@/server/core/session';

const Input = z.object({ fabricId: z.string(), colourId: z.string().nullish() });

export async function GET(req: Request) {
  return run(req, async () => {
    const user = await requireUser();
    const favourites = await getContainer().dealerService.listFavourites(user.id);
    return NextResponse.json({ favourites });
  });
}

export async function POST(req: Request) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const { fabricId, colourId } = await parseJson(req, Input);
      const favourite = await getContainer().dealerService.addFavourite(user.id, fabricId, colourId ?? null);
      return NextResponse.json({ favourite }, { status: 201 });
    },
    { csrf: true }
  );
}
