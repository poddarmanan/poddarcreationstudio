import { LoadingShell } from '@/components/brand/LoadingShell';

/** Streams before the page's staff check resolves, so it names nothing a customer shouldn't see. */
export default function Loading() {
  return <LoadingShell label="SALES" />;
}
