import type { Role } from '@etkinlik/shared';
// Loads pino-http's `IncomingMessage.id` augmentation.
import type {} from 'pino-http';

/** Who is calling, resolved by AuthGuard from the server-side session. */
export interface AuthContext {
  userId: bigint;
  publicId: string;
  role: Role;
  sessionToken: string;
}

declare module 'http' {
  interface IncomingMessage {
    auth?: AuthContext;
  }
}
