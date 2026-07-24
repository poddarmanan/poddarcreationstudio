import type { ReactNode } from 'react';

/** Minimal branded shell for the standalone auth flows (verify, reset, invite). */
export function AuthCard({ eyebrow, heading, children }: { eyebrow: string; heading: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#EFEAE2' }}>
      <div style={{ width: 'min(460px,94vw)', background: '#FAF8F5', border: '1px solid rgba(28,25,23,.08)', borderRadius: 6, padding: 'clamp(28px,5vw,44px)', boxShadow: '0 30px 80px rgba(28,25,23,.12)' }}>
        <div style={{ fontFamily: 'var(--font-display), Georgia, serif', fontSize: 20, fontWeight: 600, letterSpacing: '.14em', color: '#1C1917' }}>PODDAR</div>
        <div style={{ fontSize: 9, letterSpacing: '.42em', color: '#8A6D45', marginTop: 3 }}>CREATION · STUDIO</div>
        <div style={{ fontSize: 11, letterSpacing: '.32em', color: '#8A6D45', textTransform: 'uppercase', marginTop: 26 }}>{eyebrow}</div>
        <h1 style={{ margin: '8px 0 0', fontFamily: 'var(--font-display), Georgia, serif', fontWeight: 500, fontSize: 'clamp(26px,4vw,34px)', lineHeight: 1.15, color: '#1C1917' }}>{heading}</h1>
        <span style={{ display: 'block', width: 72, height: 7, margin: '14px 0 0', backgroundImage: 'repeating-linear-gradient(90deg,#8A6D45 0 9px,transparent 9px 16px),repeating-linear-gradient(90deg,rgba(28,25,23,.55) 0 9px,transparent 9px 16px)', backgroundSize: '16px 2px,16px 2px', backgroundPosition: '0 0,8px 4px', backgroundRepeat: 'repeat-x' }} />
        <div style={{ marginTop: 22 }}>{children}</div>
      </div>
    </div>
  );
}

export const authInputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid rgba(28,25,23,.15)',
  borderRadius: 6,
  padding: '12px 14px',
  fontFamily: 'var(--font-body), sans-serif',
  fontSize: 14,
  background: '#fff',
  outlineColor: '#8A6D45',
  marginBottom: 10,
};

export const authButtonStyle: React.CSSProperties = {
  width: '100%',
  cursor: 'pointer',
  background: '#1C1917',
  color: '#FAF8F5',
  border: 'none',
  borderRadius: 999,
  padding: 13,
  fontFamily: 'var(--font-body), sans-serif',
  fontSize: 12.5,
  letterSpacing: '.14em',
  textTransform: 'uppercase',
  marginTop: 6,
};

export const authNoteStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 300,
  lineHeight: 1.7,
  color: 'rgba(28,25,23,.65)',
};
