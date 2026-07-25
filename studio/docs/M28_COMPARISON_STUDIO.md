# M28 — Comparison Studio

Every selected quality hanging **under one light, at one moment**.

That constraint is the whole point. A buyer choosing between two qualities is usually not
comparing the fabrics — they are comparing their impressions of two photographs taken under
different conditions, and the impression is usually wrong. Hanging them together under a single
key is what a merchant does with real bolts, and it is the only honest way to answer "which of
these drapes better".

## One canvas, not one per fabric

A browser caps simultaneous WebGL contexts — around sixteen in Chrome, and it silently kills the
oldest when you pass it. A grid of independent viewers therefore stops working at exactly the
point a buyer is comparing enough fabrics for it to matter.

It is also several times the cost: each context carries its own renderer, shadow maps and
compiled shader programs. One scene with N panels shares all of that, and the content-keyed
texture cache means two qualities in the same shade share their maps as well.

The smoke asserts the canvas count is exactly one, because "it looks right" is compatible with
having built the version that falls over at nine fabrics.

## Four panels

Beyond four the panels are too narrow to judge anything from. That is a real limit rather than a
technical one — a merchant lays out three or four bolts on a counter, not ten — so the stage
shows the first four and the cards below continue to list everything selected.

## Verifying

```bash
node scripts/smoke-m28.mjs      # included in npm run smoke -- --http
```

- exactly one canvas holds every fabric
- the stage is live rather than fallen back
- every panel is distinguishable from every other (min Δ130 on the run above) — two fabrics that
  render identically make the comparison *worse* than none, because it is a confident wrong
  answer
- removing a fabric removes its panel
