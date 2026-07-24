'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AuthCard, authButtonStyle, authNoteStyle } from '@/components/auth/AuthCard';

function VerifyEmail() {
  // The token is known at render time, so the missing-token case needs no effect at all.
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<'verifying' | 'done' | 'error'>(token ? 'verifying' : 'error');
  const [message, setMessage] = useState(token ? 'Confirming your email…' : 'This confirmation link is missing its token.');

  useEffect(() => {
    if (!token) return;
    fetch('/api/verify-email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        if (res.ok) {
          setState('done');
          setMessage('Your email is confirmed. Your account is ready.');
        } else {
          setState('error');
          setMessage(data?.error ?? 'This confirmation link is invalid or has expired.');
        }
      })
      .catch(() => {
        setState('error');
        setMessage('Something went wrong. Please try again.');
      });
  }, [token]);

  return (
    <AuthCard eyebrow="Account" heading={state === 'done' ? 'Email confirmed' : state === 'error' ? 'Link problem' : 'Confirming…'}>
      <p style={authNoteStyle}>{message}</p>
      {state !== 'verifying' && (
        <Link href="/" style={{ ...authButtonStyle, display: 'block', textAlign: 'center', textDecoration: 'none' }}>
          Enter the studio
        </Link>
      )}
    </AuthCard>
  );
}

export function VerifyEmailScreen() {
  return (
    <Suspense fallback={<AuthCard eyebrow="Account" heading="Confirming…"><p style={authNoteStyle}>Confirming your email…</p></AuthCard>}>
      <VerifyEmail />
    </Suspense>
  );
}
