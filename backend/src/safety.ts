import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Db } from './db';
import { coded } from './errors';

type Tx = Prisma.TransactionClient;

/** Blocking and reporting people (App Store guideline 1.2, Google Play UGC policy). */
@Injectable()
export class Safety {
  constructor(private db: Db) {}

  /** Everyone I blocked or who blocked me: neither side sees the other's listings or can reach them. */
  async hiddenPeople(userId: string, tx: Tx = this.db) {
    const rows = await tx.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return [...new Set(rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)))];
  }

  /** 'me' if I blocked them, 'them' if they blocked me, null if neither. */
  async between(userId: string, otherId: string, tx: Tx = this.db) {
    const rows = await tx.block.findMany({
      where: { OR: [{ blockerId: userId, blockedId: otherId }, { blockerId: otherId, blockedId: userId }] },
      select: { blockerId: true },
    });
    if (rows.some((r) => r.blockerId === userId)) return 'me' as const;
    return rows.length ? ('them' as const) : null;
  }

  /** Stop any new contact between two people. The wording doesn't reveal who blocked whom. */
  async assertCanContact(userId: string, otherId: string, tx: Tx = this.db) {
    const state = await this.between(userId, otherId, tx);
    if (state === 'me') throw new ForbiddenException(coded('BLOCKED', 'You blocked this person. Unblock them under You → Blocked people to chat again.'));
    if (state === 'them') throw new ForbiddenException(coded('BLOCKED', "You can't contact this person."));
  }

  list(userId: string) {
    return this.db.block
      .findMany({ where: { blockerId: userId }, include: { blocked: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } })
      .then((rows) => rows.map((r) => ({ id: r.blocked.id, name: r.blocked.name, blockedAt: r.createdAt })));
  }

  async block(userId: string, otherId: string) {
    if (userId === otherId) throw new BadRequestException("You can't block yourself.");
    if (!(await this.db.user.findUnique({ where: { id: otherId }, select: { id: true } }))) throw new NotFoundException(coded('NOT_FOUND', 'Person not found.'));
    await this.db.block.upsert({ where: { blockerId_blockedId: { blockerId: userId, blockedId: otherId } }, create: { blockerId: userId, blockedId: otherId }, update: {} });
    return { blocked: true };
  }

  async unblock(userId: string, otherId: string) {
    await this.db.block.deleteMany({ where: { blockerId: userId, blockedId: otherId } });
    return { blocked: false };
  }

  /** Report a person, optionally from a chat they're both in; moderators see it in the review queue. */
  async report(userId: string, otherId: string, reason: string, conversationId?: string) {
    if (userId === otherId) throw new BadRequestException("You can't report yourself.");
    if (!(await this.db.user.findUnique({ where: { id: otherId }, select: { id: true } }))) throw new NotFoundException(coded('NOT_FOUND', 'Person not found.'));
    if (conversationId) {
      const c = await this.db.conversation.findUnique({ where: { id: conversationId }, select: { buyerId: true, sellerId: true } });
      const pair = c ? [c.buyerId, c.sellerId] : [];
      if (!pair.includes(userId) || !pair.includes(otherId)) throw new ForbiddenException('This chat is private.');
    }
    await this.db.userReport.create({ data: { reporterId: userId, reportedId: otherId, reason: reason.trim(), conversationId } });
    return { reported: true };
  }

  /** Open user reports for moderators, newest first, with the last messages of the chat for context. */
  async openReports() {
    const reports = await this.db.userReport.findMany({
      where: { resolvedAt: null },
      include: { reporter: { select: { id: true, name: true } }, reported: { select: { id: true, name: true, deletedAt: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return Promise.all(
      reports.map(async (r) => ({
        ...r,
        messages: r.conversationId
          ? (await this.db.message.findMany({ where: { conversationId: r.conversationId, type: { in: ['TEXT', 'OFFER'] } }, orderBy: { createdAt: 'desc' }, take: 20, select: { senderId: true, type: true, text: true, amount: true, createdAt: true } })).reverse()
          : [],
      })),
    );
  }

  async resolve(reportId: string) {
    const found = await this.db.userReport.findUnique({ where: { id: reportId }, select: { id: true } });
    if (!found) throw new NotFoundException(coded('NOT_FOUND', 'Report not found.'));
    return this.db.userReport.update({ where: { id: reportId }, data: { resolvedAt: new Date() } });
  }
}
