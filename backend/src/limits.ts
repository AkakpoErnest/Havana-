import { CanActivate, ExecutionContext, HttpException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Db } from './db';
import { AuthedRequest } from './auth';
import { coded } from './errors';

type Rule = { max: number; seconds: number };
type LimitConfig = { action: string; label: string; rules: Rule[] };
const KEY = 'havana:limits';

/** Per-user limits for a route, e.g. `@Limit('message', 'messages', {max:30,seconds:60}, {max:500,seconds:86400})`. Runs after the JWT Guard. */
export const Limit = (action: string, label: string, ...rules: Rule[]) => SetMetadata(KEY, { action, label, rules } satisfies LimitConfig);
export const MINUTE = 60, HOUR = 3600, DAY = 86400;

/** Fixed-window counters in Postgres, so limits hold across restarts. Normal use never gets near them. */
@Injectable()
export class UserLimits implements CanActivate {
  constructor(private reflector: Reflector, private db: Db) {}
  async canActivate(context: ExecutionContext) {
    const config = this.reflector.get<LimitConfig | undefined>(KEY, context.getHandler());
    if (!config || process.env.RATE_LIMITS === 'off') return true;
    const { userId } = context.switchToHttp().getRequest<AuthedRequest>();
    const now = Math.floor(Date.now() / 1000);
    for (const { max, seconds } of config.rules) {
      const start = now - (now % seconds);
      const rows = await this.db.$queryRaw<{ count: number }[]>`
        INSERT INTO "RateBucket" ("key", "count", "expiresAt")
        VALUES (${`${userId}:${config.action}:${seconds}:${start}`}, 1, ${new Date((start + seconds) * 1000)})
        ON CONFLICT ("key") DO UPDATE SET "count" = "RateBucket"."count" + 1
        RETURNING "count"`;
      if (rows[0].count > max) {
        const message = seconds >= DAY
          ? `You've reached today's limit for ${config.label}. Please try again tomorrow.`
          : `You're going a little fast with ${config.label}. Take a short break and try again in a ${seconds >= HOUR ? 'little while' : 'minute'}.`;
        throw new HttpException(coded('RATE_LIMITED', message), 429);
      }
    }
    // Occasionally clear out expired windows.
    if (Math.random() < 0.01) void this.db.rateBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined);
    return true;
  }
}
