"""Step 2: every swatch's colour, sampled and white-balanced. See README.md."""
import json, numpy as np
from PIL import Image, ImageDraw
from layout import L
def srgb_to_lin(c): c = c / 255.0; return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def lin_to_oklch(rgb):
    r, g, b = rgb
    l = 0.4122214708*r + 0.5363325363*g + 0.0514459929*b
    m = 0.2119034982*r + 0.6806995451*g + 0.1073969566*b
    s = 0.0883024619*r + 0.2817188376*g + 0.6299787005*b
    l, m, s = np.cbrt(l), np.cbrt(m), np.cbrt(s)
    L_ = 0.2104542553*l + 0.7936177850*m - 0.0040720468*s
    a = 1.9779984951*l - 2.4285922050*m + 0.4505937099*s
    bb = 0.0259040371*l + 0.7827717662*m - 0.8086757660*s
    C = (a*a + bb*bb) ** 0.5; H = (np.degrees(np.arctan2(bb, a)) + 360) % 360
    return float(L_), float(C), float(H)
out = {}
for card, pages in L.items():
    rows = []
    for page, spec in pages.items():
        im = np.asarray(Image.open(f'cards/{card}-p{page}.png').convert('RGB')).astype(float)
        H, W, _ = im.shape; k = W / 900
        def patch(x, y, rx=26, ry=18):
            X, Y = int(x*k), int(y*k); a = im[max(0,Y-int(ry*k)):Y+int(ry*k), max(0,X-int(rx*k)):X+int(rx*k)].reshape(-1,3)
            return np.median(a, axis=0), a.std(axis=0).mean()
        paper, _ = patch(*spec['paper'], 20, 20)
        # White balance on the card's paper: its colour cast is taken out, and it is brought to 97%.
        gain = (0.97 * 255) / paper
        def lit(x, y, rx=40, ry=30):
            # Folded cloth: the lit face, not the folds' shadows nor a glint. The pixels between
            # the 55th and 85th percentile of brightness in a wider box.
            X, Y = int(x*k), int(y*k); a = im[max(0,Y-int(ry*k)):Y+int(ry*k), max(0,X-int(rx*k)):X+int(rx*k)].reshape(-1,3)
            lum = a.mean(axis=1); lo, hi = np.percentile(lum, 55), np.percentile(lum, 85)
            sel = a[(lum >= lo) & (lum <= hi)]
            return sel.mean(axis=0), a.std(axis=0).mean()
        folded = card.startswith('Roman')
        for code, x, y in spec['pts']:
            med, sd = (lit if folded else patch)(x, y)
            rgb = np.clip(med * gain, 0, 255)
            Lk, Ck, Hk = lin_to_oklch(srgb_to_lin(rgb))
            rows.append(dict(code=code, page=page, raw=[round(v) for v in med], rgb=[round(v) for v in rgb], l=round(Lk,3), c=round(Ck,3), h=round(Hk,1), sd=round(float(sd),1)))
    out[card] = sorted(rows, key=lambda r: r['code'])
json.dump(out, open('samples.json','w'), indent=0)
for card, rows in out.items():
    codes = [r['code'] for r in rows]
    print(card, len(rows), 'codes', codes[0], '..', codes[-1], 'dupes' if len(set(codes)) != len(codes) else '', 'noisy:', [(r['code'], r['sd']) for r in rows if r['sd'] > 14])
