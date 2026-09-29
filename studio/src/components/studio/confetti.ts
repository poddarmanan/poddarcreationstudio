/**
 * A burst of confetti from a point on the page — the buyer's shades cut as tiny pinked scraps,
 * with gold-foil strips and cream paper among them.
 *
 * Two bursts fan out from the source, a beat apart, and then a slow rain falls across the whole
 * screen, so the celebration fills the room and lingers for some seven seconds. Drawn on one canvas
 * laid over everything, which removes itself when done, so nothing is left running. Pieces tumble
 * in 3D (their width follows the cosine of their spin), drift down like paper with a slow flutter,
 * and fade over the last second. Nothing is drawn when the reader prefers reduced motion.
 */
const FOIL = ['#E9CF8F', '#C9A55E', '#F6E7BE', '#B8904A'];
const HOUSE = ['#5E1B21', '#FBF6EA', '#8A6D45'];

type Piece = {
  x: number; y: number; vx: number; vy: number;
  w: number; h: number; spin: number; vspin: number; tilt: number; vtilt: number;
  colour: string; foil: boolean; phase: number; delay: number;
};

export function confettiBurst(from: DOMRect, shades: string[], count = 170) {
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
  const piece = (x: number, y: number, vx: number, vy: number, delay: number): Piece => {
    const colour = palette[Math.floor(Math.random() * palette.length)];
    const foil = FOIL.includes(colour);
    return {
      x, y, vx, vy, delay, colour, foil,
      w: foil ? 6 + Math.random() * 4 : 12 + Math.random() * 10,
      h: foil ? 18 + Math.random() * 12 : 14 + Math.random() * 10,
      spin: Math.random() * Math.PI * 2,
      vspin: (Math.random() - 0.5) * 10,
      tilt: Math.random() * Math.PI * 2,
      vtilt: 3 + Math.random() * 6,
      phase: Math.random() * Math.PI * 2,
    };
  };
  // Two bursts up and out in a fan from the source, the second a beat after the first, and then a
  // slow rain across the whole screen, so the celebration fills the room and lingers.
  const burst = (n: number, delay: number) =>
    Array.from({ length: n }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.95;
      const speed = 560 + Math.random() * 780;
      return piece(ox + (Math.random() - 0.5) * from.width * 0.6, oy + (Math.random() - 0.5) * from.height * 0.4, Math.cos(angle) * speed, Math.sin(angle) * speed, delay);
    });
  const rain = Array.from({ length: Math.round(count * 0.6) }, () => piece(Math.random() * W, -30 - Math.random() * H * 0.5, (Math.random() - 0.5) * 60, 40 + Math.random() * 60, 0.9 + Math.random() * 1.6));
  const pieces: Piece[] = [...burst(count, 0), ...burst(Math.round(count * 0.55), 0.45), ...rain];

  const LIFE = 7.5;
  const start = performance.now();
  let last = start;
  const frame = (now: number) => {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    const t = (now - start) / 1000;
    ctx.clearRect(0, 0, W, H);
    const fade = t > LIFE - 1.2 ? Math.max(0, (LIFE - t) / 1.2) : 1;
    let alive = 0;
    for (const p of pieces) {
      if (t < p.delay) {
        alive++;
        continue;
      }
      // Air drag slows the burst quickly; then gravity and a slow flutter take over, and the pieces
      // drift down like paper rather than fall.
      p.vx *= Math.pow(0.15, dt);
      p.vy = p.vy * Math.pow(0.15, dt) + 620 * dt;
      p.vy = Math.min(p.vy, 150);
      p.x += (p.vx + Math.sin(t * 2.6 + p.phase) * 55) * dt;
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
        const tooth = 4;
        ctx.fillStyle = p.colour;
        ctx.beginPath();
        ctx.moveTo(-p.w / 2, -p.h / 2 + 2);
        for (let x = -p.w / 2; x < p.w / 2; x += tooth) {
          ctx.lineTo(x + tooth / 2, -p.h / 2);
          ctx.lineTo(Math.min(p.w / 2, x + tooth), -p.h / 2 + 2);
        }
        ctx.lineTo(p.w / 2, p.h / 2 - 2);
        for (let x = p.w / 2; x > -p.w / 2; x -= tooth) {
          ctx.lineTo(x - tooth / 2, p.h / 2);
          ctx.lineTo(Math.max(-p.w / 2, x - tooth), p.h / 2 - 2);
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
