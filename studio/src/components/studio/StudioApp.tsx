'use client';

import type { FabricRow } from '@/lib/types';
import { useStudio } from './state';
import { Nav } from './Nav';
import { Entrance } from './Entrance';
import { Showroom } from './Showroom';
import { Collection } from './Collection';
import { FabricLab } from './FabricLab';
import { ColourWall } from './ColourWall';
import { Compare } from './Compare';
import { SwatchBook } from './SwatchBook';
import { Admin } from './Admin';
import { UnrollTransition, ScopeModal, SceneModal, QuoteModal, AiModal, SignInModal } from './Modals';

export function StudioApp({ fabrics }: { fabrics: FabricRow[] }) {
  const studio = useStudio(fabrics);

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav studio={studio} />
      {studio.view === 'home' && <Entrance studio={studio} />}
      {studio.view === 'showroom' && <Showroom studio={studio} />}
      {studio.view === 'collection' && <Collection studio={studio} />}
      {studio.view === 'fabric' && <FabricLab studio={studio} />}
      {studio.view === 'colours' && <ColourWall studio={studio} />}
      {studio.view === 'compare' && <Compare studio={studio} />}
      {studio.view === 'book' && <SwatchBook studio={studio} />}
      {studio.view === 'admin' && <Admin studio={studio} />}
      <UnrollTransition studio={studio} />
      <ScopeModal studio={studio} />
      <SceneModal studio={studio} />
      <QuoteModal studio={studio} />
      <AiModal studio={studio} />
      <SignInModal studio={studio} />
    </div>
  );
}
