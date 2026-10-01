"""Step 3: a name for every shade. See README.md."""
import json, re, math, numpy as np
from collections import Counter
from scipy.optimize import linear_sum_assignment
src = open('../../src/lib/fabric-generator.ts').read()
names = [(m[0], float(m[1]), float(m[2]), float(m[3])) for m in re.findall(r"\{ name: '([^']+)', l: ([\d.]+), c: ([\d.]+), h: ([\d.]+) \}", src)]
# Shades the cards have that the studio's palette had no name for.
names += [('Shahi Neela', 0.31, 0.17, 265), ('Syahi', 0.25, 0.15, 266), ('Gulnaar', 0.56, 0.14, 2), ('Lal Gulab', 0.47, 0.135, 3),
          ('Gulkand', 0.53, 0.08, 355), ('Kokum', 0.32, 0.12, 342), ('Dhoop Chhaon', 0.5, 0.075, 326), ('Gehra Hara', 0.26, 0.055, 155),
          ('Shahtoot', 0.30, 0.10, 345), ('Samundari', 0.40, 0.067, 203)]
assert len({n[0] for n in names}) == len(names)
lab = lambda l, c, h: np.array([l, c*math.cos(math.radians(h)), c*math.sin(math.radians(h))])
dist = lambda s, n: float(np.linalg.norm((lab(s['l'], s['c'], s['h']) - lab(n[1], n[2], n[3])) * [1, 1.6, 1.6]))
S = json.load(open('samples.json'))
CARD = {'PC_Cotton_41__8.8Kg': 'pcpc', 'Cambric_Cotton_43__9Kg': 'cambric', 'Jam_Cotton_43__11Kg': 'jaam11', 'Rayon_Slub_43__14Kg': 'slub',
        'Gajji_Silk_22Kg_58_': 'gajji', 'Cotton_Satin_Lycra_58__21Kg': 'lycra', 'Roman_Silk_56_': 'roman', 'Rayon_43_': 'rayon14', 'Rayon_Dyed_43__.': 'rayondyed'}
roman = lambda k: '' if k == 1 else ' ' + ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][k - 2]
out = {}; poor = 0
for card, fid in CARD.items():
    rows = S[card]
    cost = np.array([[dist(r, n) for n in names] for r in rows])
    ri, ci = linear_sum_assignment(cost)
    shades = []
    for i, j in zip(ri, ci):
        r = rows[i]; near = int(np.argmin(cost[i]))
        # A unique name, unless that forces one clearly worse than the nearest: then the nearest, numbered.
        k = near if cost[i, j] > cost[i, near] + 0.04 else j
        poor += cost[i, k] > 0.09
        shades.append(dict(code=str(r['code']), base=names[k][0], l=r['l'], c=r['c'], h=r['h'], rgb=r['rgb']))
    seen = Counter()
    for s in shades:
        seen[s['base']] += 1; s['name'] = s['base'] + roman(seen[s['base']])
    out[fid] = shades
print('names still far from their shade:', poor)
json.dump(out, open('cards.json', 'w'))
for fid in ('cambric', 'pcpc'): print(fid, [(s['code'], s['name']) for s in out[fid]][:30])
