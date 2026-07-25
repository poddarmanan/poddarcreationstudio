# M22 — Fabric material framework

Physically based rendering for cloth, structured so the renderer stays flexible as the catalogue
grows.

## Two layers

**A preset per fabric family** (`FABRIC_PRESETS` in `src/lib/three/fabric-spec.ts`) carries the
qualitative character of a *kind* of cloth: satin floats and the directional highlight they
stretch, a crinkle finish's deep relief, the tight near-white sheen of filament silk against the
broad warm one of staple cotton. Configurable in one place. A merchant adding a twelfth quality
inherits its family's preset for free.

**The merchant's own spec sheet** modulates it — weight, sheen, shade grading, seed. This is why
an 8.8kg PC/PC and a 20kg gajji differ on screen: because they differ on the row.

There is deliberately **no per-fabric override table**. The moment one exists, adding a quality
means an artist has to tune it before it can be sold, and the render stops being a picture of the
catalogue.

## One material abstraction

Every rendering component describes *what* cloth it is showing and never *how* to shade it:

```tsx
<FabricMaterial spec={fabricMaterialSpec(fabric, colour)} tier={tier} repeat={n} />
```

`src/components/three/FabricMaterial.tsx` is the only file in the app that names a shading
material. `scripts/check-material-abstraction.mjs` enforces that — a rule like this survives
exactly as long as something checks it, and it runs first in `npm run smoke`.

If the look is wrong, the fix is a preset, and it lands on every surface at once.

## Why sheen carries the lustre

Cloth is the awkward case for metallic-roughness. That model describes a metal, a plastic and a
painted wall, and all three better than it describes a shirt — because most of what the eye reads
as "fabric" is light grazing off fibre *ends* at the silhouette, and the model has no term for it.

So roughness stays high for every quality in the catalogue, bottoming out around 0.45, and the
lustre lives in the sheen layer. Even gajji silk keeps a rough base and gets its shine from a
bright, tight sheen with an anisotropic stretch along the warp floats. Turn the sheen off and
every fabric reads as painted plastic — the tell in most fabric renderings on the web.

Occlusion and roughness ship packed into one texture (red and green), both derived from the same
height field that shades the albedo, so lighting and colour cannot disagree.

The `low` tier renders `meshStandardMaterial` instead: still lit, still textured, without the
layer a device reporting software rendering cannot afford.

## Two bugs this milestone's smoke caught

Both were silent, and both would have shipped.

**The catalogue speaks OKLCH; a texture is sRGB bytes.** The weave generator's parser rejected
`oklch(63.5% 0.05 320)` and fell back to its default beige — so all 824 shades would have
rendered as *the same colour*, looking like a lighting problem rather than a parsing one.
`src/lib/three/colour.ts` does the conversion properly (OKLab matrices, real sRGB transfer
function).

**Lightness is 0–1 in the data, not 0–100.** The CSS helper is what multiplies by 100; the rows
do not. Passing a percentage sent every shade to near-black. The smoke now asserts a fabric's
shades stay distinct *and* that they are not mostly black, because a units mistake looks exactly
like a dark scene.

## Verifying

```bash
npm run check:materials    # only FabricMaterial shades cloth
npx tsx scripts/smoke-m22.ts
```

`scripts/smoke-m22.ts` is pure, runs in under a second, and covers **every quality in the
catalogue** rather than the one a screenshot happens to show:

- every fabric yields a physically sane material (roughness never below 0.45, sheen always
  present, transmission bounded, a real thread count, a real hex colour, a believable tile size)
- every family has a preset — a missing one would silently render as cotton
- silk is smoother, tighter-sheened and more anisotropic than cotton, and weaves as satin
- a 20kg gajji is denser than an 8.8kg PC/PC and passes no light, while the PC/PC passes a little
- editing a fabric's sheen in the catalogue moves the render
- the same fabric and shade produce byte-identical materials; two shades never share a seed
- thread scale is physical, and two metres of cloth shows more weave than one
- every shade of every quality is its own colour, and not near-black
