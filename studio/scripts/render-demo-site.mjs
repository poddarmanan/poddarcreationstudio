import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Renders the public studio into a folder of plain files, for hosting anywhere that serves
 * static files — GitHub Pages in the first instance. Published at the owner's request.
 *
 *   NEXT_PUBLIC_BASE_PATH=/poddarcreationstudio npm run build && npm start
 *   node scripts/render-demo-site.mjs http://localhost:3000 /poddarcreationstudio demo-site
 *
 * Why this works at all: the studio is one server-rendered page. `app/page.tsx` loads the whole
 * catalogue and hands it to `<StudioApp>`, so the HTML that `next start` serves already carries
 * every fabric and shade inline, and everything after that — the showroom, the colour wall, the
 * comparison, the 3D fabric lab — runs in the browser from `_next/static`. Nothing the visitor
 * *sees* needs the server again.
 *
 * What does not come along: sign-in, the portal, quotations and search all call `/api/...`, and
 * a static host answers 404. This is a preview of the showroom, not of the platform, and the
 * `404.html` written below says so to anyone who follows a link into the parts that are absent.
 */
const [base = 'http://localhost:3000', prefix = '', out = 'demo-site'] = process.argv.slice(2);

const res = await fetch(`${base}${prefix}/`);
if (!res.ok) throw new Error(`GET ${prefix}/ → ${res.status}`);
const html = await res.text();
if (!html.includes(`${prefix}/_next/static/`)) {
  throw new Error(`The served HTML does not reference ${prefix}/_next/static — was the server built with NEXT_PUBLIC_BASE_PATH=${prefix}?`);
}

await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, '_next'), { recursive: true });
await writeFile(path.join(out, 'index.html'), html);
await cp('.next/static', path.join(out, '_next/static'), { recursive: true });
await cp('src/app/favicon.ico', path.join(out, 'favicon.ico')).catch(() => {});
// Garment models and the Draco decoder they may need, when the owner has supplied models.
await cp('public/draco', path.join(out, 'draco'), { recursive: true }).catch(() => {});
await cp('public/models', path.join(out, 'models'), { recursive: true }).catch(() => {});

// GitHub Pages runs Jekyll by default, and Jekyll silently drops every directory whose name
// starts with an underscore — which is to say, `_next`. This empty file switches it off.
await writeFile(path.join(out, '.nojekyll'), '');

await writeFile(
  path.join(out, '404.html'),
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Poddar Studio — preview</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f3ee;color:#2b2622;font:16px/1.55 Georgia,serif;padding:24px;box-sizing:border-box}
  main{max-width:440px;text-align:center}
  h1{font-weight:400;font-size:28px;margin:0 0 12px;letter-spacing:.02em}
  p{margin:0 0 20px;color:#5c534b}
  a{display:inline-block;padding:12px 22px;border-radius:999px;background:#2b2622;color:#f6f3ee;text-decoration:none;letter-spacing:.08em;font-size:13px;text-transform:uppercase}
</style></head>
<body><main>
<h1>Preview build</h1>
<p>This is a preview of the showroom. Sign-in, the customer portal, quotations and search are not part of it — they need the live server, which this preview does not have.</p>
<a href="${prefix}/">Back to the showroom</a>
</main></body></html>
`
);

console.log(`Rendered ${out}/ — index.html ${html.length.toLocaleString()} bytes, assets from .next/static, prefix "${prefix}"`);
