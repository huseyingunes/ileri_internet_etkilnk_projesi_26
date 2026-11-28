import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  type OnModuleInit,
  Param,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { publicIdSchema } from '@etkinlik/shared';
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentUser, Roles } from '../../common/auth/public.decorator.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.js';
import { ZodPipe } from '../../common/validation/zod.pipe.js';
import { type JobHandler, JobRegistry } from '../../infra/queue.js';
import { EventsModule } from '../events/events.module.js';
import {
  ApplicationsPersonalData,
  AttendancePersonalData,
  FeedbackPersonalData,
  IdentityPersonalData,
  NotificationsPersonalData,
  ScoringPersonalData,
  VotingPersonalData,
} from './contributors.js';
import { DATA_REQUEST_JOB, DataRequestsService } from './data-requests.service.js';

const createSchema = z.strictObject({ kind: z.enum(['export', 'delete']) });

@Controller('me/data-requests')
@Roles('student', 'advisor', 'admin')
export class DataRequestsController {
  constructor(private readonly requests: DataRequestsService) {}

  @Get()
  list(@CurrentUser() auth: AuthContext, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return this.requests.list(auth);
  }

  @Post()
  @RateLimit({ name: 'data-requests', limit: 5, windowSeconds: 3600, by: 'user' })
  async create(
    @CurrentUser() auth: AuthContext,
    @Body(new ZodPipe(createSchema)) body: z.output<typeof createSchema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { created, request } = await this.requests.create(auth, body.kind);
    response.status(created ? 202 : 200).setHeader('Cache-Control', 'no-store');
    if (created) response.setHeader('Location', `/api/v1/me/data-requests/${request.id}`);
    return request;
  }

  @Get(':id/download')
  async download(
    @CurrentUser() auth: AuthContext,
    @Param('id', new ZodPipe(publicIdSchema)) id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const body = await this.requests.download(auth, id);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Disposition', 'attachment; filename="verilerim.json"');
    return new StreamableFile(body, { type: 'application/json; charset=utf-8' });
  }
}

/** Worker handler for queued requests. */
@Injectable()
export class DataRequestJob implements JobHandler, OnModuleInit {
  readonly jobName = DATA_REQUEST_JOB;
  constructor(
    private readonly requests: DataRequestsService,
    private readonly registry: JobRegistry,
  ) {}
  onModuleInit(): void {
    this.registry.register(this);
  }
  async handle(data: unknown): Promise<void> {
    const { requestId } = z.object({ requestId: z.string().regex(/^[0-9]+$/) }).parse(data);
    await this.requests.process(BigInt(requestId));
  }
}

const contributors = [
  IdentityPersonalData,
  ApplicationsPersonalData,
  VotingPersonalData,
  AttendancePersonalData,
  ScoringPersonalData,
  FeedbackPersonalData,
  NotificationsPersonalData,
];

@Module({
  imports: [EventsModule],
  controllers: [DataRequestsController],
  providers: [DataRequestsService, ...contributors],
  exports: [DataRequestsService],
})
export class PrivacyModule {}

@Module({ imports: [PrivacyModule], providers: [DataRequestJob] })
export class PrivacyJobsModule {}
