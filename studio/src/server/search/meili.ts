import { Meilisearch, type Index } from 'meilisearch';
import type { SearchDoc, SearchEngine, SearchHit, SearchOptions, SearchResults } from './engine';

const INDEX = 'catalogue';

/** Meili document ids must match [a-zA-Z0-9_-], so we can't use the "type:id" form directly. */
function uid(doc: SearchDoc): string {
  return `${doc.type}_${doc.colourId ?? doc.fabricId}`;
}

/**
 * Meilisearch engine (Priority 10), enabled when MEILI_HOST is set. Provides instant search
 * with built-in typo tolerance, filtering, and ranking. Documents mirror the Postgres
 * engine's corpus so results are consistent across drivers.
 */
export class MeiliSearchEngine implements SearchEngine {
  readonly name = 'meilisearch';
  private client: Meilisearch;

  constructor(host: string, apiKey?: string) {
    this.client = new Meilisearch({ host, apiKey });
  }

  private index(): Index {
    return this.client.index(INDEX);
  }

  private async ensureSettings(): Promise<void> {
    await this.client.createIndex(INDEX, { primaryKey: 'uid' }).catch(() => {});
    await this.index().updateSettings({
      searchableAttributes: ['name', 'fabricName', 'composition', 'text'],
      filterableAttributes: ['type', 'family', 'temperature', 'fabricId'],
      rankingRules: ['words', 'typo', 'proximity', 'attribute', 'exactness'],
    });
  }

  async reindex(docs: SearchDoc[]): Promise<void> {
    await this.ensureSettings();
    await this.index().deleteAllDocuments();
    if (docs.length) await this.index().addDocuments(docs.map((d) => ({ ...d, uid: uid(d) })));
  }

  async upsert(docs: SearchDoc[]): Promise<void> {
    await this.ensureSettings();
    if (docs.length) await this.index().addDocuments(docs.map((d) => ({ ...d, uid: uid(d) })));
  }

  async remove(ids: string[]): Promise<void> {
    // ids come in "type:rawId" form; convert to the stored uid form.
    await this.index().deleteDocuments(ids.map((id) => id.replace(':', '_')));
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResults> {
    const limit = options.limit ?? 8;
    const filter = buildFilter(options.filters);
    const res = await this.index().search<SearchDoc>(query, {
      limit,
      filter,
      showRankingScore: true,
    });
    const hits: SearchHit[] = res.hits.map((h, i) => ({
      ...h,
      id: `${h.type}:${h.colourId ?? h.fabricId}`,
      score: (h as SearchDoc & { _rankingScore?: number })._rankingScore ?? 1 - i * 0.01,
    }));
    return { hits, total: res.estimatedTotalHits ?? hits.length, engine: this.name };
  }

  async suggest(prefix: string, limit = 6): Promise<string[]> {
    const res = await this.index().search<SearchDoc>(prefix, { limit: limit * 3 });
    return [...new Set(res.hits.map((h) => h.name))].slice(0, limit);
  }
}

function buildFilter(f?: SearchOptions['filters']): string[] | undefined {
  if (!f) return undefined;
  const parts: string[] = [];
  if (f.type) parts.push(`type = "${f.type}"`);
  if (f.family) parts.push(`family = "${f.family}"`);
  if (f.temperature) parts.push(`temperature = "${f.temperature}"`);
  if (f.fabricId) parts.push(`fabricId = "${f.fabricId}"`);
  return parts.length ? parts : undefined;
}
