import { NextResponse } from 'next/server';
import { getContainer } from '@/server/container';
import { run } from '@/server/core/http';
import { AppError } from '@/server/core/errors';
import type { ColourRelationKind } from '@/generated/prisma/enums';

const KINDS: Record<string, ColourRelationKind> = {
  similar: 'SIMILAR',
  complementary: 'COMPLEMENTARY',
  analogous: 'ANALOGOUS',
};

export async function GET(req: Request, ctx: RouteContext<'/api/colours/[id]/related'>) {
  return run(req, async () => {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const kind = KINDS[(url.searchParams.get('kind') ?? 'similar').toLowerCase()];
    if (!kind) throw AppError.validation('kind must be similar, complementary, or analogous');
    const limit = Math.min(24, Math.max(1, Number(url.searchParams.get('limit')) || 6));

    const related = await getContainer().colourService.getRelated(id, kind, limit);
    return NextResponse.json({ related });
  });
}
