# Shade cards → the studio's shades

How `src/lib/shade-cards.ts` was made from the mill's photographed shade cards (one PDF a
quality). Run in this folder, in order:

1. `python3 pages.py <folder of PDFs>`: the page photos out of the PDFs, into `cards/`.
2. `python3 sample.py`: every swatch's colour, from the points in `layout.py` (one per swatch,
   in a page scaled to 900 px wide, under its card number). Each is the median of a small patch
   of cloth, clear of the handwritten number and the pins. Roman Silk's swatches are folded, so
   its patch reads the lit face instead (the 55th–85th brightness percentile of a wider box).
   The page is white-balanced on a point of bare paper (`paper`): its cast is taken out, and the
   paper brought to 97%. Writes `samples.json`.
3. `python3 names.py`: a name for each shade, the nearest of the studio's Indian colour names
   (plus a few the cards needed), unique within a quality by optimal matching, except where that
   forces a name clearly worse than the nearest: then the nearest, with a numeral. Writes
   `cards.json`.
4. `python3 write_ts.py`: writes `src/lib/shade-cards.ts`.

Then `npx prisma db seed` puts them in the database.

Needs PyMuPDF, Pillow, NumPy and SciPy. The points in `layout.py` are for these photographs; a
new card needs its own. A phone photo is an approximation of the cloth; correct a single shade
by hand in `shade-cards.ts` rather than re-running everything.
