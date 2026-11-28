import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../../common/auth/public.decorator.js';
import { ZodPipe } from '../../common/validation/zod.pipe.js';
import { DatabaseService } from '../../infra/database.js';

const tagQuery = z.strictObject({ q: z.string().trim().toLowerCase().min(1).max(50).optional() });

/** Keyword / interest vocabulary shared by events and student interests. */
@Controller('tags')
export class TagsController {
  constructor(private readonly db: DatabaseService) {}

  @Roles('student', 'advisor', 'admin')
  @Get()
  async list(@Query(new ZodPipe(tagQuery)) query: z.output<typeof tagQuery>) {
    const rows = await this.db.tags.findMany({
      where: query.q === undefined ? {} : { name: { startsWith: query.q } },
      orderBy: { name: 'asc' },
      take: 100,
      select: { name: true },
    });
    return { items: rows.map((row) => row.name) };
  }
}
