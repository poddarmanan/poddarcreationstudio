'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import type { FabricRow, ColourRow } from '@/lib/types';
import { dict, inCatalogueOrder, type Dict, type Lang, type GarmentKey, type LightKey, type RoomKey } from '@/lib/fabric-generator';
import { fabricTex, heroColour } from './helpers';
import { useSearch, type Search } from './search';
import { FABRIC_STORIES } from '@/lib/fabric-generator';

export type View = 'home' | 'showroom' | 'fabric' | 'colours' | 'book' | 'cart' | 'admin' | 'track';

/** A line in the cart: a shade, and how many metres of it. */
/** A delivery address from the buyer's address book. */
export interface Address {
  id: string;
  label: string;
  contactName?: string | null;
  phone?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  state?: string | null;
  pincode?: string | null;
  country?: string;
  isDefault?: boolean;
}
export type AddressInput = Omit<Address, 'id' | 'isDefault'>;

/** What Razorpay Checkout hands back for a completed payment, verified on the server. */
export interface RazorpayProof {
  orderId: string;
  paymentId: string;
  signature: string;
}
export type RazorpayResult = ({ ok: true; amount: number } & RazorpayProof) | { ok: false; reason: 'dismissed' | 'failed' | 'unavailable'; message?: string };

type RazorpayCheckout = new (options: Record<string, unknown>) => { open: () => void; on: (event: string, fn: (e: { error?: { description?: string } }) => void) => void };

/** Loads Razorpay Checkout's script, once. */
let checkoutScript: Promise<RazorpayCheckout | null> | null = null;
function loadCheckout(): Promise<RazorpayCheckout | null> {
  const w = window as unknown as { Razorpay?: RazorpayCheckout };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  checkoutScript ??= new Promise((resolve) => {
    const el = document.createElement('script');
    el.src = 'https://checkout.razorpay.com/v1/checkout.js';
    el.async = true;
    el.onload = () => resolve(w.Razorpay ?? null);
    el.onerror = () => {
      checkoutScript = null;
      resolve(null);
    };
    document.head.appendChild(el);
  });
  return checkoutScript;
}

export interface CartLine {
  fabricId: string;
  colourOrder: number;
  metres: number;
}

/**
 * An order as this device remembers it once placed: its reference, when, what (fabric, shade and
 * metres), where it goes and whether it was paid. The Track page shows these (on the preview they
 * are the only orders there are); a signed-in buyer's orders come from the account as well.
 */
