/**
 * A burst of confetti from a point on the page — the buyer's shades cut as tiny pinked scraps,
 * with gold-foil strips and cream paper among them.
 *
 * Drawn on one canvas laid over everything, which removes itself when the last piece has
 * settled, so nothing is left running. Pieces tumble in 3D (their width follows the cosine of
 * their spin), flutter as they fall, and fade over the last half-second. Nothing is drawn when
 * the reader prefers reduced motion.
 */
const FOIL = ['#E9CF8F', '#C9A55E', '#F6E7BE', '#B8904A'];
const HOUSE = ['#5E1B21', '#FBF6EA', '#8A6D45'];

type Piece = {
  x: number; y: number; vx: number; vy: number;
  w: number; h: number; spin: number; vspin: number; tilt: number; vtilt: number;
  colour: string; foil: boolean; phase: number;
};

export function confettiBurst(from: DOMRect, shades: string[], count = 150) {
  if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: `${W}px`, height: `${H}px`, pointerEvents: 'none', zIndex: '140' });
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.remove();
  ctx.scale(dpr, dpr);

  const palette = [...shades.slice(0, 24), ...shades.slice(0, 24), ...FOIL, ...FOIL, ...HOUSE];
  const ox = from.left + from.width / 2;
  const oy = from.top + from.height / 2;
  const pieces: Piece[] = Array.from({ length: count }, () => {
    // Up and out in a fan, most of them high, a few flung wide.
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.95;
    const speed = 520 + Math.random() * 720;
    const colour = palette[Math.floor(Math.random() * palette.length)];
    const foil = FOIL.includes(colour);
    return {
      x: ox + (Math.random() - 0.5) * from.width * 0.6,
      y: oy + (Math.random() - 0.5) * from.height * 0.4,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: foil ? 4 + Math.random() * 3 : 7 + Math.random() * 6,
      h: foil ? 12 + Math.random() * 8 : 9 + Math.random() * 7,
      spin: Math.random() * Math.PI * 2,
      vspin: (Math.random() - 0.5) * 14,
      tilt: Math.random() * Math.PI * 2,
      vtilt: 4 + Math.random() * 8,
      colour, foil,
      phase: Math.random() * Math.PI * 2,
    };
  });

  const LIFE = 3.4;
  const start = performance.now();
  let last = start;
  const frame = (now: number) => {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    const t = (now - start) / 1000;
    ctx.clearRect(0, 0, W, H);
    const fade = t > LIFE - 0.6 ? Math.max(0, (LIFE - t) / 0.6) : 1;
    let alive = 0;
    for (const p of pieces) {
      // Air drag slows the burst quickly; then gravity and a flutter take over.
      p.vx *= Math.pow(0.12, dt);
      p.vy = p.vy * Math.pow(0.12, dt) + 900 * dt;
      p.vy = Math.min(p.vy, 260);
      p.x += (p.vx + Math.sin(t * 5 + p.phase) * 40) * dt;
      p.y += p.vy * dt;
      p.spin += p.vspin * dt;
      p.tilt += p.vtilt * dt;
      if (p.y > H + 30) continue;
      alive++;
      const sx = Math.cos(p.tilt);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin);
      ctx.scale(sx, 1);
      if (p.foil) {
        // Foil catches the light as it turns.
        const shine = 0.55 + 0.45 * Math.abs(sx);
        ctx.fillStyle = p.colour;
        ctx.globalAlpha = fade * shine;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      } else {
        // A scrap of cloth, pinked along its top and bottom.
        const tooth = 3;
        ctx.fillStyle = p.colour;
        ctx.beginPath();
        ctx.moveTo(-p.w / 2, -p.h / 2 + 1.5);
        for (let x = -p.w / 2; x < p.w / 2; x += tooth) {
          ctx.lineTo(x + tooth / 2, -p.h / 2);
          ctx.lineTo(Math.min(p.w / 2, x + tooth), -p.h / 2 + 1.5);
        }
        ctx.lineTo(p.w / 2, p.h / 2 - 1.5);
        for (let x = p.w / 2; x > -p.w / 2; x -= tooth) {
          ctx.lineTo(x - tooth / 2, p.h / 2);
          ctx.lineTo(Math.max(-p.w / 2, x - tooth), p.h / 2 - 1.5);
        }
        ctx.closePath();
        ctx.fill();
        // The side turned from the light is darker.
        if (sx < 0) {
          ctx.fillStyle = 'rgba(0,0,0,.18)';
          ctx.fill();
        }
      }
      ctx.restore();
    }
    if (alive && t < LIFE) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
