import type { PrismaClient } from '@/generated/prisma/client';

export interface SearchQueryLogRepository {
  log(query: string, normalized: string, userId: string | null, resultCount: number): Promise<void>;
  recentForUser(userId: string, limit: number): Promise<string[]>;
  popular(limit: number): Promise<Array<{ query: string; count: number }>>;
}

export class PrismaSearchQueryLogRepository implements SearchQueryLogRepository {
  constructor(private readonly db: PrismaClient) {}

  async log(query: string, normalized: string, userId: string | null, resultCount: number): Promise<void> {
    await this.db.searchQuery.create({ data: { query, normalized, userId, resultCount } });
  }

  async recentForUser(userId: string, limit: number): Promise<string[]> {
    const rows = await this.db.searchQuery.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { query: true, normalized: true },
      take: 50,
    });
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of rows) {
      if (seen.has(r.normalized)) continue;
      seen.add(r.normalized);
      out.push(r.query);
      if (out.length >= limit) break;
    }
    return out;
  }

  async popular(limit: number): Promise<Array<{ query: string; count: number }>> {
    const grouped = await this.db.searchQuery.groupBy({
      by: ['normalized'],
      _count: { normalized: true },
      orderBy: { _count: { normalized: 'desc' } },
      take: limit,
    });
    return grouped.map((g) => ({ query: g.normalized, count: g._count.normalized }));
  }
}
