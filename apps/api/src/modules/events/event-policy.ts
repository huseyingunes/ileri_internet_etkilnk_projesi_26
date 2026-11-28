import type { EventStatus, Role } from '@etkinlik/shared';

/** Pure authorization and state rules for events (framework independent). */

export interface EventFacts {
  status: EventStatus;
  createdBy: bigint;
  advisor: bigint | null;
}

export interface Caller {
  userId: bigint;
  role: Role;
}

export const PUBLIC_STATUSES: readonly EventStatus[] = [
  'pool',
  'scheduled',
  'completed',
  'cancelled',
];

export function canView(event: EventFacts, caller: Caller): boolean {
  return (
    caller.role === 'admin' ||
    PUBLIC_STATUSES.includes(event.status) ||
    event.createdBy === caller.userId ||
    event.advisor === caller.userId
  );
}

const isAdvisorOf = (event: EventFacts, caller: Caller) =>
  caller.role === 'advisor' && event.advisor === caller.userId;

/** Who may edit, and in which states. Finished or cancelled events are frozen. */
export function canEdit(event: EventFacts, caller: Caller): boolean {
  if (event.status === 'completed' || event.status === 'cancelled') return false;
  if (caller.role === 'admin') return true;
  if (isAdvisorOf(event, caller)) return true;
  return (
    event.createdBy === caller.userId &&
    (event.status === 'pending_approval' || event.status === 'rejected' || event.status === 'pool')
  );
}

/** Fields that may still change once an event is on the calendar. */
export const SCHEDULED_EDITABLE = new Set(['description', 'participationRequirements', 'tags']);

export function canReview(event: EventFacts, caller: Caller): boolean {
  return (
    event.status === 'pending_approval' && (caller.role === 'admin' || isAdvisorOf(event, caller))
  );
}

export function canCancel(event: EventFacts, caller: Caller): boolean {
  if (event.status === 'completed' || event.status === 'cancelled') return false;
  return caller.role === 'admin' || isAdvisorOf(event, caller);
}

/** Photo gallery: the related advisor and admins (prompt section 2). */
export function canManagePhotos(event: EventFacts, caller: Caller): boolean {
  return caller.role === 'admin' || isAdvisorOf(event, caller);
}

/** Student proposals need advisor approval; advisors' and admins' go straight to the pool. */
export function initialStatus(role: Role): EventStatus {
  return role === 'student' ? 'pending_approval' : 'pool';
}
