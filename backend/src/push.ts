import { Injectable } from '@nestjs/common';
import { Db } from './db';

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
export const isExpoPushToken = (token: string) => /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
type Notice = { title: string; body: string; data: { conversationId: string; kind: string } };

/** Sends Expo push notifications. Fire-and-forget after the database change commits: a push problem never fails the request. */
@Injectable()
export class Push {
  constructor(private db: Db) {}

  async register(userId: string, token: string) {
    // A token belongs to one installed app; if another account signs in on that phone, it moves to them.
    await this.db.pushToken.upsert({ where: { token }, update: { userId }, create: { userId, token } });
    return { registered: true };
  }

  async unregister(userId: string, token: string) {
    await this.db.pushToken.deleteMany({ where: { userId, token } });
    return { registered: false };
  }

  notify(userId: string, notice: Notice) {
    void this.send(userId, notice).catch((e) => console.error('Push failed:', e instanceof Error ? e.message : e));
  }

  private async send(userId: string, { title, body, data }: Notice) {
    const tokens = (await this.db.pushToken.findMany({ where: { userId }, select: { token: true } })).map((t) => t.token);
    if (!tokens.length) return;
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(tokens.map((to) => ({ to, title, body: body.slice(0, 180), data, sound: 'default', channelId: 'default' }))),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Expo push responded ${response.status}`);
    const tickets = ((await response.json()) as { data?: { status: string; details?: { error?: string } }[] }).data ?? [];
    // Uninstalled apps: stop sending to them.
    const dead = tokens.filter((_, i) => tickets[i]?.details?.error === 'DeviceNotRegistered');
    if (dead.length) await this.db.pushToken.deleteMany({ where: { token: { in: dead } } });
  }
}
