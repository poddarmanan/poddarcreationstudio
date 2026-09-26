import { readFileSync, writeFileSync, statSync } from 'node:fs';

/**
 * Strips a garment model down to what the studio uses (Phase 4 tooling).
 *
 *   node scripts/slim-model.mjs public/models/top.glb [--keep-colour]
 *
 * The Fabric Lab throws a model's materials away and re-dresses every surface in its own cloth,
 * so the textures a marketplace model ships with — albedo, normal, roughness, emissive, often
 * ten megabytes of PNG — are downloaded by every visitor and never looked at. This drops them
 * (and everything else no accessor refers to), rewriting the file in place. `--keep-colour`
 * keeps the base colour texture, for a model whose transparency cuts part of itself away.
 */
const file = process.argv[2];
const keepColour = process.argv.includes('--keep-colour');
if (!file) {
  console.error('usage: node scripts/slim-model.mjs <model.glb> [--keep-colour]');
  process.exit(2);
}

const buf = readFileSync(file);
if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error(`${file} is not a binary glTF`);
const jsonLength = buf.readUInt32LE(12);
const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLength));
const binStart = 20 + jsonLength + 8;
const bin = buf.subarray(binStart, binStart + buf.readUInt32LE(20 + jsonLength));
const before = statSync(file).size;

// Which images survive.
const keptImages = new Set();
if (keepColour) {
  for (const material of json.materials ?? []) {
    const texture = material.pbrMetallicRoughness?.baseColorTexture;
    if (texture !== undefined && json.textures?.[texture.index]) keptImages.add(json.textures[texture.index].source);
  }
}
// Every other texture reference goes.
for (const material of json.materials ?? []) {
  for (const key of ['normalTexture', 'occlusionTexture', 'emissiveTexture']) delete material[key];
  const pbr = material.pbrMetallicRoughness;
  if (pbr) {
    delete pbr.metallicRoughnessTexture;
    if (!keepColour) delete pbr.baseColorTexture;
  }
  // Extension textures (clearcoat, sheen, transmission…) reference images too.
  delete material.extensions;
}
json.extensionsUsed = (json.extensionsUsed ?? []).filter((e) => !e.startsWith('KHR_materials_'));
if (!json.extensionsUsed.length) delete json.extensionsUsed;
json.extensionsRequired = (json.extensionsRequired ?? []).filter((e) => !e.startsWith('KHR_materials_'));
if (!json.extensionsRequired.length) delete json.extensionsRequired;

// Renumber the surviving images and textures.
const imageMap = new Map();
json.images = (json.images ?? []).filter((_, i) => keptImages.has(i)).map((image, k) => (imageMap.set([...keptImages].sort((a, b) => a - b)[k], k), image));
const textureMap = new Map();
json.textures = (json.textures ?? []).filter((t, i) => (imageMap.has(t.source) ? (textureMap.set(i, textureMap.size), true) : false)).map((t) => ({ ...t, source: imageMap.get(t.source) }));
for (const material of json.materials ?? []) {
  const texture = material.pbrMetallicRoughness?.baseColorTexture;
  if (texture) texture.index = textureMap.get(texture.index);
}
if (!json.images.length) delete json.images;
if (!json.textures.length) {
  delete json.textures;
  delete json.samplers;
}

// Keep only the buffer views something still refers to, packed tightly.
const used = new Set();
for (const accessor of json.accessors ?? []) {
  if (accessor.bufferView !== undefined) used.add(accessor.bufferView);
  if (accessor.sparse) {
    used.add(accessor.sparse.indices.bufferView);
    used.add(accessor.sparse.values.bufferView);
  }
}
for (const image of json.images ?? []) if (image.bufferView !== undefined) used.add(image.bufferView);
for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives) if (primitive.extensions?.KHR_draco_mesh_compression) used.add(primitive.extensions.KHR_draco_mesh_compression.bufferView);
const viewMap = new Map();
const chunks = [];
let offset = 0;
json.bufferViews = json.bufferViews
  .map((view, i) => ({ view, i }))
  .filter(({ i }) => used.has(i))
  .map(({ view, i }) => {
    const data = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    viewMap.set(i, viewMap.size);
    const padded = Math.ceil(view.byteLength / 4) * 4;
    chunks.push(data, Buffer.alloc(padded - view.byteLength));
    const out = { ...view, byteOffset: offset };
    offset += padded;
    return out;
  });
const remap = (holder) => {
  if (holder && holder.bufferView !== undefined) holder.bufferView = viewMap.get(holder.bufferView);
};
for (const accessor of json.accessors ?? []) {
  remap(accessor);
  if (accessor.sparse) {
    remap(accessor.sparse.indices);
    remap(accessor.sparse.values);
  }
}
for (const image of json.images ?? []) remap(image);
for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives) remap(primitive.extensions?.KHR_draco_mesh_compression);
json.buffers = [{ byteLength: offset }];

const jsonText = Buffer.from(JSON.stringify(json), 'utf8');
const jsonPadded = Buffer.concat([jsonText, Buffer.alloc((4 - (jsonText.length % 4)) % 4, 0x20)]);
const binOut = Buffer.concat(chunks);
const header = Buffer.alloc(12);
header.write('glTF', 0, 'ascii');
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + binOut.length, 8);
const jsonChunk = Buffer.alloc(8);
jsonChunk.writeUInt32LE(jsonPadded.length, 0);
jsonChunk.write('JSON', 4, 'ascii');
const binChunk = Buffer.alloc(8);
binChunk.writeUInt32LE(binOut.length, 0);
binChunk.write('BIN\0', 4, 'ascii');
writeFileSync(file, Buffer.concat([header, jsonChunk, jsonPadded, binChunk, binOut]));
console.log(`${file}: ${(before / 1e6).toFixed(1)} MB → ${(statSync(file).size / 1e6).toFixed(1)} MB`);
