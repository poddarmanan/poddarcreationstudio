/**
 * Content-based file-type detection (Priority 3: file type verification). The browser-
 * supplied MIME type is attacker-controlled; we verify the real type from magic bytes
 * before trusting a file. Covers exactly the formats the upload pipeline accepts.
 */

export type SniffedType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp'
  | 'image/avif'
  | 'video/mp4'
  | 'video/webm'
  | 'video/quicktime';

export type MediaCategory = 'IMAGE' | 'VIDEO';

const CATEGORY: Record<SniffedType, MediaCategory> = {
  'image/jpeg': 'IMAGE',
  'image/png': 'IMAGE',
  'image/gif': 'IMAGE',
  'image/webp': 'IMAGE',
  'image/avif': 'IMAGE',
  'video/mp4': 'VIDEO',
  'video/webm': 'VIDEO',
  'video/quicktime': 'VIDEO',
};

function ascii(buf: Buffer, start: number, len: number): string {
  return buf.subarray(start, start + len).toString('latin1');
}

/** Returns the detected media type from magic bytes, or null if unrecognized. */
export function sniffMediaType(buf: Buffer): SniffedType | null {
  if (buf.length < 12) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  // GIF: "GIF87a" / "GIF89a"
  if (ascii(buf, 0, 3) === 'GIF') return 'image/gif';
  // RIFF....WEBP
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 4) === 'WEBP') return 'image/webp';
  // WEBM / Matroska: 1A 45 DF A3
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'video/webm';

  // ISO-BMFF family: bytes 4-8 are 'ftyp', brand follows
  if (ascii(buf, 4, 4) === 'ftyp') {
    const brand = ascii(buf, 8, 4);
    if (brand.startsWith('avif') || brand.startsWith('avis')) return 'image/avif';
    if (brand === 'qt  ') return 'video/quicktime';
    // mp4 brands: isom, iso2, mp41, mp42, dash, MSNV, avc1, etc. → treat as mp4
    return 'video/mp4';
  }

  return null;
}

export function categoryOf(type: SniffedType): MediaCategory {
  return CATEGORY[type];
}
