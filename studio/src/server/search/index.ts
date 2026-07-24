import type { PrismaClient } from '@/generated/prisma/client';
import type { SearchEngine } from './engine';
import { PostgresSearchEngine } from './postgres';
import { MeiliSearchEngine } from './meili';

export type { SearchEngine, SearchDoc, SearchHit, SearchResults, SearchFilters } from './engine';

/**
 * Selects the search engine: Meilisearch when MEILI_HOST is configured, else the built-in
 * Postgres trigram engine (default, zero external deps — keeps search working everywhere).
 */
export function createSearchEngine(db: PrismaClient): SearchEngine {
  const host = process.env.MEILI_HOST;
  if (host) return new MeiliSearchEngine(host, process.env.MEILI_API_KEY);
  return new PostgresSearchEngine(db);
}
