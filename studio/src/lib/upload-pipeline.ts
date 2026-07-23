import sharp from 'sharp';
import QRCode from 'qrcode';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { saveBuffer } from '@/lib/storage';
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
 * Steps run synchronously within the request for this build (no job queue yet) — a
 * production deployment would move compression/naming to a background worker, but every
 * step here does real work: real files land on disk, real WebP/AVIF/QR bytes are produced.
 */
export async function processUpload(input: UploadInput) {
  const id = randomUUID();
  const ext = input.originalName.split('.').pop() || 'bin';
  const baseDir = `uploads/${input.fabricId}`;
  const originalRel = `${baseDir}/${id}-original.${ext}`;
  await saveBuffer(originalRel, input.buffer);

  const media = await prisma.media.create({
    data: {
      id,
      fabricId: input.fabricId,
      colourId: input.colourId,
      type: input.type,
      originalName: input.originalName,
      originalSizeBytes: input.buffer.byteLength,
      mimeType: input.mimeType,
      storagePath: originalRel,
      stage: 'QUEUED',
    },
  });

  if (input.type === 'IMAGE') {
    await prisma.media.update({ where: { id }, data: { stage: 'COMPRESSING' } });
    const img = sharp(input.buffer, { failOn: 'none' });
    const meta = await img.metadata();

    const [webp, avif, thumb] = await Promise.all([
      sharp(input.buffer).webp({ quality: 82 }).toBuffer(),
      sharp(input.buffer).avif({ quality: 60 }).toBuffer(),
      sharp(input.buffer).resize(320, 320, { fit: 'cover' }).webp({ quality: 75 }).toBuffer(),
    ]);
    const webpRel = `${baseDir}/${id}.webp`;
    const avifRel = `${baseDir}/${id}.avif`;
    const thumbRel = `${baseDir}/${id}-thumb.webp`;
    await Promise.all([saveBuffer(webpRel, webp), saveBuffer(avifRel, avif), saveBuffer(thumbRel, thumb)]);

    await prisma.media.update({
      where: { id },
      data: { webpPath: webpRel, avifPath: avifRel, thumbPath: thumbRel, width: meta.width, height: meta.height, stage: 'THUMBNAIL' },
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
