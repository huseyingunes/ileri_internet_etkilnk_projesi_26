import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/**
 * Marks a route as reachable without a session. Every other route is denied by
 * DefaultDenyGuard until Phase 3 adds session and role checks.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
