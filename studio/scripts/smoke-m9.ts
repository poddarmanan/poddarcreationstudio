import 'dotenv/config';
import assert from 'node:assert';
import sharp from 'sharp';
import { getContainer } from '../src/server/container';
import { processUpload } from '../src/lib/upload-pipeline';
import { prisma } from '../src/lib/prisma';

async function main() {
  const { adminService, storage } = getContainer();
  const colour = await prisma.colour.findFirstOrThrow({ where: { fabricId: 'cambric' }, orderBy: { order: 'asc' } });

  // Real media via the pipeline (two versions of the same slot).
  const png = await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 200, g: 170, b: 90 } } }).png().toBuffer();
  const m1 = await processUpload({ fabricId: 'cambric', colourId: colour.id, originalName: 'ops-a.png', mimeType: 'image/png', buffer: png, type: 'IMAGE' });
  const m2 = await processUpload({ fabricId: 'cambric', colourId: colour.id, originalName: 'ops-b.png', mimeType: 'image/png', buffer: png, type: 'IMAGE' });

  // List + bulk ops.
  const { media } = await adminService.listMedia({ fabricId: 'cambric' });
  assert(media.length >= 2, 'listMedia returns uploads');

  let count = await adminService.bulkEditMedia([m1.id, m2.id], { contentStatus: 'DRAFT' });
  assert(count === 2, 'bulk edit → DRAFT');
  count = await adminService.bulkEditMedia([m1.id], { contentStatus: 'PUBLISHED' });
  const published = await prisma.media.findUniqueOrThrow({ where: { id: m1.id } });
  assert(published.contentStatus === 'PUBLISHED' && published.publishedAt, 'publish sets publishedAt');
  console.log('bulk edit: draft + publish ✓');

  // Soft delete → hidden by default → restore.
  await adminService.bulkDeleteMedia([m2.id]);
  const visible = await adminService.listMedia({ fabricId: 'cambric' });
  assert(!visible.media.some((m) => m.id === m2.id), 'soft-deleted hidden by default');
  const withDeleted = await adminService.listMedia({ fabricId: 'cambric', includeDeleted: true });
  assert(withDeleted.media.some((m) => m.id === m2.id), 'visible with includeDeleted');
  await adminService.bulkRestoreMedia([m2.id]);
  const restored = await prisma.media.findUniqueOrThrow({ where: { id: m2.id } });
  assert(!restored.deletedAt && restored.contentStatus === 'DRAFT', 'restore clears deletedAt → DRAFT');
  console.log('soft delete + restore ✓');

  // Version history for the slot.
  const versions = await adminService.versionHistory('cambric', colour.id);
  assert(versions.length >= 2, `version history lists both uploads (got ${versions.length})`);
  console.log('version history ✓');

  // Purge (hard delete incl. storage).
  await adminService.bulkDeleteMedia([m2.id]);
  const purged = await adminService.purgeMedia([m2.id]);
  assert(purged === 1, 'purge count');
  assert((await prisma.media.findUnique({ where: { id: m2.id } })) === null, 'row gone');
  console.log('purge (storage + row) ✓');

  // CSV export → import round-trip (mutate one row, re-import, verify, reset).
  const csv = await adminService.exportColoursCsv();
  assert(csv.startsWith('fabricId,fabricName'), 'export header');
  assert(csv.split('\n').length === 1 + 264, `export rows (got ${csv.split('\n').length - 1})`);

  const line = csv.split('\n').find((l) => l.startsWith('cambric,') && l.includes(',Neel,'))!;
  const mutated = line.replace(',Neel,', ',Midnight,');
  const result = await adminService.importColoursCsv(['fabricId,fabricName,colourOrder,colourName,l,c,h,hex,temperature', mutated].join('\n'));
  assert(result.updated === 1 && result.errors.length === 0, 'import updates the row');
  const renamed = await prisma.colour.findFirst({ where: { fabricId: 'cambric', name: 'Midnight' } });
  assert(renamed, 'renamed shade persisted with recomputed metrics');
  assert(renamed!.hex, 'metrics recomputed on import');

  // Invalid rows are reported, not applied.
  const bad = await adminService.importColoursCsv('fabricId,fabricName,colourOrder,colourName,l,c,h\nnosuch,X,0,Test,.5,.1,100\ncambric,X,1,Bad,9,.1,100');
  assert(bad.errors.length === 2 && bad.updated === 0 && bad.created === 0, 'invalid rows rejected with line errors');
  console.log('CSV export/import round-trip + validation ✓');

  // Reset to canonical undoes the rename.
  await adminService.resetColoursToCanonical('cambric');
  const back = await prisma.colour.findFirst({ where: { fabricId: 'cambric', order: renamed!.order } });
  assert(back?.name === 'Neel', 'canonical reset restores name');
  console.log('canonical reset ✓');

  // Analytics + activity shapes.
  const a = await adminService.analytics();
  assert(a.fabrics === 11 && a.colours === 264 && typeof a.media.total === 'number', 'analytics aggregates');
  const feed = await adminService.activity(10);
  assert(Array.isArray(feed.events) && feed.events.length > 0, 'activity feed serves audit rows');
  console.log('analytics + activity ✓');

  // Cleanup remaining test media + its objects.
  await adminService.bulkDeleteMedia([m1.id]);
  await adminService.purgeMedia([m1.id]);
  await storage.deletePrefix('uploads/jobs');
  console.log('\nM9 SMOKE PASSED');
}

main()
  .catch((e) => { console.error('M9 SMOKE FAILED:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
