import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getContainer } from '@/server/container';
import { run } from '@/server/core/http';
import { AppError } from '@/server/core/errors';
import { RATE_LIMITS } from '@/server/core/rate-limit';

/** The shared catalogue as a PDF (Phase 3 M17). Honours the password gate and `allowDownload`. */
export async function GET(req: Request, ctx: RouteContext<'/api/share/[token]/pdf'>) {
  return run(
    req,
    async () => {
      const { token } = await ctx.params;
      const svc = getContainer().shareService;

      let result = await svc.resolve(token);
      if (!result.ok && result.reason === 'PASSWORD_REQUIRED') {
        // The page already proved the passphrase; the ticket carries that proof here.
        const unlocked = await svc.resolveWithTicket(token, (await cookies()).getAll());
        if (unlocked) result = { ok: true, share: unlocked };
      }
      if (!result.ok) throw AppError.notFound('This catalogue is not available');
      if (!result.share.allowDownload) throw AppError.forbidden('Downloads are turned off for this catalogue');

      const pdf = svc.pdf(result.share);
      const filename = result.share.title.replace(/[^\w -]+/g, '').trim().slice(0, 60) || 'catalogue';
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}.pdf"`,
          // A shared catalogue is per-link content; never let a shared cache hold it.
          'Cache-Control': 'private, no-store',
        },
      });
    },
    { rateLimit: RATE_LIMITS.write }
  );
}
