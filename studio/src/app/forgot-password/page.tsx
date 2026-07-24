'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AuthCard, authInputStyle, authButtonStyle, authNoteStyle } from '@/components/auth/AuthCard';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await fetch('/api/password/forgot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) }).catch(() => {});
    setBusy(false);
    setSent(true);
  }

  return (
    <AuthCard eyebrow="Security" heading={sent ? 'Check your inbox' : 'Reset your password'}>
      {sent ? (
        <>
          <p style={authNoteStyle}>If an account exists for {email}, a password reset link is on its way. The link expires in one hour.</p>
          <Link href="/" style={{ ...authButtonStyle, display: 'block', textAlign: 'center', textDecoration: 'none' }}>Back to the studio</Link>
        </>
      ) : (
        <form onSubmit={submit}>
          <p style={{ ...authNoteStyle, marginBottom: 16 }}>Enter your account email and we’ll send a link to set a new password.</p>
          <input type="email" required placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} style={authInputStyle} />
          <button type="submit" disabled={busy} style={{ ...authButtonStyle, opacity: busy ? 0.6 : 1 }}>{busy ? 'Sending…' : 'Send reset link'}</button>
        </form>
      )}
    </AuthCard>
  );
}
