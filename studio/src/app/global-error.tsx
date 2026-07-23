'use client';

import { useEffect } from 'react';

/** Last-resort boundary for errors thrown in the root layout itself. Must render <html>/<body>. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[global error]', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#FAF8F5', color: '#1C1917' }}>
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <div style={{ fontSize: 11, letterSpacing: '.5em', color: '#8A6D45', marginBottom: 14 }}>PODDAR CREATION</div>
            <h1 style={{ margin: 0, fontWeight: 500, fontSize: 34 }}>Something came undone</h1>
            <p style={{ margin: '16px auto 0', fontSize: 15, fontWeight: 300, color: 'rgba(28,25,23,.6)' }}>
              The studio hit an unexpected error. Please try again.
            </p>
            <button
              onClick={reset}
              style={{ cursor: 'pointer', marginTop: 24, background: '#1C1917', color: '#FAF8F5', border: 'none', borderRadius: 999, padding: '14px 36px', fontSize: 13, letterSpacing: '.16em', textTransform: 'uppercase' }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
