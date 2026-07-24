import 'dotenv/config';
import assert from 'node:assert';
import { getContainer } from '../src/server/container';
import { prisma } from '../src/lib/prisma';

async function main() {
  const { fabricService, adminService } = getContainer();

  // Warm the cache.
  let cat = await fabricService.listCatalogue();
  const orig = cat.find((f) => f.id === 'lycra')!.colours[0].name;

  // Mutate via CSV import; the route layer invalidates — simulate the same orchestration.
  const row = ['lycra', 'Cotton Lycra', 0, 'CacheTest', 0.9, 0.05, 120].join(',');
  await adminService.importColoursCsv('fabricId,fabricName,colourOrder,colourName,l,c,h\n' + row);

  // Without invalidation the stale cache must still serve the old name (proves it caches)…
  cat = await fabricService.listCatalogue();
  assert(cat.find((f) => f.id === 'lycra')!.colours[0].name === orig, 'cache serves stale before invalidation (caching is real)');

  // …and after invalidation the fresh row appears.
  fabricService.invalidateCatalogue();
  cat = await fabricService.listCatalogue();
  assert(cat.find((f) => f.id === 'lycra')!.colours[0].name === 'CacheTest', 'fresh read after invalidation');
  console.log('TTL cache: caches ✓ / invalidates ✓');

  // Restore canonical.
  await adminService.resetColoursToCanonical('lycra');
  fabricService.invalidateCatalogue();
  cat = await fabricService.listCatalogue();
  assert(cat.find((f) => f.id === 'lycra')!.colours[0].name === orig, 'canonical restored');
  console.log(`restored to "${orig}" ✓`);

  // Speedup at service level.
  fabricService.invalidateCatalogue();
  const t1 = performance.now();
  await fabricService.listCatalogue();
  const cold = performance.now() - t1;
  const t0 = performance.now();
  await fabricService.listCatalogue();
  const cached = performance.now() - t0;
  console.log(`service-level: cold=${cold.toFixed(1)}ms cached=${cached.toFixed(2)}ms`);
  assert(cached < cold, 'cached faster than cold');

  console.log('\nM10 SMOKE PASSED');
}

main()
  .catch((e) => { console.error('M10 SMOKE FAILED:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
