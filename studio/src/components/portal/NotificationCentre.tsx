'use client';

import { useState, type CSSProperties } from 'react';
import { card, label, chipBtn } from './AccountPanels';

/**
 * The notification centre panel (Phase 3 M19). Used by both the customer portal and the staff
 * hub — the same rows, the same tokens, because a notification is a notification.
 */

const INK = '#1C1917';
const GOLD = '#8A6D45';
const meta: CSSProperties = { fontSize: 11.5, color: 'rgba(28,25,23,.5)' };

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
  whenLabel: string;
}

export interface NotificationPreferences {
  prefEmail: boolean;
  notifyQuotes: boolean;
  notifySamples: boolean;
  notifyShares: boolean;
}

const jsonHeaders = { 'content-type': 'application/json' };

export function NotificationCentre({
  initial,
  initialUnread,
  preferences: initialPreferences,
  showPreferences = true,
}: {
  initial: NotificationRow[];
  initialUnread: number;
  preferences: NotificationPreferences;
  showPreferences?: boolean;
}) {
  const [rows, setRows] = useState(initial);
  const [unread, setUnread] = useState(initialUnread);
  const [prefs, setPrefs] = useState(initialPreferences);
  const [prefsOpen, setPrefsOpen] = useState(false);

  async function markAllRead() {
    setRows((list) => list.map((r) => ({ ...r, readAt: r.readAt ?? new Date().toISOString() })));
    setUnread(0);
    await fetch('/api/notifications', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ action: 'markRead' }) }).catch(() => {});
  }

  async function dismiss(id: string) {
    const row = rows.find((r) => r.id === id);
    setRows((list) => list.filter((r) => r.id !== id));
    if (row && !row.readAt) setUnread((n) => Math.max(0, n - 1));
    await fetch(`/api/notifications/${id}`, { method: 'DELETE' }).catch(() => {});
  }

  async function setPreference(key: keyof NotificationPreferences, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    await fetch('/api/notifications', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ action: 'preferences', [key]: value }) }).catch(() => {});
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 12, flexWrap: 'wrap' }}>
        {unread > 0 && <button onClick={markAllRead} style={chipBtn}>Mark all read</button>}
        {showPreferences && <button onClick={() => setPrefsOpen((o) => !o)} style={chipBtn}>{prefsOpen ? 'Close' : 'Email preferences'}</button>}
      </div>

      {prefsOpen && (
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={label}>Email me about</div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 10 }}>
            {(
              [
                ['prefEmail', 'Any email at all'],
                ['notifyQuotes', 'Quotation updates'],
                ['notifySamples', 'Sample updates'],
                ['notifyShares', 'Catalogue opens'],
              ] as const
            ).map(([key, text]) => (
              <label key={key} style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={prefs[key]} onChange={(e) => setPreference(key, e.target.checked)} />
                {text}
              </label>
            ))}
          </div>
          <div style={{ ...meta, marginTop: 10 }}>
            Turning an email off never loses the message — it still appears here.
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{ fontSize: 13, fontWeight: 300, color: 'rgba(28,25,23,.5)', padding: '10px 0' }}>Nothing to report right now.</div>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
          {rows.map((row) => {
            const content = (
              <>
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: row.readAt ? 'rgba(28,25,23,.2)' : GOLD, flexShrink: 0, transform: 'translateY(-2px)' }} />
                <span style={{ fontSize: 13.5, color: INK, fontWeight: row.readAt ? 300 : 400 }}>{row.title}</span>
                {row.body && <span style={meta}>{row.body}</span>}
                <span style={{ ...meta, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{row.whenLabel}</span>
              </>
            );
            return (
              <li key={row.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(28,25,23,.06)' }}>
                {row.link ? (
                  <a href={row.link} style={{ display: 'flex', alignItems: 'baseline', gap: 10, flex: 1, minWidth: 0, textDecoration: 'none' }}>{content}</a>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 10, flex: 1, minWidth: 0 }}>{content}</span>
                )}
                <button onClick={() => dismiss(row.id)} aria-label={`Dismiss: ${row.title}`} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(28,25,23,.35)', fontSize: 14, lineHeight: 1 }}>×</button>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
