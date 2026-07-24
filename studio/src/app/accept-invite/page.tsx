'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthCard, authInputStyle, authButtonStyle, authNoteStyle } from '@/components/auth/AuthCard';

export default function AcceptInvitePage() {
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'form' | 'done'>('form');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') ?? '');
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/invite/accept', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, name, password }) });
    setBusy(false);
    if (res.ok) setState('done');
    else {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? 'This invitation is invalid or has expired.');
    }
  }

  return (
    <AuthCard eyebrow="Invitation" heading={state === 'done' ? 'Welcome to the workspace' : 'Accept your invitation'}>
      {state === 'done' ? (
        <>
          <p style={authNoteStyle}>Your account is ready. You can now sign in.</p>
          <Link href="/" style={{ ...authButtonStyle, display: 'block', textAlign: 'center', textDecoration: 'none' }}>Go to sign in</Link>
        </>
      ) : (
        <form onSubmit={submit}>
          <p style={{ ...authNoteStyle, marginBottom: 16 }}>Set your name and a password to join the Poddar Creation workspace.</p>
          <input type="text" required placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} style={authInputStyle} />
          <input type="password" required minLength={8} placeholder="Password (min 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} style={authInputStyle} />
          {error && <div style={{ color: '#A33', fontSize: 13, marginBottom: 8 }}>{error}</div>}
          <button type="submit" disabled={busy || !token} style={{ ...authButtonStyle, opacity: busy || !token ? 0.6 : 1 }}>{busy ? 'Creating…' : 'Accept & create account'}</button>
        </form>
      )}
    </AuthCard>
  );
}