export interface PlacedOrder {
  ref: string;
  placedAt: string;
  lines: { fabricId: string; colourOrder: number; metres: number }[];
  total: number;
  value: number;
  city?: string;
  timeline?: string;
  paid?: number;
  demo?: boolean;
}

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
  /** Where the cloth opens out from: the drape tapped, as insets of the screen ("12.5%"). */
  from?: { t: string; r: string; b: string; l: string };
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
  /**
   * Into a quality's lab: its cloth opens out to fill the screen (from the drape tapped, given
   * `from`), then the lab, on the drape. Given a shade, in that shade, and the lab opens on it.
   */
  unroll: (f: FabricRow, ci?: number, from?: DOMRect) => void;
  trans: TransState | null;
  garment: GarmentKey;
  setGarment: (g: GarmentKey) => void;
  light: LightKey;
  setLight: (l: LightKey) => void;
  wind: number;
  setWind: (w: number) => void;
  tests: Tests;
  toggleTest: (k: keyof Tests) => void;
  pins: Pin[];
  pinShade: (fabricId: string, colourOrder: number) => void;
  /** The cart: fabric to be ordered by the metre. Kept on this device. */
  cart: CartLine[];
  /** Orders placed from this device, newest first. */
  placedOrders: PlacedOrder[];
  rememberOrder: (o: PlacedOrder) => void;
  /** Adds shades to the cart (a shade already there gains the metres), and bumps the cart. */
  addToCart: (fabricId: string, colourOrders: number[], metres: number) => void;
  setCartMetres: (fabricId: string, colourOrder: number, metres: number) => void;
  removeFromCart: (fabricId: string, colourOrder: number) => void;
  clearCart: () => void;
  /** Counts up on every addition, so the cart button can play its arrival. */
  cartBump: number;
  /** Counts up each time shades go into the swatch book, so the book's tab can play their arrival. */
  bookBump: number;
  bumpBook: () => void;
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
  openQuote: () => void;
  closeQuote: () => void;
  /** Sends a quote request for the fabric on the stage. */
  sendQuote: (fields: { name: string; company: string; quantity: string }) => Promise<void>;
  /**
   * Orders the swatch book — every shade in it. A signed-in buyer's name, company and WhatsApp
   * come from their account on the server; `whatsapp` overrides the number. Resolves to whether
   * the server took the order, and its status (0 if unreachable).
   */
  orderBook: (whatsapp?: string) => Promise<{ ok: boolean; status: number }>;
  /**
   * Orders the fabric itself, skipping the swatch book: the metres for each shade, when it is
   * needed, and a note. Resolves to whether the server took it, and its reference.
   */
  orderFabric: (order: { lines: { fabricId: string; colourId: string; metres: number }[]; timeline: string; note: string; whatsapp?: string; shipTo?: string; payment?: string; razorpay?: RazorpayProof }) => Promise<{ ok: boolean; status: number; ref?: string }>;
  /** Razorpay's public key id when online payment is set up on this server, else null. */
  razorpayReady: () => Promise<string | null>;
  /** Pays for these lines with Razorpay Checkout; the amount is priced on the server. */
  payRazorpay: (lines: { fabricId: string; colourId: string; metres: number }[], prefill: { name?: string; contact?: string }) => Promise<RazorpayResult>;
  /** The buyer's saved delivery addresses, default first (kept on this device on the static preview). */
  listAddresses: () => Promise<Address[]>;
  /** Saves a delivery address to the buyer's book; the first becomes the default. */
  addAddress: (input: AddressInput) => Promise<Address | null>;
  /** The signed-in buyer's WhatsApp number on file, or null (and null when signed out). */
  accountWhatsapp: () => Promise<string | null>;
  /** Saves a WhatsApp number to the signed-in buyer's profile. */
  saveWhatsapp: (whatsapp: string) => Promise<boolean>;
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
  doRegister: (fields: { name: string; email: string; password: string; company?: string; whatsapp?: string; city?: string }) => Promise<string | null>;
  /** Sends a sign-in code to a WhatsApp number. `devCode` comes back only where no provider is configured. */
  startWhatsapp: (whatsapp: string) => Promise<{ ok: true; to: string; devCode?: string } | { ok: false; error: string }>;
  /**
   * Signs in with the code sent on WhatsApp. For a number with no account, the first try answers
   * 'needs_profile'; the same code with the buyer's name (and company, city) then creates one.
   */
  verifyWhatsapp: (whatsapp: string, code: string, details?: { name: string; company?: string; city?: string }) => Promise<'ok' | 'needs_profile' | 'bad_code' | 'error'>;
  /** Whether Google sign-in is configured on this server. */
  googleReady: () => Promise<boolean>;
  /** Whether WhatsApp sign-in can send codes on this server. */
  whatsappReady: () => Promise<boolean>;
  /** Leaves for Google's sign-in; the studio picks up where it was (and the order, if `order`) on return. */
  signInGoogle: (order: boolean) => void;
  /** Set when the page has come back from Google's sign-in in the middle of ordering. */
  resumeOrder: boolean;
  clearResumeOrder: () => void;
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

