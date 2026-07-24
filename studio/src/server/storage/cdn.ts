import type { StorageProvider } from './provider';

/**
 * CDN / responsive-image abstraction (Priority 2). Builds optimized, cacheable image URLs
 * and srcsets. The local driver serves originals (next/image handles optimization in dev);
 * a real CDN (Cloudflare Images) rewrites URLs to on-the-fly transforms. Swappable by env.
 */

export interface ImageTransform {
  width?: number;
  quality?: number;
  format?: 'webp' | 'avif' | 'auto';
}

export interface Cdn {
  readonly name: string;
  /** Public URL for an object, optionally transformed (width/quality/format). */
  imageUrl(key: string, t?: ImageTransform): string;
  /** A responsive `srcset` string across the given widths. */
  srcSet(key: string, widths: number[], t?: Omit<ImageTransform, 'width'>): string;
}

/** Default: no URL-level transform; serves the stored object via the storage provider's public URL. */
export class PassthroughCdn implements Cdn {
  readonly name = 'passthrough';
  constructor(private readonly storage: StorageProvider) {}

  imageUrl(key: string): string {
    return this.storage.publicUrl(key) ?? `/api/media/${key}`;
  }

  srcSet(key: string, widths: number[]): string {
    const url = this.imageUrl(key);
    return widths.map((w) => `${url} ${w}w`).join(', ');
  }
}

/** Cloudflare Images URL transforms via the /cdn-cgi/image/ prefix on a configured domain. */
export class CloudflareImagesCdn implements Cdn {
  readonly name = 'cloudflare-images';
  constructor(private readonly base: string) {}

  imageUrl(key: string, t: ImageTransform = {}): string {
    const opts = [
      t.width ? `width=${t.width}` : '',
      `quality=${t.quality ?? 82}`,
      `format=${t.format ?? 'auto'}`,
    ]
      .filter(Boolean)
      .join(',');
    return `${this.base}/cdn-cgi/image/${opts}/${key}`;
  }

  srcSet(key: string, widths: number[], t: Omit<ImageTransform, 'width'> = {}): string {
    return widths.map((w) => `${this.imageUrl(key, { ...t, width: w })} ${w}w`).join(', ');
  }
}

/** Standard responsive breakpoints for fabric photography. */
export const RESPONSIVE_WIDTHS = [320, 480, 640, 828, 1080, 1280, 1600] as const;
