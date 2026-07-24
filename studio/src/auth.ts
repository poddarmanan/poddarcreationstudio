import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getContainer } from '@/server/container';
import { RATE_LIMITS } from '@/server/core/rate-limit';

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
  ],
  callbacks: {
    jwt({ token, user }) {
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
