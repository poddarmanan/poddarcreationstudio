# M30 — Export Experience

A buyer's next step after deciding is nearly always to show someone else — a partner, a tailor, a
WhatsApp group. Until now the only thing they could send was a screenshot of a browser window,
arriving with the studio's chrome around it at whatever size their screen happened to be.

**↓ This view** in the Lab's downloads row hands them the frame itself: the cloth as it was lit
and posed at that moment, named `pc-pc-kashish.png` after the fabric and the shade so it is still
identifiable a week later in a folder of forty images.

## Why a capture is a render, not a read

The canvas is created with `preserveDrawingBuffer: false` — keeping the buffer costs memory on
every frame for the sake of an operation that happens once in a session.

That means `toDataURL()` on a live canvas returns a **blank image**. The driver is entitled to
have thrown the pixels away the moment they were presented. It does not throw and it does not
warn: the download succeeds and the buyer opens an empty PNG.

So a capture is a render followed immediately by a read, in the same synchronous turn, before the
browser can present and clear. That is why `capture.ts` is a registry of callbacks living inside
the canvas rather than a function anyone can call on the element — the correct sequence is not
something a caller can be trusted to reproduce.

## It degrades honestly

When the stage is not rendering — no WebGL, a lost context, the flat fallback showing — there is
nothing to export, and the control says **View not available** rather than handing over a blank
file.

## Verifying

```bash
node scripts/smoke-m30.mjs      # included in npm run smoke -- --http
```

The smoke downloads the file and **decodes it**, because nothing else can catch the failure this
milestone is about:

- the download happens and is a `.png`
- the filename names the fabric and the shade
- the file is a readable PNG, large enough to show someone
- **the image contains more than 50 distinct colours** — an empty framebuffer exports as a
  uniform image, and every other check in the repository would pass while it did
