'use client';

import { useMemo, type ReactNode } from 'react';
import type { LightKey } from '@/lib/fabric-generator';
import type { ColourLike, FabricLike } from '@/lib/three/fabric-spec';
import { fabricMaterialSpec } from '@/lib/three/fabric-spec';
import { useCapability } from './useCapability';
import { Stage } from './Stage';
import { FabricPanel } from './FabricPanel';
import { LightingRig } from './LightingRig';

/**
 * The Comparison Studio (Phase 4 M28).
 *
 * Every fabric under **one light, at one moment**. That constraint is the entire point: a buyer
 * choosing between two qualities is not comparing the fabrics, they are comparing their
 * impressions of two photographs taken under different conditions, and the impression is
 * usually wrong. Hanging them together under a single key is what a merchant does with real
 * bolts, and it is the only honest way to answer "which of these drapes better".
 *
 * **One canvas, not one per fabric.** A browser caps simultaneous WebGL contexts — around
 * sixteen in Chrome, and it silently kills the oldest when you pass it — so a grid of
 * independent viewers stops working at exactly the point a buyer is comparing enough fabrics
 * for it to matter. It is also several times the cost: each context carries its own renderer,
 * its own shadow maps, its own shader programs. One scene with N panels shares all of it, and
 * the texture cache means two qualities in the same shade share their maps too.
 */

export interface ComparisonEntry {
  id: string;
  fabric: FabricLike & { flow: number; stretch: number };
  colour: ColourLike;
}

export interface ComparisonStageProps {
  entries: ComparisonEntry[];
  light: LightKey;
  fallback: ReactNode;
  label: string;
}

export function ComparisonStage({ entries, light, fallback, label }: ComparisonStageProps) {
  const capability = useCapability();

  const specs = useMemo(
    () => entries.map((e) => ({ ...e, spec: fabricMaterialSpec(e.fabric, e.colour) })),
    [entries]
  );

  // Panels are laid out about their shared centre so the group stays framed however many there
  // are. Beyond four the panels would be too narrow to judge anything from, which is a real
  // limit rather than a technical one — a merchant lays out three or four bolts, not ten.
  const shown = specs.slice(0, 4);
  const spacing = shown.length > 1 ? Math.min(1.05, 2.5 / shown.length) : 0;
  const offset = ((shown.length - 1) * spacing) / 2;
  const width = shown.length > 2 ? 0.62 : 0.85;

  return (
    <Stage label={label} animate fallback={fallback} style={{ position: 'absolute', inset: 0 }}>
      <LightingRig light={light} tier={capability.tier} />
      {shown.map((entry, i) => (
        <group key={entry.id} position={[i * spacing - offset, 0, 0]}>
          <FabricPanel
            spec={entry.spec}
            tier={capability.tier}
            flow={entry.fabric.flow}
            stretch={entry.fabric.stretch}
            width={width}
            height={1.25}
          />
        </group>
      ))}
    </Stage>
  );
}
