'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Client-side error surface; M11 forwards this to Sentry.
    console.error('[app error]', error);
  }, [error]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#FAF8F5', color: '#1C1917' }}>
      <div style={{ textAlign: 'center', maxWidth: 440 }}>
        <div style={{ fontSize: 11, letterSpacing: '.5em', color: '#8A6D45', marginBottom: 14 }}>PODDAR CREATION</div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display), serif', fontWeight: 500, fontSize: 'clamp(30px,5vw,46px)', lineHeight: 1.05 }}>
          Something came undone
        </h1>
        <span style={{ display: 'block', width: 72, height: 7, margin: '18px auto 0', backgroundImage: 'repeating-linear-gradient(90deg,#8A6D45 0 9px,transparent 9px 16px),repeating-linear-gradient(90deg,rgba(28,25,23,.65) 0 9px,transparent 9px 16px)', backgroundSize: '16px 2px,16px 2px', backgroundPosition: '0 0,8px 4px', backgroundRepeat: 'repeat-x' }} />
        <p style={{ margin: '20px auto 0', fontSize: 15, fontWeight: 300, lineHeight: 1.7, color: 'rgba(28,25,23,.6)' }}>
          An unexpected error interrupted the studio. Your work is safe — please try again.
        </p>
        <div style={{ marginTop: 28 }}>
          <button
            onClick={reset}
            style={{ cursor: 'pointer', background: '#1C1917', color: '#FAF8F5', border: '1px solid #1C1917', borderRadius: 999, padding: '15px 40px', fontFamily: 'var(--font-body), sans-serif', fontSize: 13, letterSpacing: '.18em', textTransform: 'uppercase' }}
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