export function useStudio(rawFabrics: FabricRow[]): Studio {
  // In the catalogue's order (cotton, rayon, silk), whatever order they arrive in.
  const fabrics = useMemo(() => inCatalogueOrder(rawFabrics), [rawFabrics]);
  const { data: session } = useSession();
  const [view, setView] = useState<View>('home');
  const [lang, setLang] = useState<Lang>('en');
  const [room, setRoom] = useState<RoomKey>('cotton');
  const [fid, setFid] = useState('rayon14');
  const [ci, setCi] = useState(18);
  // The lab opens on the roll: the cloth itself, before any garment is cut from it.
  const [garment, setGarment] = useState<GarmentKey>('roll');
  const [light, setLight] = useState<LightKey>('studio');
  // Wind is on by default, and on means strong: the lab opens with the cloth moving.
  const [wind, setWind] = useState(3);
  const [tests, setTests] = useState<Tests>({ stretch: false, shine: false, d3: false });
  const [pins, setPins] = useState<Pin[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartBump, setCartBump] = useState(0);
  const [bookBump, setBookBump] = useState(0);
  // The cart lives on this device: read once, and written back whenever it changes.
  const cartLoaded = useRef(false);
  useEffect(() => {
    const tm = setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem('pc-cart') || '[]') as CartLine[];
        if (Array.isArray(saved) && saved.length) setCart(saved.filter((l) => l && typeof l.metres === 'number'));
      } catch {}
      cartLoaded.current = true;
    }, 0);
    return () => clearTimeout(tm);
  }, []);
  useEffect(() => {
    if (!cartLoaded.current) return;
    try {
      localStorage.setItem('pc-cart', JSON.stringify(cart));
    } catch {}
  }, [cart]);
  // Orders placed from this device, kept as the cart is.
  const [placedOrders, setPlacedOrders] = useState<PlacedOrder[]>([]);
  useEffect(() => {
    const tm = setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem('pc-orders') || '[]') as PlacedOrder[];
        if (Array.isArray(saved)) setPlacedOrders(saved.filter((o) => o && typeof o.ref === 'string'));
      } catch {}
    }, 0);
    return () => clearTimeout(tm);
  }, []);
  const rememberOrder = useCallback((o: PlacedOrder) => {
    setPlacedOrders((was) => {
      const next = [o, ...was.filter((w) => w.ref !== o.ref)].slice(0, 50);
      try {
        localStorage.setItem('pc-orders', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);
  const [q, setQ] = useState('');
  const [wallFab, setWallFab] = useState<string | null>(null);
  const [scope, setScope] = useState(false);
  const [scopeP, setScopeP] = useState(26);
  const [scene, setScene] = useState<Studio['scene']>(null);
  const [trans, setTrans] = useState<TransState | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteSent, setQuoteSent] = useState(false);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [ai, setAi] = useState<AiMatch | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const [resumeOrder, setResumeOrder] = useState(false);
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

  // Load the signed-in user's swatch book from the API (server is source of truth). Shades picked
  // before signing in are carried into the account first, so signing in never empties the book.
  const pinsRef = useRef(pins);
  useEffect(() => {
    pinsRef.current = pins;
  });
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    const loose = pinsRef.current.filter((p) => !p.id);
    const items = loose
      .map((p) => {
        const c = fabrics.find((x) => x.id === p.fabricId)?.colours.find((cc) => cc.order === p.colourOrder);
        return c ? { fabricId: p.fabricId, colourId: c.id } : null;
      })
      .filter((x): x is { fabricId: string; colourId: string } => !!x);
    const carry = items.length
      ? fetch('/api/swatchbook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) }).then((r) => r.ok)
      : Promise.resolve(true);
    carry
      .catch(() => false)
      .then((carried) =>
        fetch('/api/swatchbook')
          .then((r) => r.json())
          .then((data: { items: { id: string; fabricId: string; colour: { order: number } }[] }) => {
            if (cancelled || !data.items) return;
            const saved: Pin[] = data.items.map((i) => ({ id: i.id, fabricId: i.fabricId, colourOrder: i.colour.order }));
            // Should carrying them fail, the loose shades stay in the book on this device all the same.
            const kept = carried ? [] : loose.filter((p) => !saved.some((q) => q.fabricId === p.fabricId && q.colourOrder === p.colourOrder));
            setPins([...saved, ...kept]);
          }),
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [signedIn, fabrics]);

  const go = useCallback((v: View) => {
    setView(v);
    setSignInOpen(false);
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
    (f: FabricRow, ci?: number, from?: DOMRect) => {
      const shade = ci === undefined ? undefined : f.colours[ci];
      const o = shade ?? heroColour(f);
      const pct = (v: number, of: number) => `${Math.max(0, Math.min(100, (v / of) * 100)).toFixed(2)}%`;
      const W = window.innerWidth;
      const H = window.innerHeight;
      setTrans({
        tex: fabricTex(f, o, 6),
        name: shade ? shade.name : f.name,
        fg: o.l > 0.62 ? '#1C1917' : '#FAF8F5',
        story: shade ? f.name : (FABRIC_STORIES[f.id] ?? ''),
        from: from ? { t: pct(from.top, H), r: pct(W - from.right, W), b: pct(H - from.bottom, H), l: pct(from.left, W) } : undefined,
      });
      // From a drape in the halls, the lab opens on the drape, as the hall showed it. (Moving
      // between qualities inside the lab keeps the garment chosen.)
      if (from) setGarment('roll');
      timers.current.push(setTimeout(() => openFabric(f.id, shade ? ci : undefined), 720));
      timers.current.push(setTimeout(() => setTrans(null), 1250));
    },
    [openFabric]
  );

  const toggleTest = useCallback((k: keyof Tests) => {
    setTests((prev) => ({ ...prev, [k]: !prev[k] }));
  }, []);


  const addToCart = useCallback((fabricId: string, colourOrders: number[], metres: number) => {
    setCart((prev) => {
      const next = [...prev];
      for (const colourOrder of colourOrders) {
        const at = next.findIndex((l) => l.fabricId === fabricId && l.colourOrder === colourOrder);
        if (at >= 0) next[at] = { ...next[at], metres: Math.min(100_000, next[at].metres + metres) };
        else next.push({ fabricId, colourOrder, metres });
      }
      return next;
    });
    setCartBump((n) => n + 1);
  }, []);
  const setCartMetres = useCallback((fabricId: string, colourOrder: number, metres: number) => {
    setCart((prev) => prev.map((l) => (l.fabricId === fabricId && l.colourOrder === colourOrder ? { ...l, metres: Math.max(0, Math.min(100_000, Math.round(metres))) } : l)));
  }, []);
  const bumpBook = useCallback(() => setBookBump((n) => n + 1), []);
  const removeFromCart = useCallback((fabricId: string, colourOrder: number) => {
    setCart((prev) => prev.filter((l) => !(l.fabricId === fabricId && l.colourOrder === colourOrder)));
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
        await fetch('/api/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...fields, subject: `${f.name} · ${col.name} · ${f.weight}`, items: [{ fabricId: f.id, colourId: col.id }] }),
        });
        setQuoteSent(true);
      } finally {
        setQuoteBusy(false);
      }
    },
    [fab, fid, ci]
  );

  const orderBook = useCallback(
    async (whatsapp?: string) => {
      const book = pins
        .map((p) => {
          const x = fab(p.fabricId);
          const c = x.colours.find((cc) => cc.order === p.colourOrder);
          return c ? { x, c } : null;
        })
        .filter((k): k is { x: FabricRow; c: FabricRow['colours'][number] } => !!k);
      try {
        const res = await fetch('/api/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quantity: `${book.length} ${book.length === 1 ? 'shade' : 'shades'} · Swatch Book`,
            subject: book.map(({ x, c }) => `${c.name} (${x.name})`).join(', ') || '—',
            items: book.map(({ x, c }) => ({ fabricId: x.id, colourId: c.id })),
            ...(whatsapp ? { whatsapp } : {}),
          }),
        });
        return { ok: res.ok, status: res.status };
      } catch {
        return { ok: false, status: 0 };
      }
    },
    [fab, pins]
  );

  const orderFabric = useCallback(
    async ({ lines, timeline, note, whatsapp, shipTo, payment, razorpay }: { lines: { fabricId: string; colourId: string; metres: number }[]; timeline: string; note: string; whatsapp?: string; shipTo?: string; payment?: string; razorpay?: RazorpayProof }) => {
      const total = lines.reduce((s, l) => s + l.metres, 0);
      const subject = lines
        .map((l) => {
          const x = fab(l.fabricId);
          const c = x.colours.find((cc) => cc.id === l.colourId);
          return c ? `${c.name} (${x.name}) × ${l.metres} m` : '';
        })
        .filter(Boolean)
        .join(', ');
      try {
        const res = await fetch('/api/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quantity: `${total.toLocaleString('en-IN')} m · Fabric order`,
            expectedQty: `${total} m`,
            subject: subject || '—',
            timeline: timeline || undefined,
            message: note.trim() || undefined,
            items: lines.map((l) => ({ fabricId: l.fabricId, colourId: l.colourId, quantity: l.metres, unit: 'm' })),
            ...(whatsapp ? { whatsapp } : {}),
            ...(shipTo ? { shipTo } : {}),
            ...(payment ? { paymentMethod: payment } : {}),
            ...(razorpay ? { razorpay } : {}),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { quote?: { id?: string } };
        return { ok: res.ok, status: res.status, ref: data.quote?.id ? `PC-${data.quote.id.slice(-6).toUpperCase()}` : undefined };
      } catch {
        return { ok: false, status: 0 };
      }
    },
    [fab]
  );

  const razorpayReady = useCallback(async () => {
    if (process.env.NEXT_PUBLIC_BASE_PATH) return null;
    try {
      const res = await fetch('/api/payments/razorpay');
      if (!res.ok) return null;
      return ((await res.json()) as { ready: boolean; keyId: string | null }).keyId;
    } catch {
      return null;
    }
  }, []);
  const payRazorpay = useCallback(async (lines: { fabricId: string; colourId: string; metres: number }[], prefill: { name?: string; contact?: string }): Promise<RazorpayResult> => {
    let order: { orderId: string; amount: number; currency: string; keyId: string };
    try {
      const res = await fetch('/api/payments/razorpay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines }) });
      const data = (await res.json().catch(() => ({}))) as typeof order & { error?: { message?: string } };
      if (!res.ok) return { ok: false, reason: 'unavailable', message: data.error?.message };
      order = data;
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
    const Checkout = await loadCheckout();
    if (!Checkout) return { ok: false, reason: 'unavailable' };
    return new Promise<RazorpayResult>((resolve) => {
      const rzp = new Checkout({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: 'Poddar Creation',
        description: 'Fabric order',
        prefill: { name: prefill.name, contact: prefill.contact },
        theme: { color: '#1C1917' },
        handler: (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
          resolve({ ok: true, amount: order.amount, orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }),
        modal: { ondismiss: () => resolve({ ok: false, reason: 'dismissed' }) },
      });
      rzp.on('payment.failed', (e) => resolve({ ok: false, reason: 'failed', message: e.error?.description }));
      rzp.open();
    });
  }, []);

  // The address book: the account's on the live site, this device's on the static preview.
  const listAddresses = useCallback(async (): Promise<Address[]> => {
    if (process.env.NEXT_PUBLIC_BASE_PATH) {
      try {
        const saved = JSON.parse(localStorage.getItem('pc-addresses') || '[]') as Address[];
        return Array.isArray(saved) ? saved : [];
      } catch {
        return [];
      }
    }
    try {
      const res = await fetch('/api/portal/addresses');
      if (!res.ok) return [];
      return ((await res.json()) as { addresses: Address[] }).addresses;
    } catch {
      return [];
    }
  }, []);
  const addAddress = useCallback(
    async (input: AddressInput): Promise<Address | null> => {
      if (process.env.NEXT_PUBLIC_BASE_PATH) {
        const was = await listAddresses();
        const address: Address = { ...input, id: `local-${Date.now()}`, isDefault: !was.length };
        try {
          localStorage.setItem('pc-addresses', JSON.stringify([...was, address]));
        } catch {}
        return address;
      }
      try {
        const res = await fetch('/api/portal/addresses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
        if (!res.ok) return null;
        return ((await res.json()) as { address: Address }).address;
      } catch {
        return null;
      }
    },
    [listAddresses]
  );

  const accountWhatsapp = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/profile');
      if (!res.ok) return null;
      const { profile } = (await res.json()) as { profile: { whatsapp?: string | null; contactPhone?: string | null } | null };
      return profile?.whatsapp || profile?.contactPhone || null;
    } catch {
      return null;
    }
  }, []);

  const saveWhatsapp = useCallback(async (whatsapp: string) => {
    try {
      const res = await fetch('/api/portal/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ whatsapp, prefWhatsapp: true }) });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

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

  const startWhatsapp = useCallback(async (whatsapp: string) => {
    try {
      const res = await fetch('/api/auth/whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ whatsapp }) });
      const data = (await res.json().catch(() => ({}))) as { to?: string; devCode?: string; error?: string };
      if (!res.ok) return { ok: false as const, error: data.error ?? 'We could not send the code just now.' };
      return { ok: true as const, to: data.to ?? whatsapp, devCode: data.devCode };
    } catch {
      return { ok: false as const, error: 'We could not reach the studio just now.' };
    }
  }, []);

  const verifyWhatsapp = useCallback(async (whatsapp: string, code: string, details?: { name: string; company?: string; city?: string }) => {
    try {
      const res = await signIn('whatsapp', { whatsapp, code, ...(details ?? {}), redirect: false });
      if (!res?.error) return 'ok' as const;
      if (res.code === 'needs_profile') return 'needs_profile' as const;
      return 'bad_code' as const;
    } catch {
      return 'error' as const;
    }
  }, []);

  const googleReady = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/providers');
      if (!res.ok) return false;
      return 'google' in ((await res.json()) as Record<string, unknown>);
    } catch {
      return false;
    }
  }, []);

  const whatsappReady = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/whatsapp');
      return res.ok && !!((await res.json()) as { ready?: boolean }).ready;
    } catch {
      return false;
    }
  }, []);

  const signInGoogle = useCallback(
    (order: boolean) => {
      // Google's sign-in leaves the page. What must survive the round trip — the view, the shades
      // picked before signing in, and whether an order was under way — waits in the session.
      try {
        sessionStorage.setItem('pc-resume', JSON.stringify({ view, pins: pins.filter((p) => !p.id), order }));
      } catch {}
      signIn('google', { redirectTo: window.location.href });
    },
    [view, pins]
  );

  // Back from Google: restore the view, the loose shades and the order under way.
  useEffect(() => {
    let saved: { view: View; pins: Pin[]; order: boolean } | null = null;
    try {
      saved = JSON.parse(sessionStorage.getItem('pc-resume') || 'null');
      sessionStorage.removeItem('pc-resume');
    } catch {}
    if (!saved) return;
    const back = saved;
    const tm = setTimeout(() => {
      setView(back.view);
      if (back.pins?.length) setPins((p) => (p.length ? p : back.pins));
      if (back.order) setResumeOrder(true);
    }, 0);
    return () => clearTimeout(tm);
  }, []);

  const doRegister = useCallback(
    async ({ name, email, password, company, whatsapp, city }: { name: string; email: string; password: string; company?: string; whatsapp?: string; city?: string }): Promise<string | null> => {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, company: company || undefined, whatsapp: whatsapp || undefined, city: city || undefined }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        return data?.error ?? 'Could not create the account.';
      }
      return doSignIn(email.trim().toLowerCase(), password);
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
    pins,
    pinShade,
    cart,
    placedOrders,
    rememberOrder,
    addToCart,
    setCartMetres,
    removeFromCart,
    clearCart: () => setCart([]),
    cartBump,
    bookBump,
    bumpBook,
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
    openQuote: () => {
      setQuoteOpen(true);
      setQuoteSent(false);
    },
    closeQuote: () => setQuoteOpen(false),
    sendQuote,
    orderBook,
    orderFabric,
    accountWhatsapp,
    listAddresses,
    addAddress,
    razorpayReady,
    payRazorpay,
    saveWhatsapp,
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
    openSignIn: () => {
      setSignInOpen(true);
      window.scrollTo(0, 0);
    },
    closeSignIn: () => setSignInOpen(false),
    doSignIn,
    doRegister,
    startWhatsapp,
    verifyWhatsapp,
    googleReady,
    whatsappReady,
    signInGoogle,
    resumeOrder,
    clearResumeOrder: () => setResumeOrder(false),
    doSignOut: () => signOut({ redirect: false }),
    fab,
    currentFabric,
    currentColour,
    reduceMotion,
  };
}
