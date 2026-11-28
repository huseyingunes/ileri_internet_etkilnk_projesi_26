import { Global, Module } from '@nestjs/common';
import { AuditQueryService } from './audit-query.service.js';
import { AuditService } from './audit.service.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { ConsentsService } from './consents.service.js';
import { LoginStateStore } from './login-state.store.js';
import { OidcService } from './oidc.service.js';
import { SessionStore } from './session.store.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

/** Identity and authorization: OIDC login, sessions, users, roles, consents, audit log. */
@Global()
@Module({
  controllers: [AuthController, UsersController],
  providers: [
    AuditQueryService,
    AuditService,
    AuthGuard,
    ConsentsService,
    LoginStateStore,
    OidcService,
    SessionStore,
    UsersService,
  ],
  exports: [AuditService, AuthGuard, ConsentsService, SessionStore, UsersService],
})
export class IdentityModule {}
