import { LoadingShell } from '@/components/brand/LoadingShell';

/** Streams before the admin check resolves, so it names nothing a customer shouldn't see. */
export default function Loading() {
  return <LoadingShell label="STUDIO" />;
}
