import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { run, parseJson } from '@/server/core/http';
import { requireUser } from '@/server/core/session';

const Input = z.object({ name: z.string().min(1).max(120), fromSwatchBook: z.boolean().optional() });

export async function GET(req: Request) {
  return run(req, async () => {
    const user = await requireUser();
    const collections = await getContainer().dealerService.listCollections(user.id);
    return NextResponse.json({ collections });
  });
}

export async function POST(req: Request) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const { name, fromSwatchBook } = await parseJson(req, Input);
      const svc = getContainer().dealerService;
      const collection = fromSwatchBook
        ? await svc.collectionFromSwatchBook(user.id, name)
        : await svc.createCollection(user.id, name);
      return NextResponse.json({ collection }, { status: 201 });
    },
    { csrf: true }
  );
}
