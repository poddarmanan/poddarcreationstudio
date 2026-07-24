import sharp from 'sharp';
import { rgbToHex } from '@/lib/colour-science';

export interface PaletteSwatch {
  hex: string;
  r: number;
  g: number;
  b: number;
  share: number; // fraction of sampled pixels 0..1
}

/**
 * Extracts a dominant colour palette from an image (Priority 9). Downsamples, quantizes to
 * a coarse cube, and returns the most common buckets. Cheap and dependency-light — good
 * enough for catalogue swatches and as an input to future AI similarity search.
 */
export async function extractDominantPalette(buffer: Buffer, maxSwatches = 5): Promise<PaletteSwatch[]> {
  const size = 64;
  const { data, info } = await sharp(buffer)
    .resize(size, size, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels; // 3
  const counts = new Map<string, { r: number; g: number; b: number; n: number }>();
  const q = (v: number) => Math.round(v / 32) * 32; // 8 levels per channel

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = `${q(r)},${q(g)},${q(b)}`;
    const bucket = counts.get(key);
    if (bucket) {
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.n += 1;
    } else {
      counts.set(key, { r, g, b, n: 1 });
    }
  }

  const total = (size * size) || 1;
  return [...counts.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, maxSwatches)
    .map((bucket) => {
      const r = Math.round(bucket.r / bucket.n);
      const g = Math.round(bucket.g / bucket.n);
      const b = Math.round(bucket.b / bucket.n);
      return { hex: rgbToHex({ r, g, b }), r, g, b, share: Math.round((bucket.n / total) * 1000) / 1000 };
    });
}
