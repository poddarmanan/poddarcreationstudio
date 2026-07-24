import { prisma } from '@/lib/prisma';
import { type Telemetry } from './core/telemetry';
import { createTelemetry } from './core/telemetry-factory';
import { type Audit } from './core/audit';
import { PrismaAudit } from './core/audit-prisma';
import { type RateLimiter, InMemoryRateLimiter } from './core/rate-limit';
import { TtlCache } from './core/ttl-cache';
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
import { DealerService } from './dealer/dealer.service';
import { CustomerService } from './customer/customer.service';
import { CollectionService } from './collection/collection.service';
import { ActivityService } from './activity/activity.service';
import { DashboardService } from './dashboard/dashboard.service';
import { SalesService } from './sales/sales.service';
import { QuoteService } from './quote/quote.service';
import { SampleService } from './sample/sample.service';
import { AdminService } from './admin/admin.service';

/**
 * Composition root (dependency-injection seam). The ONE place that knows about concrete
 * drivers and wires them together; the rest of the app depends on interfaces. Swapping a
 * provider (telemetry → Sentry/PostHog, audit → Prisma, storage → R2, search → Meilisearch)
 * is a change here plus an env flag — no call site edits.
 */
export interface Container {
  telemetry: Telemetry;
  audit: Audit;
  rateLimiter: RateLimiter;
  cache: TtlCache;
  storage: StorageProvider;
  cdn: Cdn;
  fabricRepository: FabricRepository;
  fabricService: FabricService;
  colourRepository: ColourRepository;
  colourService: ColourService;
  searchService: SearchService;
  emailService: EmailService;
  tokenService: TokenService;
  dealerService: DealerService;
  customerService: CustomerService;
  collectionService: CollectionService;
  activityService: ActivityService;
  dashboardService: DashboardService;
  salesService: SalesService;
  quoteService: QuoteService;
  sampleService: SampleService;
  adminService: AdminService;
}

function build(): Container {
  const telemetry: Telemetry = createTelemetry();

  const audit: Audit = new PrismaAudit(prisma);
  const rateLimiter: RateLimiter = new InMemoryRateLimiter();
  const cache = new TtlCache();
  const storage = createStorage();
  const cdn = createCdn(storage);

  const fabricRepository = new PrismaFabricRepository(prisma);
  const fabricService = new FabricService(fabricRepository, cache);
  const colourRepository = new PrismaColourRepository(prisma);
  const colourService = new ColourService(colourRepository);
  const searchService = new SearchService(createSearchEngine(prisma), new PrismaSearchQueryLogRepository(prisma), prisma, telemetry);
  const emailService = new EmailService(createEmailTransport());
  const tokenService = new TokenService(prisma);
  const activityService = new ActivityService(prisma);
  const dealerService = new DealerService(prisma, activityService);
  const customerService = new CustomerService(prisma, emailService, tokenService, telemetry);
  const quoteService = new QuoteService(prisma, emailService, telemetry, activityService);
  const collectionService = new CollectionService(prisma, quoteService, telemetry, activityService);
  const sampleService = new SampleService(prisma, emailService, telemetry, activityService);
  const adminService = new AdminService(prisma, storage);
  const dashboardService = new DashboardService(prisma, dealerService, collectionService, sampleService, activityService);
  const salesService = new SalesService(prisma, telemetry);

  return { telemetry, audit, rateLimiter, cache, storage, cdn, fabricRepository, fabricService, colourRepository, colourService, searchService, emailService, tokenService, dealerService, customerService, collectionService, activityService, dashboardService, salesService, quoteService, sampleService, adminService };
}

const globalForContainer = globalThis as unknown as { __pcContainer?: Container };

export function getContainer(): Container {
  if (!globalForContainer.__pcContainer) {
    globalForContainer.__pcContainer = build();
  }
  return globalForContainer.__pcContainer;
}
