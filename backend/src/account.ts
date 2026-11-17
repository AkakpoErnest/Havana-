import { Injectable } from '@nestjs/common';
import { Db } from './db';
import { PhotoStore } from './photos';

/** Account deletion (Google Play requirement): personal data goes; shared chat threads stay readable for the other person. */
@Injectable()
export class Accounts {
  constructor(private db: Db, private photos: PhotoStore) {}

  async delete(userId: string) {
    const photos = await this.db.atomic(async (tx) => {
      const [items, uploads] = await Promise.all([
        tx.item.findMany({ where: { ownerId: userId }, select: { photos: true } }),
        tx.upload.findMany({ where: { userId }, select: { path: true } }),
      ]);
      const identities = await tx.authIdentity.findMany({ where: { userId }, select: { value: true } });
      await tx.item.updateMany({ where: { ownerId: userId }, data: { status: 'REMOVED', hidden: true, photos: [], description: '', latitude: null, longitude: null } });
      await tx.message.updateMany({ where: { senderId: userId, type: 'TEXT' }, data: { text: 'Message deleted' } });
      // System notes in shared chats can name this person ("Ama agreed to the swap."): swap the name out.
      const { name } = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
      const notes = await tx.message.findMany({
        where: { type: 'SYSTEM', text: { contains: name }, conversation: { OR: [{ buyerId: userId }, { sellerId: userId }] } },
        select: { id: true, text: true },
      });
      for (const note of notes) await tx.message.update({ where: { id: note.id }, data: { text: note.text!.split(name).join('Deleted user') } });
      await tx.item.updateMany({ where: { ownerId: userId }, data: { title: 'Removed listing', area: '' } });
      await tx.swipe.deleteMany({ where: { userId } });
      await tx.rating.deleteMany({ where: { OR: [{ fromId: userId }, { toId: userId }] } });
      await tx.report.deleteMany({ where: { userId } });
      await tx.block.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
      await tx.userReport.deleteMany({ where: { reporterId: userId } });
      await tx.pushToken.deleteMany({ where: { userId } });
      await tx.upload.deleteMany({ where: { userId } });
      await tx.otpChallenge.deleteMany({ where: { OR: [{ linkUserId: userId }, { value: { in: identities.map((i) => i.value) } }] } });
      await tx.rateBucket.deleteMany({ where: { key: { startsWith: `${userId}:` } } });
      // Freeing the identities lets the same phone/email sign up again as a brand-new account.
      await tx.authIdentity.deleteMany({ where: { userId } });
      await tx.user.update({ where: { id: userId }, data: { name: 'Deleted user', area: null, latitude: null, longitude: null, deletedAt: new Date() } });
      return [...new Set([...items.flatMap((i) => i.photos), ...uploads.map((u) => u.path)])];
    });
    // Storage cleanup after the commit; a failure here never undoes the deletion.
    await Promise.all(photos.map((url) => this.photos.remove(url).catch((e) => console.error('Photo cleanup failed:', e instanceof Error ? e.message : e))));
    return { deleted: true };
  }
}
