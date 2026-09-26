/**
 * Reads a .glb far enough to get at its accessors and images — enough for a smoke to measure a
 * garment model without a browser. No Draco, no sparse accessors.
 */
// Minimal GLB reader: JSON + accessor → typed array (no draco).
import { readFileSync } from 'node:fs';
export function readGlb(path) {
  const buf = readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  const binOff = 20 + jsonLen + 8;
  const bin = buf.subarray(binOff, binOff + buf.readUInt32LE(20 + jsonLen));
  const accessor = (i) => {
    const a = json.accessors[i]; const bv = json.bufferViews[a.bufferView];
    const off = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const Ctor = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array }[a.componentType];
    const stride = bv.byteStride;
    if (!stride || stride === comps * Ctor.BYTES_PER_ELEMENT) return new Ctor(bin.buffer, bin.byteOffset + off, a.count * comps);
    const out = new Ctor(a.count * comps);
    for (let k = 0; k < a.count; k++) for (let c = 0; c < comps; c++) out[k * comps + c] = new Ctor(bin.buffer, bin.byteOffset + off + k * stride, comps)[c];
    return out;
  };
  const image = (i) => { const bv = json.bufferViews[json.images[i].bufferView]; return Buffer.from(bin.buffer, bin.byteOffset + (bv.byteOffset ?? 0), bv.byteLength); };
  return { json, accessor, image };
}
