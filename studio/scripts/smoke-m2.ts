import 'dotenv/config';
import sharp from 'sharp';
import assert from 'node:assert';
import { processUpload } from '../src/lib/upload-pipeline';
import { getContainer } from '../src/server/container';
import { signKey, verifyKeySignature } from '../src/server/storage/signing';
import { prisma } from '../src/lib/prisma';

async function main() {
  const { storage } = getContainer();
  console.log('storage driver:', storage.name);

  // Build a real 600x600 teal PNG.
  const png = await sharp({ create: { width: 600, height: 600, channels: 3, background: { r: 20, g: 120, b: 130 } } })
    .png()
    .toBuffer();

  // Resolve a real shade rather than pinning a cuid, so the script runs against any
  // freshly migrated + seeded database.
  const shade = await prisma.colour.findFirstOrThrow({ where: { fabricId: 'rayon14' }, orderBy: { order: 'asc' } });

  const media = await processUpload({
    fabricId: 'rayon14',
    colourId: shade.id,
    originalName: 'smoke-test.png',
    mimeType: 'image/png',
    buffer: png,
    type: 'IMAGE',
  });

  console.log('media.stage        =', media.stage);
  console.log('media.storageKey   =', media.storageKey);
  console.log('media.checksum     =', media.checksum?.slice(0, 16), '…');
  console.log('media.etag         =', media.etag);
  console.log('media.version      =', media.version);
  console.log('media.webpPath     =', media.webpPath);
  console.log('media.aiColourName =', media.aiColourName, `(${media.aiConfidence}%, ${media.aiSource})`);

  assert(media.stage === 'PUBLISHED', 'expected PUBLISHED');
  assert(media.storageKey?.startsWith(`fabrics/rayon14/${shade.id}/v1/`), 'versioned folder key');
  assert(media.checksum && media.checksum.length === 64, 'sha256 checksum');
  assert(media.version === 1, 'version=1');
  assert(media.webpPath && media.avifPath && media.thumbPath, 'derivatives present');
  const meta = media.metadata as { width?: number; height?: number } | null;
  assert(meta?.width === 600 && meta?.height === 600, 'metadata dimensions stored');

  // Objects actually retrievable through the storage provider.
  for (const key of [media.storageKey!, media.webpPath!, media.avifPath!, media.thumbPath!]) {
    const obj = await storage.get(key);
    assert(obj && obj.body.byteLength > 0, `object present: ${key}`);
  }
  console.log('all 4 objects retrievable via storage.get ✓');

  // Public + signed URL helpers.
  const pub = storage.publicUrl(media.webpPath!);
  console.log('publicUrl          =', pub);
  const signed = await storage.getSignedDownloadUrl(media.storageKey!, 60);
  console.log('signedDownloadUrl  =', signed.slice(0, 80), '…');

  // Signing round-trip + expiry + tamper.
  const exp = Date.now() + 60_000;
  const sig = signKey('private/x.pdf', exp);
  assert(verifyKeySignature('private/x.pdf', exp, sig) === true, 'valid signature verifies');
  assert(verifyKeySignature('private/x.pdf', Date.now() - 1000, sig) === false, 'expired rejected');
  assert(verifyKeySignature('private/x.pdf', exp, sig + 'x') === false, 'tampered rejected');
  console.log('signed-url verify: valid ✓ / expired ✗ / tampered ✗');

  // Cleanup: remove the created objects and the Media row.
  await storage.deletePrefix(`fabrics/rayon14/${shade.id}/v1`);
  const gone = await storage.get(media.storageKey!);
  assert(gone === null, 'deletePrefix cleaned objects');
  await prisma.media.delete({ where: { id: media.id } });
  console.log('cleanup ✓ (deletePrefix removed objects, media row deleted)');

  console.log('\nM2 SMOKE PASSED — key to serve via HTTP written to /tmp/m2-key');
}

main()
  .catch((e) => {
    console.error('M2 SMOKE FAILED:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
