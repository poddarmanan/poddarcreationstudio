import { AppError } from './errors';
import { requireUser, type SessionUser } from './session';

/**
 * Role policy (Phase 3 M12). The single authority on "who may do what", so authorisation
 * is one import instead of a role string literal copied across routes and pages.
 *
 * Two populations use the platform and they must never overlap:
 *   • **Staff**    — ADMIN / MANAGER / SALES run the business (catalogue, quotes, samples).
 *   • **Customers** — BUYER / VIEWER browse, save, and request. They can only ever read and
 *     write rows they own, and are refused by every staff surface.
 */

export const ROLES = ['ADMIN', 'MANAGER', 'SALES', 'VIEWER', 'BUYER'] as const;
export type RoleName = (typeof ROLES)[number];

/** Runs the business: catalogue, quote desk, sample desk, sales workspace. */
export const STAFF_ROLES: readonly string[] = ['ADMIN', 'MANAGER', 'SALES'];
/** Owns configuration and destructive catalogue operations. */
export const ADMIN_ROLES: readonly string[] = ['ADMIN', 'MANAGER'];
/** Customer-side accounts. Never granted staff surfaces. */
export const CUSTOMER_ROLES: readonly string[] = ['BUYER', 'VIEWER'];

export function isStaff(role: string | undefined | null): boolean {
  return !!role && STAFF_ROLES.includes(role);
}

export function isAdmin(role: string | undefined | null): boolean {
  return !!role && ADMIN_ROLES.includes(role);
}

export function isCustomer(role: string | undefined | null): boolean {
  return !!role && CUSTOMER_ROLES.includes(role);
}

/** Authenticated staff member, else 401/403. */
export async function requireStaff(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isStaff(user.role)) throw AppError.forbidden('Staff access required');
  return user;
}

/** Authenticated admin/manager, else 401/403. Use for destructive or configuration actions. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdmin(user.role)) throw AppError.forbidden('Admin or manager role required');
  return user;
}

/**
 * The acting user must either own `ownerId` or be staff. Returns the actor plus whether
 * they arrived as staff, so services can widen a response for the sales team without
 * duplicating the ownership check.
 */
export async function requireSelfOrStaff(ownerId: string): Promise<{ user: SessionUser; asStaff: boolean }> {
  const user = await requireUser();
  if (user.id === ownerId) return { user, asStaff: false };
  if (isStaff(user.role)) return { user, asStaff: true };
  throw AppError.forbidden();
}

/**
 * Guard for a resource that already carries an owner id. Throws 404 rather than 403 when a
 * customer reaches for someone else's row, so the API never confirms that the id exists.
 */
export function assertOwned(row: { userId?: string | null } | null | undefined, userId: string, message = 'Not found'): void {
  if (!row || row.userId !== userId) throw AppError.notFound(message);
}

/** Where a signed-in user belongs after auth: staff land in the workspace, customers in the portal. */
export function homePathForRole(role: string | undefined | null): string {
  return isStaff(role) ? '/admin' : '/portal';
}
