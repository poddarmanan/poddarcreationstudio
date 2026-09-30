import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { FABRIC_DEFS, generateColours } from '../src/lib/fabric-generator';
import { PrismaColourRepository } from '../src/server/colour/colour.repository';
import { ColourService } from '../src/server/colour/colour.service';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding fabrics + colours…');
  for (const fabric of FABRIC_DEFS) {
    await prisma.fabric.upsert({
      where: { id: fabric.id },
      create: {
        id: fabric.id,
        name: fabric.name,
        family: fabric.family,
        weight: fabric.weight,
        width: fabric.width,
        comp: fabric.comp,
        nc: fabric.nc,
        hand: fabric.hand,
        sheen: fabric.sheen,
        flow: fabric.flow,
        stretch: fabric.stretch,
        seed: fabric.seed,
        price: fabric.price,
        heroIndex: fabric.heroIndex,
      },
      update: {
        name: fabric.name,
        family: fabric.family,
        weight: fabric.weight,
        width: fabric.width,
        comp: fabric.comp,
        nc: fabric.nc,
        hand: fabric.hand,
        sheen: fabric.sheen,
        flow: fabric.flow,
        stretch: fabric.stretch,
        seed: fabric.seed,
        price: fabric.price,
        heroIndex: fabric.heroIndex,
      },
    });

    const colours = generateColours(fabric);
    for (const colour of colours) {
      await prisma.colour.upsert({
        where: { fabricId_order: { fabricId: fabric.id, order: colour.order } },
        create: { fabricId: fabric.id, name: colour.name, l: colour.l, c: colour.c, h: colour.h, order: colour.order },
        update: { name: colour.name, l: colour.l, c: colour.c, h: colour.h },
      });
    }
    console.log(`  ${fabric.name} — ${colours.length} shades`);
  }

  // Accounts. The demo accounts (one shared, published password) are for a local database only:
  // on any other database they would be a way into the live site for anyone who has read this
  // file. There, the one account made is the owner's admin, from SEED_ADMIN_EMAIL and
  // SEED_ADMIN_PASSWORD, and the seed refuses to run without them.
  // Seeded accounts are created by us, not self-registered, so they count as verified. Left
  // unverified they trip the M20 security check ("privileged account never verified its
  // email"), which would make a freshly seeded deployment report itself unhealthy on day one.
  const emailVerifiedAt = new Date();
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? '');
  const demo = process.env.SEED_DEMO_ACCOUNTS === '1' || (process.env.NODE_ENV !== 'production' && local);
  if (demo) {
    console.log('Seeding demo accounts (local database)…');
    const passwordHash = await bcrypt.hash('poddar123', 10);
    await prisma.user.upsert({
      where: { email: 'admin@poddarcreation.studio' },
      create: { name: 'Studio Admin', email: 'admin@poddarcreation.studio', passwordHash, role: 'ADMIN', approved: true, emailVerifiedAt },
      update: { emailVerifiedAt },
    });
    await prisma.user.upsert({
      where: { email: 'sales@poddarcreation.studio' },
      create: { name: 'Sales Desk', email: 'sales@poddarcreation.studio', passwordHash, role: 'SALES', approved: true, emailVerifiedAt },
      update: { emailVerifiedAt },
    });
    await prisma.user.upsert({
      where: { email: 'buyer@example.com' },
      create: { name: 'Approved Buyer', email: 'buyer@example.com', passwordHash, role: 'BUYER', approved: true, company: 'Anand Garments, Mumbai', emailVerifiedAt },
      update: {},
    });
  } else {
    const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD ?? '';
    if (!email || password.length < 12) {
      throw new Error('Not a local database: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (12+ characters) for the owner\'s admin account. No demo accounts are made here.');
    }
    console.log(`Seeding the admin account ${email}…`);
    // Made once; run again, the seed leaves an existing account (and its password) as it is.
    await prisma.user.upsert({
      where: { email },
      create: { name: process.env.SEED_ADMIN_NAME?.trim() || 'Studio Admin', email, passwordHash: await bcrypt.hash(password, 10), role: 'ADMIN', approved: true, emailVerifiedAt },
      update: {},
    });
  }

  console.log('Computing colour intelligence (metrics + relationships)…');
  const colourService = new ColourService(new PrismaColourRepository(prisma));
  const result = await colourService.analyzeAll();
  console.log(`  ${result.coloursUpdated} colours analyzed, ${result.relationships} relationships built`);

  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
