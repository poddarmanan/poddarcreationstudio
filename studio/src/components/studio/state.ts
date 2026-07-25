'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import type { FabricRow, ColourRow } from '@/lib/types';
import { dict, type Dict, type Lang, type GarmentKey, type LightKey, type RoomKey } from '@/lib/fabric-generator';
import { fabricTex, heroColour } from './helpers';
import { useSearch, type Search } from './search';
import { FABRIC_STORIES } from '@/lib/fabric-generator';

export type View = 'home' | 'showroom' | 'collection' | 'fabric' | 'colours' | 'compare' | 'book' | 'admin';

export interface Pin {
  id?: string;
  fabricId: string;
  colourOrder: number;
}

export interface Tests {
  stretch: boolean;
  shine: boolean;
  /** "Watch in 3D": oscillating rotation with a mannequin/stand behind the garment. */
  d3: boolean;
}

export interface TransState {
  tex: string;
  name: string;
  fg: string;
  story: string;
}

export interface AiMatch {
  fi: number;
  ci: number;
  conf: number;
}

export interface Studio {
  fabrics: FabricRow[];
  t: Dict;
  lang: Lang;
  toggleLang: () => void;
  view: View;
  go: (view: View) => void;
  room: RoomKey;
  setRoom: (r: RoomKey) => void;
  fid: string;
  ci: number;
  setCi: (ci: number) => void;
  openFabric: (id: string, ci?: number) => void;
  unroll: (f: FabricRow) => void;
  trans: TransState | null;
  garment: GarmentKey;
  setGarment: (g: GarmentKey) => void;
  light: LightKey;
  setLight: (l: LightKey) => void;
  wind: number;
  setWind: (w: number) => void;
  tests: Tests;
  toggleTest: (k: keyof Tests) => void;
  compare: string[];
  toggleCompare: (id: string) => void;
  removeCompare: (id: string) => void;
  pins: Pin[];
  pinShade: (fabricId: string, colourOrder: number) => void;
  removePin: (pin: Pin) => void;
  q: string;
  setQ: (q: string) => void;
  /** Results, and the assistant's reading, for whatever is in `q`. */
  search: Search;
  wallFab: string | null;
  setWallFab: (id: string | null) => void;
  scope: boolean;
  scopeP: number;
  openScope: (p: number) => void;
  closeScope: () => void;
  scene: { label: string; css: string; moving: boolean; fg: string } | null;
  openScene: (scene: { label: string; css: string; moving: boolean; fg: string }) => void;
  closeScene: () => void;
  quoteOpen: boolean;
  quoteSent: boolean;
  quoteFromBook: boolean;
  openQuote: () => void;
  openQuoteBook: () => void;
  closeQuote: () => void;
  sendQuote: (fields: { name: string; company: string; quantity: string }) => Promise<void>;
  quoteBusy: boolean;
  aiOpen: boolean;
  aiBusy: boolean;
  ai: AiMatch | null;
  runAi: () => void;
  closeAi: () => void;
  signedIn: boolean;
  approved: boolean;
  isStaff: boolean;
  canManage: boolean;
  userName: string | null;
  signInOpen: boolean;
  openSignIn: () => void;
  closeSignIn: () => void;
  doSignIn: (email: string, password: string) => Promise<string | null>;
  doRegister: (name: string, email: string, password: string, company: string) => Promise<string | null>;
  doSignOut: () => void;
  fab: (id: string) => FabricRow;
  currentFabric: FabricRow;
  currentColour: ColourRow;
  reduceMotion: boolean;
}

/**
 * `prefers-reduced-motion` as an external store. Reading it through useSyncExternalStore
 * (instead of setting state from an effect) keeps the server snapshot deterministic and
 * avoids a cascading render on mount — the honoured value and behaviour are unchanged.
 */
const MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReduceMotion(onChange: () => void): () => void {
  const mq = window.matchMedia(MOTION_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function getReduceMotion(): boolean {
  return window.matchMedia(MOTION_QUERY).matches;
}

export function useStudio(fabrics: FabricRow[]): Studio {
  const { data: session } = useSession();
  const [view, setView] = useState<View>('home');
  const [lang, setLang] = useState<Lang>('en');
  const [room, setRoom] = useState<RoomKey>('hall');
  const [fid, setFid] = useState('rayon14');
  const [ci, setCi] = useState(18);
  const [garment, setGarment] = useState<GarmentKey>('kurti');
  const [light, setLight] = useState<LightKey>('studio');
  const [wind, setWind] = useState(1);
  const [tests, setTests] = useState<Tests>({ stretch: false, shine: false, d3: false });
  const [compare, setCompare] = useState<string[]>(['rayon14', 'gajji']);
  const [pins, setPins] = useState<Pin[]>([]);
  const [q, setQ] = useState('');
  const [wallFab, setWallFab] = useState<string | null>(null);
  const [scope, setScope] = useState(false);
  const [scopeP, setScopeP] = useState(26);
  const [scene, setScene] = useState<Studio['scene']>(null);
  const [trans, setTrans] = useState<TransState | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteSent, setQuoteSent] = useState(false);
  const [quoteFromBook, setQuoteFromBook] = useState(false);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [ai, setAi] = useState<AiMatch | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const reduceMotion = useSyncExternalStore(subscribeReduceMotion, getReduceMotion, () => false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const fab = useCallback(
    (id: string) => fabrics.find((f) => f.id === id) ?? fabrics[0],
    [fabrics]
  );

  const currentFabric = fab(fid);
  const currentColour = currentFabric.colours[Math.min(ci, currentFabric.colours.length - 1)];

  const t = useMemo(() => dict(lang), [lang]);

  const signedIn = !!session?.user;
  const approved = !!session?.user?.approved;
  const role = session?.user?.role;
  const isStaff = !!role && ['ADMIN', 'MANAGER', 'SALES'].includes(role);
  const canManage = !!role && ['ADMIN', 'MANAGER'].includes(role);

  // Load the signed-in user's swatch book from the API (server is source of truth).
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    fetch('/api/swatchbook')
      .then((r) => r.json())
      .then((data: { items: { id: string; fabricId: string; colour: { order: number } }[] }) => {
        if (cancelled || !data.items) return;
        setPins(data.items.map((i) => ({ id: i.id, fabricId: i.fabricId, colourOrder: i.colour.order })));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const go = useCallback((v: View) => {
    setView(v);
    setScope(false);
    setScene(null);
    setTests({ stretch: false, shine: false, d3: false });
    window.scrollTo(0, 0);
  }, []);

  const openFabric = useCallback(
    (id: string, colourIdx?: number) => {
      const f = fab(id);
      const idx = colourIdx === undefined ? f.heroIndex : colourIdx;
      setFid(id);
      setCi(idx);
      go('fabric');
      // Record for the dealer portal's "recently viewed" — fire-and-forget; the endpoint
      // no-ops for anonymous visitors, so this is a no-op unless the buyer is signed in.
      const colourId = f.colours[idx]?.id;
      if (colourId) {
        fetch('/api/portal/recent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fabricId: id, colourId }) }).catch(() => {});
      }
    },
    [fab, go]
  );

  // One search for the whole studio: the hero bar and the phone's header pill render the
  // same answer, so only one debounce and one request happen per keystroke.
  const search = useSearch(fabrics, q, setQ, openFabric);

  const unroll = useCallback(
    (f: FabricRow) => {
      const o = heroColour(f);
      setTrans({
        tex: fabricTex(f, o, 6),
        name: f.name,
        fg: o.l > 0.62 ? '#1C1917' : '#FAF8F5',
        story: FABRIC_STORIES[f.id] ?? '',
      });
      timers.current.push(setTimeout(() => openFabric(f.id), 720));
      timers.current.push(setTimeout(() => setTrans(null), 1250));
    },
    [openFabric]
  );

  const toggleTest = useCallback((k: keyof Tests) => {
    setTests((prev) => ({ ...prev, [k]: !prev[k] }));
  }, []);

  const toggleCompare = useCallback((id: string) => {
    setCompare((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  }, []);

  const removeCompare = useCallback((id: string) => {
    setCompare((prev) => prev.filter((x) => x !== id));
  }, []);

  const pinShade = useCallback(
    (fabricId: string, colourOrder: number) => {
      setPins((prev) => {
        if (prev.some((p) => p.fabricId === fabricId && p.colourOrder === colourOrder)) return prev;
        return [...prev, { fabricId, colourOrder }];
      });
      if (signedIn) {
        const f = fab(fabricId);
        const colour = f.colours.find((c) => c.order === colourOrder);
        if (colour) {
          fetch('/api/swatchbook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fabricId, colourId: colour.id }),
          })
            .then((r) => r.json())
            .then((data: { item?: { id: string } }) => {
              if (data.item) {
                setPins((prev) =>
                  prev.map((p) =>
                    p.fabricId === fabricId && p.colourOrder === colourOrder ? { ...p, id: data.item!.id } : p
                  )
                );
              }
            })
            .catch(() => {});
        }
      }
    },
    [signedIn, fab]
  );

  const removePin = useCallback(
    (pin: Pin) => {
      setPins((prev) => prev.filter((p) => !(p.fabricId === pin.fabricId && p.colourOrder === pin.colourOrder)));
      if (signedIn && pin.id) {
        fetch(`/api/swatchbook/${pin.id}`, { method: 'DELETE' }).catch(() => {});
      }
    },
    [signedIn]
  );

  const openScope = useCallback((p: number) => {
    setScope(true);
    setScopeP(p);
  }, []);

  const sendQuote = useCallback(
    async (fields: { name: string; company: string; quantity: string }) => {
      setQuoteBusy(true);
      try {
        const f = fab(fid);
        const col = f.colours[Math.min(ci, f.colours.length - 1)];
        const subject = quoteFromBook
          ? pins
              .map((p) => {
                const x = fab(p.fabricId);
                const c = x.colours.find((cc) => cc.order === p.colourOrder);
                return c ? `${c.name} (${x.name})` : '';
              })
              .filter(Boolean)
              .join(', ') || '—'
          : `${f.name} · ${col.name} · ${f.weight}`;
        const items = quoteFromBook
          ? pins
              .map((p) => {
                const x = fab(p.fabricId);
                const c = x.colours.find((cc) => cc.order === p.colourOrder);
                return c ? { fabricId: x.id, colourId: c.id } : null;
              })
              .filter((x): x is { fabricId: string; colourId: string } => !!x)
          : [{ fabricId: f.id, colourId: col.id }];
        await fetch('/api/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...fields, subject, items }),
        });
        setQuoteSent(true);
      } finally {
        setQuoteBusy(false);
      }
    },
    [fab, fid, ci, quoteFromBook, pins]
  );

  const runAi = useCallback(() => {
    setAiOpen(true);
    setAiBusy(true);
    setAi(null);
    timers.current.push(
      setTimeout(() => {
        setAiBusy(false);
        setAi({
          fi: Math.floor(Math.random() * fabrics.length),
          ci: Math.floor(Math.random() * 24),
          conf: 88 + Math.floor(Math.random() * 10),
        });
      }, 1400)
    );
  }, [fabrics.length]);

  const doSignIn = useCallback(async (email: string, password: string): Promise<string | null> => {
    const res = await signIn('credentials', { email, password, redirect: false });
    if (res?.error) return 'Incorrect email or password.';
    return null;
  }, []);

  const doRegister = useCallback(
    async (name: string, email: string, password: string, company: string): Promise<string | null> => {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, company: company || undefined }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        return data?.error ?? 'Could not create the account.';
      }
      return doSignIn(email, password);
    },
    [doSignIn]
  );

  return {
    fabrics,
    t,
    lang,
    toggleLang: () => setLang((l) => (l === 'en' ? 'hi' : 'en')),
    view,
    go,
    room,
    setRoom,
    fid,
    ci,
    setCi,
    openFabric,
    unroll,
    trans,
    garment,
    setGarment,
    light,
    setLight,
    wind,
    setWind,
    tests,
    toggleTest,
    compare,
    toggleCompare,
    removeCompare,
    pins,
    pinShade,
    removePin,
    q,
    setQ,
    search,
    wallFab,
    setWallFab,
    scope,
    scopeP,
    openScope,
    closeScope: () => setScope(false),
    scene,
    openScene: setScene,
    closeScene: () => setScene(null),
    quoteOpen,
    quoteSent,
    quoteFromBook,
    openQuote: () => {
      setQuoteOpen(true);
      setQuoteSent(false);
      setQuoteFromBook(false);
    },
    openQuoteBook: () => {
      setQuoteOpen(true);
      setQuoteSent(false);
      setQuoteFromBook(true);
    },
    closeQuote: () => setQuoteOpen(false),
    sendQuote,
    quoteBusy,
    aiOpen,
    aiBusy,
    ai,
    runAi,
    closeAi: () => {
      setAiOpen(false);
      setAi(null);
    },
    signedIn,
    approved,
    isStaff,
    canManage,
    userName: session?.user?.name ?? null,
    signInOpen,
    openSignIn: () => setSignInOpen(true),
    closeSignIn: () => setSignInOpen(false),
    doSignIn,
    doRegister,
    doSignOut: () => signOut({ redirect: false }),
    fab,
    currentFabric,
    currentColour,
    reduceMotion,
  };
}
