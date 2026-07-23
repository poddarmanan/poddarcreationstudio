import { getFabricsWithColours } from '@/lib/data';
import { StudioApp } from '@/components/studio/StudioApp';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const fabrics = await getFabricsWithColours();
  return <StudioApp fabrics={fabrics} />;
}
