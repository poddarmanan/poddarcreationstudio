import { auth } from '@/auth';
import { AppError } from './errors';

export interface SessionUser {
  id: string;
  role: string;
  approved: boolean;
  name?: string | null;
  email?: string | null;
}

/** Returns the authenticated user or throws 401. Use in routes that require sign-in. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) throw AppError.unauthorized();
  return { id: session.user.id, role: session.user.role, approved: session.user.approved, name: session.user.name, email: session.user.email };
}

/** Returns the authenticated user only if their role is allowed, else throws 401/403. */
export async function requireRole(roles: string[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw AppError.forbidden();
  return user;
}
