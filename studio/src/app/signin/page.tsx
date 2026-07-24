'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { AuthCard, authInputStyle, authButtonStyle, authNoteStyle } from '@/components/auth/AuthCard';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState('/portal');

  useEffect(() => {
    const n = new URLSearchParams(window.location.search).get('next');
    if (n && n.startsWith('/')) setNext(n);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await signIn('credentials', { email, password, redirect: false });
    setBusy(false);
    if (res?.error) setError('Incorrect email or password.');
    else window.location.href = next;
  }

  return (
    <AuthCard eyebrow="Dealer Portal" heading="Sign in">
      <form onSubmit={submit}>
        <p style={{ ...authNoteStyle, marginBottom: 16 }}>Sign in to your dealer account to manage favourites, collections, quotes and downloads.</p>
        <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={authInputStyle} />
        <input type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={authInputStyle} />
        {error && <div style={{ color: '#A33', fontSize: 13, marginBottom: 8 }}>{error}</div>}
        <button type="submit" disabled={busy} style={{ ...authButtonStyle, opacity: busy ? 0.6 : 1 }}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <div style={{ marginTop: 16, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
        <Link href="/forgot-password" style={{ color: '#8A6D45' }}>Forgot password?</Link>
        <Link href="/" style={{ color: 'rgba(28,25,23,.55)' }}>Back to the studio</Link>
      </div>
    </AuthCard>
  );
}
