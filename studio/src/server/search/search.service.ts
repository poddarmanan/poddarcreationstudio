import type { PrismaClient } from '@/generated/prisma/client';
import type { SearchEngine, SearchOptions, SearchResults } from './engine';
import type { SearchQueryLogRepository } from './search.repository';
import { buildSearchDocuments } from './index-docs';
import type { Telemetry } from '../core/telemetry';

/**
 * Search orchestration (Priority 10): runs the query through the active engine, logs it for
 * recent/popular analytics, and exposes suggestions + reindexing. Keeps route handlers and
 * the client agnostic to which engine (Meili or Postgres) is running.
 */
export class SearchService {
  constructor(
    private readonly engine: SearchEngine,
    private readonly log: SearchQueryLogRepository,
    private readonly db: PrismaClient,
    private readonly telemetry: Telemetry
  ) {}

  get engineName(): string {
    return this.engine.name;
  }

  async search(query: string, options: SearchOptions & { userId?: string | null } = {}): Promise<SearchResults> {
    const results = await this.engine.search(query, options);

    const normalized = query.trim().toLowerCase();
    if (normalized.length >= 2) {
      // Fire-and-forget: analytics must never slow or fail the search.
      this.log
        .log(query.trim(), normalized, options.userId ?? null, results.total)
        .catch((err) => this.telemetry.error(err, { where: 'search.log' }));
      this.telemetry.capture({ name: 'search.query', actorId: options.userId ?? undefined, props: { q: normalized, results: results.total, engine: results.engine } });
    }
    return results;
  }

  suggest(prefix: string, limit = 6): Promise<string[]> {
    return this.engine.suggest(prefix, limit);
  }

  recentForUser(userId: string, limit = 6): Promise<string[]> {
    return this.log.recentForUser(userId, limit);
  }

  popular(limit = 8): Promise<Array<{ query: string; count: number }>> {
    return this.log.popular(limit);
  }

  /** Rebuild the search index from the catalogue (no-op for the Postgres engine). */
  async reindex(): Promise<number> {
    const docs = await buildSearchDocuments(this.db);
    await this.engine.reindex(docs);
    return docs.length;
  }
}
