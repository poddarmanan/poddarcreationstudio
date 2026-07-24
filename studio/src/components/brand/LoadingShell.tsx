/**
 * Streamed loading shell (Priority 12): shown instantly by the App Router while a
 * server-rendered surface (portal, staff desks) fetches. The thread loader is the
 * studio's signature waiting state.
 */
export function LoadingShell({ label }: { label: string }) {
  return (
    <div style={{ minHeight: '100vh', background: '#F5F2ED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'flex-end', height: 44, marginBottom: 18 }}>
          <span style={{ width: 4, height: 26, borderRadius: 2, background: '#1C1917', animation: 'threadUp 1s ease-in-out infinite' }} />
          <span style={{ width: 4, height: 26, borderRadius: 2, background: '#8A6D45', animation: 'threadUp 1s ease-in-out -.33s infinite' }} />
          <span style={{ width: 4, height: 26, borderRadius: 2, background: '#1C1917', animation: 'threadUp 1s ease-in-out -.66s infinite' }} />
        </div>
        <div style={{ fontSize: 12, letterSpacing: '.3em', color: 'rgba(28,25,23,.55)', textTransform: 'uppercase' }}>{label}</div>
      </div>
    </div>
  );
}
