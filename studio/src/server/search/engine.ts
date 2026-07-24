/**
 * Search abstraction (Priority 10). App code depends on this interface; the composition
 * root picks Meilisearch (when MEILI_HOST is set) or the Postgres trigram fallback (default,
 * zero external deps). Both provide typo tolerance, ranking, filtering, and suggestions.
 */

export type SearchDocType = 'fabric' | 'colour';

export interface SearchDoc {
  /** Stable unique id, prefixed by type, e.g. "colour:<id>" / "fabric:<id>". */
  id: string;
  type: SearchDocType;
  name: string;
  fabricId: string;
  fabricName: string;
  colourId?: string;
  family: string;
  weight: string;
  width: string;
  composition: string;
  hex?: string;
  temperature?: string;
  /** Precomputed text blob for full-text matching. */
  text: string;
}

export interface SearchFilters {
  type?: SearchDocType;
  family?: string;
  temperature?: string;
  fabricId?: string;
}

export interface SearchOptions {
  limit?: number;
  filters?: SearchFilters;
}

export interface SearchHit extends SearchDoc {
  score: number;
}

export interface SearchResults {
  hits: SearchHit[];
  total: number;
  engine: string;
}

export interface SearchEngine {
  readonly name: string;
  /** Replace the entire index with the given documents (used by reindex). */
  reindex(docs: SearchDoc[]): Promise<void>;
  /** Insert or update documents. */
  upsert(docs: SearchDoc[]): Promise<void>;
  remove(ids: string[]): Promise<void>;
  search(query: string, options?: SearchOptions): Promise<SearchResults>;
  /** Short autocomplete suggestions (distinct names) for a prefix. */
  suggest(prefix: string, limit?: number): Promise<string[]>;
}
