'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FabricRow } from '@/lib/types';
import { assistant } from '@/lib/fabric-generator';
import { colourCss, heroColour } from './helpers';

/**
 * The studio's search, as one hook.
 *
 * It lives here rather than inside a component because two surfaces now ask the same
 * question: the hero's search bar on a desktop and the header's expanding pill on a phone.
 * Running it once, in `useStudio`, means one debounce and one request no matter how many
 * places render the answer — two copies of this logic would fire two identical fetches for
 * every keystroke.
 */

export interface SearchResult {
  key: string;
  label: string;
  /** The line beneath the name — a fabric's weight and width, or a shade's quality. */
  sub: string;
  /** Swatch colour for the leading dot. */
  dot: string;
  go: () => void;
}

interface Hit {
  type: string;
  name: string;
  fabricId: string;
  colourId?: string;
  hex?: string;
}

export interface Search {
  results: SearchResult[];
  /** The studio assistant's reading of a phrase like "summer kurtis", when it has one. */
  asst: ReturnType<typeof assistant> | null;
  hasResults: boolean;
}

export function useSearch(
  fabrics: FabricRow[],
  q: string,
  setQ: (q: string) => void,
  openFabric: (id: string, ci?: number) => void
): Search {
  const query = q.trim();
  const asst = query ? assistant(query) : null;

  // Instant, offline-safe baseline (in-memory substring/prefix match over loaded fabrics).
  const localResults = useMemo<SearchResult[]>(() => {
    if (!query) return [];
    const ql = query.toLowerCase();
    const out: SearchResult[] = [];
    fabrics.forEach((f) => {
      if ((f.name + ' ' + f.comp + ' ' + f.weight + ' ' + f.width).toLowerCase().includes(ql)) {
        out.push({ key: `f-${f.id}`, label: f.name, sub: `${f.weight} · ${f.width}`, dot: colourCss(heroColour(f)), go: () => { setQ(''); openFabric(f.id); } });
      }
      f.colours.forEach((c, j) => {
        if (c.name.toLowerCase().startsWith(ql)) {
          out.push({ key: `c-${f.id}-${j}`, label: c.name, sub: f.name, dot: colourCss(c), go: () => { setQ(''); openFabric(f.id, j); } });
        }
      });
    });
    return out.slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, fabrics]);

  // Typo-tolerant results from the search service (Meilisearch / Postgres trigram). Falls
  // back to the instant local list until the request resolves, and if it ever fails.
  // Keyed by the query they answer, so a stale response never renders against a newer
  // query and the short-query case needs no state reset.
  const [apiResults, setApiResults] = useState<{ query: string; items: SearchResult[] } | null>(null);
  useEffect(() => {
    if (query.length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=6`, { signal: ctrl.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { hits: Hit[] };
        const items: SearchResult[] = data.hits.map((h) => {
          const fab = fabrics.find((f) => f.id === h.fabricId);
          if (h.type === 'colour' && fab) {
            const j = fab.colours.findIndex((c) => c.id === h.colourId);
            const col = j >= 0 ? fab.colours[j] : fab.colours[0];
            return { key: `a-c-${h.colourId}`, label: h.name, sub: fab.name, dot: h.hex ?? colourCss(col), go: () => { setQ(''); openFabric(fab.id, Math.max(0, j)); } };
          }
          return { key: `a-f-${h.fabricId}`, label: h.name, sub: fab ? `${fab.weight} · ${fab.width}` : '', dot: fab ? colourCss(heroColour(fab)) : '#8A6D45', go: () => { setQ(''); openFabric(h.fabricId); } };
        });
        setApiResults({ query, items });
      } catch {
        /* aborted or offline — keep the instant local results */
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, fabrics]);

  const results = apiResults?.query === query ? apiResults.items : localResults;
  return { results, asst, hasResults: !!(results.length || asst) };
}
