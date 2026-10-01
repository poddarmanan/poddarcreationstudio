"""Step 1: the scanned page images out of the shade-card PDFs.

    python3 pages.py <folder of PDFs>     ->  cards/<Card>-p<page>.png

Needs PyMuPDF (pip install pymupdf). Each PDF is a phone photo per page, with no text.
"""
import glob, os, re, sys
import pymupdf

src = sys.argv[1] if len(sys.argv) > 1 else '.'
os.makedirs('cards', exist_ok=True)
for f in sorted(glob.glob(os.path.join(src, '*.pdf'))):
    d = pymupdf.open(f)
    name = re.sub(r'^[0-9a-f]+-', '', os.path.basename(f))[:-4].replace(' ', '_')
    for i, page in enumerate(d):
        pix = pymupdf.Pixmap(d, page.get_images()[0][0])
        if pix.n - pix.alpha >= 4:
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        pix.save(f'cards/{name}-p{i + 1}.png')
        print(name, i + 1, pix.width, pix.height)
