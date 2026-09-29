import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { run, parseJson } from '@/server/core/http';
import { AppError } from '@/server/core/errors';
import { RATE_LIMITS } from '@/server/core/rate-limit';
import { normalizeWhatsapp, formatWhatsapp } from '@/server/whatsapp/otp.service';

const Start = z.object({ whatsapp: z.string().min(6).max(30) });

/**
 * Starts signing in with WhatsApp: sends a six-digit code to the number. The code is then given to
 * the "whatsapp" credentials provider, which signs the buyer in — or, for a number no account has,
 * asks for their name and company and creates one.
 *
 * Where no WhatsApp provider is configured (development), the code comes back as `devCode`.
 */
export async function POST(req: Request) {
  return run(
    req,
    async () => {
      const { whatsapp } = await parseJson(req, Start);
      const phone = normalizeWhatsapp(whatsapp);
      if (!phone) throw AppError.validation('Enter a WhatsApp number with its country code.');
      const { devCode } = await getContainer().otpService.start(phone);
      return NextResponse.json({ sent: true, to: formatWhatsapp(phone), ...(devCode ? { devCode } : {}) });
    },
    { csrf: true, rateLimit: RATE_LIMITS.otp },
  );
}

/** Whether WhatsApp sign-in can send codes here, so the page can say so before a number is typed. */
export async function GET(req: Request) {
  return run(req, async () => {
    const { otpService } = getContainer();
    return NextResponse.json({ ready: otpService.ready });
  });
}
