import sharp from 'sharp';
import QRCode from 'qrcode';
import { randomUUID, createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { getContainer } from '@/server/container';
import { nameColourFromImage } from '@/lib/ai-colour-naming';
import { srgbToOklch } from '@/lib/oklch';
import type { MediaType } from '@/generated/prisma/enums';

export interface UploadInput {
  fabricId: string;
  colourId: string | null;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
  type: MediaType;
}

/**
 * Runs the real drag-drop → publish pipeline the admin studio shows:
 * store original → compress to WebP/AVIF → generate a thumbnail → name the colour
 * (Claude vision, or a deterministic OKLCH fallback) → generate a QR deep link → publish.
 *
 * All object writes go through the storage provider (local disk in dev, R2 in production),
 * under folder-organized, versioned keys. Steps run synchronously within the request for
 * this build; a production worker would move compression/naming off the request path.
 */
export async function processUpload(input: UploadInput) {
  const { storage } = getContainer();
  const id = randomUUID();
  const ext = (input.originalName.split('.').pop() || 'bin').toLowerCase();
  const version = 1;
  // fabrics/<fabricId>/<colourId|_>/v<version>/<id>...
  const baseKey = `fabrics/${input.fabricId}/${input.colourId ?? '_'}/v${version}`;
  const originalKey = `${baseKey}/${id}-original.${ext}`;
  const checksum = createHash('sha256').update(input.buffer).digest('hex');

  const stored = await storage.put({
    key: originalKey,
    body: input.buffer,
    contentType: input.mimeType,
    metadata: { fabricId: input.fabricId, colourId: input.colourId ?? '', checksum },
  });

  const media = await prisma.media.create({
    data: {
      id,
      fabricId: input.fabricId,
      colourId: input.colourId,
      type: input.type,
      originalName: input.originalName,
      originalSizeBytes: input.buffer.byteLength,
      mimeType: input.mimeType,
      storagePath: originalKey,
      storageKey: originalKey,
      version,
      checksum,
      etag: stored.etag,
      stage: 'QUEUED',
    },
  });

  if (input.type === 'IMAGE') {
    await prisma.media.update({ where: { id }, data: { stage: 'COMPRESSING' } });
    const meta = await sharp(input.buffer, { failOn: 'none' }).metadata();

    const [webp, avif, thumb] = await Promise.all([
      sharp(input.buffer).webp({ quality: 82 }).toBuffer(),
      sharp(input.buffer).avif({ quality: 60 }).toBuffer(),
      sharp(input.buffer).resize(320, 320, { fit: 'cover' }).webp({ quality: 75 }).toBuffer(),
    ]);
    const webpKey = `${baseKey}/${id}.webp`;
    const avifKey = `${baseKey}/${id}.avif`;
    const thumbKey = `${baseKey}/${id}-thumb.webp`;
    await Promise.all([
      storage.put({ key: webpKey, body: webp, contentType: 'image/webp' }),
      storage.put({ key: avifKey, body: avif, contentType: 'image/avif' }),
      storage.put({ key: thumbKey, body: thumb, contentType: 'image/webp' }),
    ]);

    await prisma.media.update({
      where: { id },
      data: {
        webpPath: webpKey,
        avifPath: avifKey,
        thumbPath: thumbKey,
        width: meta.width,
        height: meta.height,
        metadata: { width: meta.width, height: meta.height, format: meta.format, bytes: { webp: webp.byteLength, avif: avif.byteLength } },
        stage: 'THUMBNAIL',
      },
    });

    await prisma.media.update({ where: { id }, data: { stage: 'NAMING' } });
    // Hint for the heuristic path: the image's real dominant colour (1px downsample → OKLCH).
    const [px] = await sharp(input.buffer).resize(1, 1, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true }).then((r) => [r.data]);
    const hint = srgbToOklch(px[0], px[1], px[2]);
    const named = await nameColourFromImage(webp, 'image/webp', hint);

    await prisma.media.update({ where: { id }, data: { stage: 'QR' } });
    const qrTarget = `https://poddarcreation.studio/showroom?fabric=${input.fabricId}${input.colourId ? `&colour=${input.colourId}` : ''}`;
    const qrDataUrl = await QRCode.toDataURL(qrTarget, { margin: 1, width: 240, color: { dark: '#1C1917', light: '#FAF8F5' } });

    return prisma.media.update({
      where: { id },
      data: {
        aiColourName: named.name,
        aiConfidence: named.confidence,
        aiSource: named.source,
        qrDataUrl,
        stage: 'PUBLISHED',
      },
    });
  }

  // Video: store original only — compression (HLS/adaptive bitrate) and frame-based AI
  // naming are out of scope for this build; the pipeline still reaches PUBLISHED so the
  // Media row is usable, with a QR deep link generated for it.
  const qrTarget = `https://poddarcreation.studio/showroom?fabric=${input.fabricId}${input.colourId ? `&colour=${input.colourId}` : ''}`;
  const qrDataUrl = await QRCode.toDataURL(qrTarget, { margin: 1, width: 240, color: { dark: '#1C1917', light: '#FAF8F5' } });
  return prisma.media.update({ where: { id }, data: { qrDataUrl, stage: 'PUBLISHED' } });
}
