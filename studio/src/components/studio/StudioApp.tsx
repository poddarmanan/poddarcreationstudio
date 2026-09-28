'use client';

import type { FabricRow } from '@/lib/types';
import { useStudio } from './state';
import { Nav } from './Nav';
import { BottomNav } from './BottomNav';
import { Entrance } from './Entrance';
import { Showroom } from './Showroom';
import { FabricLab } from './FabricLab';
import { ColourWall } from './ColourWall';
import { SwatchBook } from './SwatchBook';
import { Admin } from './Admin';
import { UnrollTransition, ScopeModal, SceneModal, QuoteModal, AiModal, SignInModal } from './Modals';
import { ViewCurtain } from './ViewCurtain';

export function StudioApp({ fabrics }: { fabrics: FabricRow[] }) {
  const studio = useStudio(fabrics);

  return (
    <div className="pc-shell" style={{ minHeight: '100vh' }}>
      <Nav studio={studio} />
      {studio.view === 'home' && <Entrance studio={studio} />}
      {studio.view === 'showroom' && <Showroom studio={studio} />}
      {/* Keyed by fabric, so a fabric opened from inside the lab (its number strip, "more
          fabrics") mounts it afresh and plays the whole Fabric Hall arrival — the page laying in,
          the stage's loader — exactly as one opened from the Showroom. The 3D teardown this
          causes used to throw; LightingRig guards it now. */}
      {studio.view === 'fabric' && <FabricLab key={studio.currentFabric.id} studio={studio} />}
      {studio.view === 'colours' && <ColourWall studio={studio} />}
      {studio.view === 'book' && <SwatchBook studio={studio} />}
      {studio.view === 'admin' && <Admin studio={studio} />}
      <BottomNav studio={studio} />
      <ViewCurtain studio={studio} />
      <UnrollTransition studio={studio} />
      <ScopeModal studio={studio} />
      <SceneModal studio={studio} />
      <QuoteModal studio={studio} />
      <AiModal studio={studio} />
      <SignInModal studio={studio} />
    </div>
  );
}
