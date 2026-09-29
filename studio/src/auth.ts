import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { normalizeWhatsapp, formatWhatsapp } from '@/server/whatsapp/otp.service';
import { prisma } from '@/lib/prisma';
import { getContainer } from '@/server/container';
import { RATE_LIMITS } from '@/server/core/rate-limit';

/** The WhatsApp code was wrong, spent or expired. */
class BadCode extends CredentialsSignin {
  code = 'bad_code';
}
/** The code is right but no account has this number: the buyer's name and company are needed to make one. */
class NeedsProfile extends CredentialsSignin {
  code = 'needs_profile';
}

/** Accounts made without a password (WhatsApp, Google) get one nobody knows. */
const unusablePassword = () => bcrypt.hash(randomBytes(24).toString('hex'), 10);
/** A WhatsApp-only account has no email; it gets a reserved address that can never receive mail. */
export const whatsappEmail = (phone: string) => `wa-${phone}@whatsapp.invalid`;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Google sign-in is offered once its keys are set (AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET). */
const googleReady = !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: 'jwt' },
  trustHost: true,
  // Secure, httpOnly, SameSite=Lax session cookies (NextAuth defaults); secure flag + the
  // __Secure- cookie prefix are enforced automatically over HTTPS in production.
  useSecureCookies: process.env.NODE_ENV === 'production',
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? credentials.email.trim().toLowerCase() : undefined;
        const password = typeof credentials?.password === 'string' ? credentials.password : undefined;
        if (!email || !password) return null;

        // Throttle repeated login attempts per account (brute-force defense).
        const throttle = getContainer().rateLimiter.check(`${RATE_LIMITS.auth.name}:${email}`, RATE_LIMITS.auth.limit, RATE_LIMITS.auth.windowMs);
        if (!throttle.allowed) {
          console.warn('[auth] login throttled for', email);
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        // Engagement stamp for the sales workspace + returning-customer analytics (M12).
        // Best-effort: a write failure must never block a valid sign-in.
        await getContainer().customerService.recordLogin(user.id);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          approved: user.approved,
          company: user.company ?? undefined,
        };
      },
    }),
    // Signing in with WhatsApp (M46): a code sent to the number proves it. A number no account has
    // becomes a new buyer account once their name (and company) are given with the same code.
    Credentials({
      id: 'whatsapp',
      name: 'WhatsApp',
      credentials: { whatsapp: {}, code: {}, name: {}, company: {}, city: {} },
      async authorize(credentials) {
        const phone = normalizeWhatsapp(str(credentials?.whatsapp));
        const code = str(credentials?.code);
        if (!phone || !code) throw new BadCode();
        const { rateLimiter, otpService, customerService, dealerService, audit } = getContainer();
        const throttle = rateLimiter.check(`${RATE_LIMITS.auth.name}:wa:${phone}`, RATE_LIMITS.auth.limit, RATE_LIMITS.auth.windowMs);
        if (!throttle.allowed) throw new BadCode();

        let user = await otpService.findUser(phone);
        const name = str(credentials?.name);
        if (!user && !name) {
          // Check the code without spending it, so the same code creates the account next.
          if (!(await otpService.check(phone, code, false))) throw new BadCode();
          throw new NeedsProfile();
        }
        if (!(await otpService.check(phone, code, true))) throw new BadCode();

        if (!user) {
          const company = str(credentials?.company) || null;
          user = await prisma.user.create({
            data: { name, email: whatsappEmail(phone), passwordHash: await unusablePassword(), company, whatsapp: phone, whatsappVerifiedAt: new Date(), role: 'BUYER', approved: false },
          });
          await dealerService.upsertProfile(user.id, { company, whatsapp: formatWhatsapp(phone), contactPhone: formatWhatsapp(phone), shippingCity: str(credentials?.city) || null, prefWhatsapp: true });
          await audit.record({ actorId: user.id, action: 'user.register', entity: 'User', entityId: user.id, meta: { via: 'whatsapp' } });
        } else {
          user = await prisma.user.update({ where: { id: user.id }, data: { whatsapp: user.whatsapp ?? phone, whatsappVerifiedAt: new Date() } });
        }
        await customerService.recordLogin(user.id);
        return { id: user.id, name: user.name, email: user.email, role: user.role, approved: user.approved, company: user.company ?? undefined };
      },
    }),
    ...(googleReady ? [Google] : []),
  ],
  callbacks: {
    // A Google account signs in as the buyer with the same email, who is created if new.
    async signIn({ account, profile }) {
      if (account?.provider !== 'google') return true;
      const email = profile?.email?.toLowerCase();
      if (!email || profile?.email_verified === false) return false;
      const existing = await prisma.user.findUnique({ where: { email } });
      if (!existing) {
        const user = await prisma.user.create({
          data: { name: profile?.name || email.split('@')[0], email, passwordHash: await unusablePassword(), emailVerifiedAt: new Date(), role: 'BUYER', approved: false },
        });
        await getContainer().audit.record({ actorId: user.id, action: 'user.register', entity: 'User', entityId: user.id, meta: { via: 'google' } });
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (account?.provider === 'google' && token.email) {
        // The token carries our account, not Google's: its id, role and approval.
        const db = await prisma.user.findUnique({ where: { email: token.email.toLowerCase() } });
        if (db) {
          token.sub = db.id;
          token.name = db.name;
          token.role = db.role;
          token.approved = db.approved;
          token.company = db.company ?? undefined;
          await getContainer().customerService.recordLogin(db.id);
        }
        return token;
      }
      if (user) {
        token.role = user.role;
        token.approved = user.approved;
        token.company = user.company;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.role = token.role as string;
        session.user.approved = token.approved as boolean;
        session.user.company = token.company as string | undefined;
      }
      return session;
    },
  },
});
