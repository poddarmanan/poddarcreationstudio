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

  console.log('Seeding demo accounts…');
  const passwordHash = await bcrypt.hash('poddar123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@poddarcreation.studio' },
    create: { name: 'Studio Admin', email: 'admin@poddarcreation.studio', passwordHash, role: 'ADMIN', approved: true },
    update: {},
  });
  await prisma.user.upsert({
    where: { email: 'sales@poddarcreation.studio' },
    create: { name: 'Sales Desk', email: 'sales@poddarcreation.studio', passwordHash, role: 'SALES', approved: true },
    update: {},
  });
  await prisma.user.upsert({
    where: { email: 'buyer@example.com' },
    create: { name: 'Approved Buyer', email: 'buyer@example.com', passwordHash, role: 'BUYER', approved: true, company: 'Anand Garments, Mumbai' },
    update: {},
  });

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
