import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Db } from './db';
import { AuthedRequest } from './auth';
import { coded } from './errors';

/** Admins are accounts with a verified email listed in ADMIN_EMAILS (comma-separated), so no address lives in the repo. */
export function isAdminIdentity(identities: { type: string; value: string }[]) {
  const admins = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return identities.some((i) => i.type === 'EMAIL' && admins.includes(i.value.toLowerCase()));
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private db: Db) {}
  async canActivate(context: ExecutionContext) {
    const { userId, trusted } = context.switchToHttp().getRequest<AuthedRequest>();
    // Dev-mode codes are shown to whoever asks, so they never prove the admin owns the email (SEC-001).
    if (!trusted) throw new ForbiddenException(coded('ADMIN_NEEDS_VERIFIED_LOGIN', 'Moderator tools need a login code sent by email or SMS. Please sign in again with your email.'));
    const identities = await this.db.authIdentity.findMany({ where: { userId }, select: { type: true, value: true } });
    if (!isAdminIdentity(identities)) throw new ForbiddenException(coded('NOT_ADMIN', 'Only Havana moderators can do this.'));
    return true;
  }
}

@Injectable()
export class Moderation {
  constructor(private db: Db) {}
  /** Reported items, most-reported first, with every reason so a moderator can judge. */
  async reports() {
    const items = await this.db.item.findMany({
      where: { reports: { some: {} } },
      include: { owner: { select: { id: true, name: true } }, reports: { select: { reason: true, createdAt: true }, orderBy: { createdAt: 'desc' } } },
    });
    return items
      .map(({ reports, ...item }) => ({ ...item, reportCount: reports.length, reports }))
      .sort((a, b) => b.reportCount - a.reportCount || +b.reports[0].createdAt - +a.reports[0].createdAt);
  }
  /** False alarm: show the item again and clear its reports so it doesn't re-hide on the next one. */
  restore(itemId: string) {
    return this.db.atomic(async (tx) => {
      if (!(await tx.item.findUnique({ where: { id: itemId } }))) throw new NotFoundException(coded('NOT_FOUND', 'Item not found.'));
      await tx.report.deleteMany({ where: { itemId } });
      return tx.item.update({ where: { id: itemId }, data: { hidden: false } });
    });
  }
  /** Confirmed problem: take the listing down for everyone. */
  async remove(itemId: string) {
    if (!(await this.db.item.findUnique({ where: { id: itemId } }))) throw new NotFoundException(coded('NOT_FOUND', 'Item not found.'));
    return this.db.item.update({ where: { id: itemId }, data: { status: 'REMOVED', hidden: true } });
  }
}
