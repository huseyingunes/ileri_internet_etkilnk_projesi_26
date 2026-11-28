import { Injectable } from '@nestjs/common';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { DatabaseService } from '../../infra/database.js';
import { EventsService } from '../events/events.service.js';

/** An inferred interest counts for invitations once it was reinforced this often. */
const INFERRED_THRESHOLD = 2;

/**
 * Student interests (prompt section 2, item 12): tags the student selects,
 * plus tags inferred from votes, attendance and good ratings. Owns
 * user_interests; tag ids come from the events module.
 */
@Injectable()
export class InterestsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
  ) {}

  async list(caller: AuthContext): Promise<{ selected: string[]; inferred: string[] }> {
    const rows = await this.db.user_interests.findMany({
      where: { user_id: caller.userId },
      include: { tags: { select: { name: true } } },
      orderBy: [{ weight: 'desc' }, { tag_id: 'asc' }],
    });
    return {
      selected: rows.filter((r) => r.source === 'selected').map((r) => r.tags.name),
      inferred: rows.filter((r) => r.source === 'inferred').map((r) => r.tags.name),
    };
  }

  /** Replaces the selected tags; inferred ones stay (a re-selected inferred tag becomes selected). */
  async replaceSelected(caller: AuthContext, names: readonly string[]) {
    const tagIds = await this.events.ensureTags(names);
    await this.db.$transaction(async (tx) => {
      await tx.user_interests.deleteMany({
        where: { user_id: caller.userId, source: 'selected', tag_id: { notIn: tagIds } },
      });
      for (const tagId of tagIds) {
        await tx.user_interests.upsert({
          where: { user_id_tag_id: { user_id: caller.userId, tag_id: tagId } },
          create: { user_id: caller.userId, tag_id: tagId, source: 'selected' },
          update: { source: 'selected' },
        });
      }
    });
    return await this.list(caller);
  }

  /**
   * Rewrites inferred interests from signals (votes, attendance, good
   * ratings): weight = number of signals on events carrying the tag. A full
   * rewrite is idempotent, so the nightly job can be retried safely.
   * Selected interests are never touched.
   */
  async recomputeInferred(
    signals: readonly { userId: bigint; eventId: bigint }[],
  ): Promise<number> {
    const tagsByEvent = await this.events.tagIdsOfMany(signals.map((s) => s.eventId));
    const weights = new Map<bigint, Map<bigint, number>>();
    for (const { userId, eventId } of signals) {
      const perUser = weights.get(userId) ?? new Map<bigint, number>();
      for (const tagId of tagsByEvent.get(eventId) ?? [])
        perUser.set(tagId, (perUser.get(tagId) ?? 0) + 1);
      weights.set(userId, perUser);
    }
    await this.db.$transaction(async (tx) => {
      await tx.user_interests.deleteMany({ where: { source: 'inferred' } });
      const selected = await tx.user_interests.findMany({
        where: { source: 'selected' },
        select: { user_id: true, tag_id: true },
      });
      const isSelected = new Set(
        selected.map((r) => `${r.user_id.toString()}:${r.tag_id.toString()}`),
      );
      const data = [...weights.entries()].flatMap(([userId, tags]) =>
        [...tags.entries()]
          .filter(([tagId]) => !isSelected.has(`${userId.toString()}:${tagId.toString()}`))
          .map(([tagId, weight]) => ({
            user_id: userId,
            tag_id: tagId,
            source: 'inferred',
            weight,
          })),
      );
      await tx.user_interests.createMany({ data, skipDuplicates: true });
    });
    return weights.size;
  }

  /** Students whose selected (or sufficiently inferred) interests overlap the tags. */
  async studentsInterestedIn(tagIds: readonly bigint[]): Promise<Map<bigint, bigint[]>> {
    if (tagIds.length === 0) return new Map();
    const rows = await this.db.user_interests.findMany({
      where: {
        tag_id: { in: [...tagIds] },
        users: { role: 'student', is_active: true, anonymized_at: null },
        OR: [{ source: 'selected' }, { weight: { gte: INFERRED_THRESHOLD } }],
      },
      select: { user_id: true, tag_id: true },
    });
    const byUser = new Map<bigint, bigint[]>();
    for (const row of rows)
      byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row.tag_id]);
    return byUser;
  }
}
