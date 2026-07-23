import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
      approved: boolean;
      company?: string;
    } & DefaultSession['user'];
  }

  interface User {
    role: string;
    approved: boolean;
    company?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: string;
    approved?: boolean;
    company?: string;
  }
}
