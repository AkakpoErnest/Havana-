import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs';
import { AuthedRequest } from './auth';

/** Nearest 0.5 km (never 0), so repeated lookups from different spots can't pinpoint a seller. */
export const roundDistance = (km: number) => Math.max(0.5, Math.round(km * 2) / 2);

/** SEC-003: removes exact coordinates from listings the viewer doesn't own and coarsens distances, wherever they appear in a response. */
export function scrubLocations(value: unknown, viewerId: string | undefined): unknown {
  if (Array.isArray(value)) return value.map((v) => scrubLocations(v, viewerId));
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) out[key] = scrubLocations(v, viewerId);
  const listing = typeof out.ownerId === 'string' && ('latitude' in out || 'longitude' in out);
  if (listing && out.ownerId !== viewerId) {
    out.latitude = null;
    out.longitude = null;
  }
  if (typeof out.distanceKm === 'number') out.distanceKm = roundDistance(out.distanceKm);
  return out;
}

@Injectable()
export class LocationPrivacy implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const viewer = context.switchToHttp().getRequest<Partial<AuthedRequest>>().userId;
    return next.handle().pipe(map((body) => scrubLocations(body, viewer)));
  }
}
