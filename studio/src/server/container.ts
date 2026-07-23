import { prisma } from '@/lib/prisma';
import { type Telemetry, ConsoleTelemetry, NoopTelemetry } from './core/telemetry';
import { type Audit, ConsoleAudit } from './core/audit';
import { PrismaFabricRepository, type FabricRepository } from './fabric/fabric.repository';
import { FabricService } from './fabric/fabric.service';

/**
 * Composition root (dependency-injection seam). The ONE place that knows about concrete
 * drivers and wires them together; the rest of the app depends on interfaces. Swapping a
 * provider (telemetry → Sentry/PostHog in M11, audit → Prisma in M1, storage → R2 in M2)
 * is a change here plus an env flag — no call site edits.
 */
export interface Container {
  telemetry: Telemetry;
  audit: Audit;
  fabricRepository: FabricRepository;
  fabricService: FabricService;
}

function build(): Container {
  const telemetry: Telemetry =
    process.env.NODE_ENV === 'production' && !process.env.TELEMETRY_VERBOSE ? new NoopTelemetry() : new ConsoleTelemetry();

  const audit: Audit = new ConsoleAudit();

  const fabricRepository = new PrismaFabricRepository(prisma);
  const fabricService = new FabricService(fabricRepository);

  return { telemetry, audit, fabricRepository, fabricService };
}

const globalForContainer = globalThis as unknown as { __pcContainer?: Container };

export function getContainer(): Container {
  if (!globalForContainer.__pcContainer) {
    globalForContainer.__pcContainer = build();
  }
  return globalForContainer.__pcContainer;
}
