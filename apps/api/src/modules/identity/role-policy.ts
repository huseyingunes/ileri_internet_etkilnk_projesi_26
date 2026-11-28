import type { Role } from '@etkinlik/shared';

/**
 * Role of a user at first login. The application is the source of truth for
 * roles afterwards (admins change them); the IdP claim only seeds demo users.
 * The configured initial administrator always becomes an admin.
 */
export function initialRole(input: {
  email: string;
  claimedRole: Role | undefined;
  initialAdminEmail: string;
}): Role {
  if (input.email === input.initialAdminEmail) {
    return 'admin';
  }
  return input.claimedRole ?? 'student';
}

/** Whether a role change or deactivation would leave the system without an active admin. */
export function removesLastAdmin(input: {
  currentRole: Role;
  nextRole: Role;
  currentlyActive: boolean;
  nextActive: boolean;
  activeAdminCount: number;
}): boolean {
  const isActiveAdminNow = input.currentRole === 'admin' && input.currentlyActive;
  const staysActiveAdmin = input.nextRole === 'admin' && input.nextActive;
  return isActiveAdminNow && !staysActiveAdmin && input.activeAdminCount <= 1;
}
