/**
 * Relative-time labels for the dashboard (Phase 3 M14).
 *
 * Computed on the server against a single `now` per request, then shipped as plain strings.
 * Reading the clock during a client render would be impure — it makes the markup depend on
 * when React happens to re-render and can disagree with the server's HTML on hydration.
 */

const DAY = 86_400_000;

/** "today" · "yesterday" · "5 days ago" · a date once it stops being recent. */
export function relativePast(when: Date, now: Date): string {
  const days = Math.floor((now.getTime() - when.getTime()) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return when.toISOString().slice(0, 10);
}

/** "overdue" · "today" · "tomorrow" · "in 6 days". */
export function relativeFuture(when: Date, now: Date): string {
  const days = Math.ceil((when.getTime() - now.getTime()) / DAY);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

export function isOverdue(when: Date, now: Date): boolean {
  return when.getTime() < now.getTime();
}
