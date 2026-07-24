'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthCard, authButtonStyle, authNoteStyle } from '@/components/auth/AuthCard';

export default function VerifyEmailPage() {
  const [state, setState] = useState<'verifying' | 'done' | 'error'>('verifying');
  const [message, setMessage] = useState('Confirming your email…');

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token') ?? '';
    if (!token) {
      setState('error');
      setMessage('This confirmation link is missing its token.');
      return;
    }
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
  }, []);

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
