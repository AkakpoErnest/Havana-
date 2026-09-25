import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

// Full photos stay sharp on phone screens but never exceed this; previews are for cards and lists.
export const FULL_MAX_BYTES = 300 * 1024;
const FULL_SIDE = 1280, THUMB_SIDE = 480;
const QUALITIES = [75, 65, 55, 45];

/** Preview URL for a stored photo: `x.webp` → `x_thumb.webp`. Older/seed photos have no preview, so they map to themselves. */
export function thumbOf(url: string) {
  return url.endsWith('.webp') && !url.endsWith('_thumb.webp') ? url.replace(/\.webp$/, '_thumb.webp') : url;
}

/** Re-encodes an upload as WebP (strips EXIF/GPS) and returns the full photo plus a small preview. */
export async function encodePhoto(input: Buffer) {
  const base = () => sharp(input, { limitInputPixels: 40_000_000 }).rotate();
  let full: Buffer = Buffer.alloc(0);
  for (const quality of QUALITIES) {
    full = await base().resize(FULL_SIDE, FULL_SIDE, { fit: 'inside', withoutEnlargement: true }).webp({ quality }).toBuffer();
    if (full.length <= FULL_MAX_BYTES) break;
  }
  // Very detailed photos can still be large at the lowest quality; shrink them until they fit.
  for (const side of [1024, 800, 640, 480]) {
    if (full.length <= FULL_MAX_BYTES) break;
    full = await base().resize(side, side, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 50 }).toBuffer();
  }
  const thumb = await base().resize(THUMB_SIDE, THUMB_SIDE, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 70 }).toBuffer();
  const { width, height } = await sharp(full).metadata();
  return { full, thumb, width: width ?? null, height: height ?? null };
}

/** Stores photos in Cloudflare R2 when configured, otherwise in the local uploads folder (laptop dev). */
@Injectable()
export class PhotoStore {
  private r2 = process.env.R2_BUCKET && process.env.R2_ACCESS_KEY_ID
    ? new S3Client({
        region: 'auto',
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
      })
    : null;
  get backend() { return this.r2 ? 'r2' : 'local'; }
  /** Saves the full photo and its preview; returns the full photo's URL (absolute for R2, `/uploads/…` locally). */
  async save(full: Buffer, thumb: Buffer) {
    const name = randomUUID();
    const files: [string, Buffer][] = [[`${name}.webp`, full], [`${name}_thumb.webp`, thumb]];
    if (this.r2) {
      await Promise.all(files.map(([key, body]) => this.r2!.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, Body: body, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' }))));
      return `${process.env.R2_PUBLIC_URL!.replace(/\/$/, '')}/${name}.webp`;
    }
    const dir = resolve(process.env.UPLOAD_DIR ?? 'uploads');
    await mkdir(dir, { recursive: true });
    await Promise.all(files.map(([file, body]) => writeFile(resolve(dir, file), body)));
    return `/uploads/${name}.webp`;
  }
}
