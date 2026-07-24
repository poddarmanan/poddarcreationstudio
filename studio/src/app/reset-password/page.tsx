'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AuthCard, authInputStyle, authButtonStyle, authNoteStyle } from '@/components/auth/AuthCard';

function ResetPasswordForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'form' | 'done'>('form');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/password/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password }) });
    setBusy(false);
    if (res.ok) setState('done');
    else {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? 'Could not reset your password.');
    }
  }

  return (
    <AuthCard eyebrow="Security" heading={state === 'done' ? 'Password updated' : 'Choose a new password'}>
      {state === 'done' ? (
        <>
          <p style={authNoteStyle}>Your password has been updated. You can now sign in with your new password.</p>
          <Link href="/" style={{ ...authButtonStyle, display: 'block', textAlign: 'center', textDecoration: 'none' }}>Enter the studio</Link>
        </>
      ) : (
        <form onSubmit={submit}>
          <p style={{ ...authNoteStyle, marginBottom: 16 }}>Enter a new password of at least 8 characters.</p>
          <input type="password" required minLength={8} placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} style={authInputStyle} />
          {error && <div style={{ color: '#A33', fontSize: 13, marginBottom: 8 }}>{error}</div>}
          <button type="submit" disabled={busy || !token} style={{ ...authButtonStyle, opacity: busy || !token ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Update password'}</button>
        </form>
      )}
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthCard eyebrow="Security" heading="Choose a new password"><p style={authNoteStyle}>Loading…</p></AuthCard>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
