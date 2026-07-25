# M27 — Digital Microscope

At 500× a buyer is not looking at a fabric any more, they are looking at **yarn**: whether the
ply is even, whether the pick is tight, whether a slub is deliberate or a fault. That is a
quality-control judgement normally made by holding cloth up to a window.

## Why this is where procedural texture pays

A photograph has a fixed resolution and a weave does not. Magnifying a bitmap past its
resolution makes it smoother, not more informative — you get bigger pixels and less to see.

Generated maps have no such ceiling. The microscope regenerates the weave at the resolution the
magnification needs (up to 2048px, clamped to what the GPU accepts) and shows *fewer* tiles:
seven across the frame at 100×, barely one at 500×. So going closer really does resolve more
thread.

That is the entire argument for deriving texture from the spec sheet rather than shipping
photographs, and it is the one place in the app where the difference is unarguable.

**Resolution comes from the magnification, not the tier.** A tier that would render a whole
garment at 256px still needs real detail when there is one surface filling the frame — the
microscope is the only thing on screen, so it can afford it.

**The light rakes.** At this distance the relief *is* the subject, and a light almost parallel to
the cloth is how a mill inspector reads a weave. It drifts slowly so the specular travels over
the yarn rather than sitting still on it.

## Verifying

```bash
node scripts/smoke-m27.mjs      # included in npm run smoke -- --http
```

The measurement is mean absolute difference between neighbouring pixels — how much *structure* a
picture has. A weave with resolved threads scores high; the same weave blurred by magnification
scores low. That is what separates "more detail" from "bigger pixels", and it is the only way to
test this claim rather than assert it.

- 500× is not markedly smoother than 100× — magnification resolves threads rather than enlarging
  pixels
- the magnification control genuinely changes the view
- neither magnification is a flat field; a microscope showing nothing is worse than none

It inspects a **slub**, deliberately: irregular yarn is exactly what a microscope is for, and a
plain cambric would hide a regression in the irregularity model.
