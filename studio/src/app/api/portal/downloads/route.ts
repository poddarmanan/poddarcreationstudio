import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { run, parseJson } from '@/server/core/http';
import { requireUser } from '@/server/core/session';

const Input = z.object({
  kind: z.enum(['SPEC', 'CATALOGUE']),
  fabricId: z.string().nullish(),
  colourId: z.string().nullish(),
});

export async function GET(req: Request) {
  return run(req, async () => {
    const user = await requireUser();
    const downloads = await getContainer().dealerService.listDownloads(user.id);
    return NextResponse.json({ downloads });
  });
}

export async function POST(req: Request) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const { kind, fabricId, colourId } = await parseJson(req, Input);
      const download = await getContainer().dealerService.recordDownload(user.id, kind, fabricId ?? null, colourId ?? null);
      return NextResponse.json({ download }, { status: 201 });
    },
    { csrf: true }
  );
}
