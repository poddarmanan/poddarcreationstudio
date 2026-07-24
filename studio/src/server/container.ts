import { prisma } from '@/lib/prisma';
import { type Telemetry, ConsoleTelemetry, NoopTelemetry } from './core/telemetry';
import { type Audit } from './core/audit';
import { PrismaAudit } from './core/audit-prisma';
import { type RateLimiter, InMemoryRateLimiter } from './core/rate-limit';
import { type StorageProvider, type Cdn, createStorage, createCdn } from './storage';
import { PrismaFabricRepository, type FabricRepository } from './fabric/fabric.repository';
import { FabricService } from './fabric/fabric.service';
import { PrismaColourRepository, type ColourRepository } from './colour/colour.repository';
import { ColourService } from './colour/colour.service';
import { createSearchEngine } from './search';
import { PrismaSearchQueryLogRepository } from './search/search.repository';
import { SearchService } from './search/search.service';
import { createEmailTransport } from './email';
import { EmailService } from './email/email.service';
import { TokenService } from './email/token.service';

/**
 * Composition root (dependency-injection seam). The ONE place that knows about concrete
 * drivers and wires them together; the rest of the app depends on interfaces. Swapping a
 * provider (telemetry → Sentry/PostHog in M11, audit → Prisma in M1, storage → R2 in M2)
 * is a change here plus an env flag — no call site edits.
 */
export interface Container {
  telemetry: Telemetry;
  audit: Audit;
  rateLimiter: RateLimiter;
  storage: StorageProvider;
  cdn: Cdn;
  fabricRepository: FabricRepository;
  fabricService: FabricService;
  colourRepository: ColourRepository;
  colourService: ColourService;
  searchService: SearchService;
  emailService: EmailService;
  tokenService: TokenService;
}

function build(): Container {
  const telemetry: Telemetry =
    process.env.NODE_ENV === 'production' && !process.env.TELEMETRY_VERBOSE ? new NoopTelemetry() : new ConsoleTelemetry();

  const audit: Audit = new PrismaAudit(prisma);
  const rateLimiter: RateLimiter = new InMemoryRateLimiter();
  const storage = createStorage();
  const cdn = createCdn(storage);

  const fabricRepository = new PrismaFabricRepository(prisma);
  const fabricService = new FabricService(fabricRepository);
  const colourRepository = new PrismaColourRepository(prisma);
  const colourService = new ColourService(colourRepository);
  const searchService = new SearchService(createSearchEngine(prisma), new PrismaSearchQueryLogRepository(prisma), prisma, telemetry);
  const emailService = new EmailService(createEmailTransport());
  const tokenService = new TokenService(prisma);

  return { telemetry, audit, rateLimiter, storage, cdn, fabricRepository, fabricService, colourRepository, colourService, searchService, emailService, tokenService };
}

const globalForContainer = globalThis as unknown as { __pcContainer?: Container };

export function getContainer(): Container {
  if (!globalForContainer.__pcContainer) {
    globalForContainer.__pcContainer = build();
  }
  return globalForContainer.__pcContainer;
}
