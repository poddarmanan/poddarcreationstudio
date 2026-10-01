"""Step 4: cards.json -> src/lib/shade-cards.ts."""
import json
C = json.load(open('cards.json'))
SRC = {'pcpc': 'PC Cotton 41″ · 8.8 kg', 'cambric': 'Cambric Cotton 43″ · 9 kg', 'jaam11': 'Jam Cotton 43″ · 11 kg', 'slub': 'Rayon Slub 43″ · 14 kg',
       'gajji': 'Gajji Silk 58″ · 22 kg', 'lycra': 'Cotton Satin Lycra 58″ · 21 kg', 'roman': 'Roman Silk 56″', 'rayon14': 'Rayon 43″', 'rayondyed': 'Rayon Dyed 43″'}
head = open('../../src/lib/shade-cards.ts').read().split('export const SHADE_CARDS')[0]
lines = [head.rstrip('\n'), '', 'export const SHADE_CARDS: Record<string, CardShade[]> = {']
for fid, shades in C.items():
    lines += [f'  // {SRC[fid]} — {len(shades)} shades', f'  {fid}: [']
    row = [f"['{s['code']}', '{s['name']}', {s['l']:.3f}, {s['c']:.3f}, {s['h']:.1f}]" for s in shades]
    lines += ['    ' + ', '.join(row[i:i + 3]) + ',' for i in range(0, len(row), 3)]
    lines.append('  ],')
lines.append('};')
open('../../src/lib/shade-cards.ts', 'w').write('\n'.join(lines) + '\n')
