import zlib from 'node:zlib';

/**
 * A minimal PNG decoder for the visual smokes (Phase 4 M24).
 *
 * Playwright hands back an encoded PNG, and it is genuinely easy — I did it — to write an
 * assertion that samples those bytes directly and believe it is measuring the picture. It is
 * measuring deflate output, so the numbers move plausibly and mean nothing. Anything that
 * claims "this render changed" has to look at pixels.
 *
 * Handles what Chromium emits for a screenshot: 8-bit RGB or RGBA, non-interlaced.
 */
export function decodePng(buffer) {
  let pos = 8; // skip signature
  let width = 0;
  let height = 0;
  let colourType = 6;
  const idat = [];

  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    const body = buffer.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      colourType = body[9];
      if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`);
      if (body[12] !== 0) throw new Error('interlaced PNGs are not supported');
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + length; // length + type + data + crc
  }

  const channels = colourType === 6 ? 4 : colourType === 2 ? 3 : 0;
  if (!channels) throw new Error(`unsupported colour type ${colourType}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);

  // Undo the per-scanline filters. Each line carries its filter type in its first byte.
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    const cur = out.subarray(y * stride, (y + 1) * stride);

    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let value = line[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = value & 0xff;
    }
  }

  return { width, height, channels, data: out };
}

/** Mean channel values over the whole image, in 0-255. */
export function meanColour(png) {
  let r = 0;
  let g = 0;
  let b = 0;
  const pixels = png.width * png.height;
  for (let i = 0; i < pixels; i++) {
    const o = i * png.channels;
    r += png.data[o];
    g += png.data[o + 1];
    b += png.data[o + 2];
  }
  return { r: r / pixels, g: g / pixels, b: b / pixels };
}

export const colourDistance = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);

/** Red relative to blue. Above 1 is a warm image, below is cool. */
export const warmth = (c) => (c.r + 1) / (c.b + 1);
