import 'dotenv/config';
import { getContainer } from '../src/server/container';
import { prisma } from '../src/lib/prisma';

/**
 * Backfills colour intelligence (metrics + relationship graph) onto an already-seeded DB
 * without a full reseed. Idempotent — safe to re-run. New seeds compute this automatically.
 */
async function main() {
  const result = await getContainer().colourService.analyzeAll();
  console.log(`Backfilled ${result.coloursUpdated} colours, ${result.relationships} relationships.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
