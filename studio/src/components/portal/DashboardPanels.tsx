'use client';

import type { CSSProperties } from 'react';
import { card } from './AccountPanels';

/**
 * Dashboard panels added in Phase 3 M14: the customer's activity feed, upcoming follow-ups,
 * and rule-based recommendations. Same tokens as the rest of the portal — these read as more
 * of the same page.
 */

const INK = '#1C1917';
const GOLD = '#8A6D45';
const emptyNote: CSSProperties = { fontSize: 13, fontWeight: 300, color: 'rgba(28,25,23,.5)', padding: '10px 0' };
const meta: CSSProperties = { fontSize: 11.5, color: 'rgba(28,25,23,.5)' };

// `whenLabel` / `dueLabel` / `overdue` are computed on the server against a single `now`
// (see server/dashboard/format.ts) — the client never reads the clock during render.
export interface ActivityRow { id: string; type: string; title: string; detail: string | null; createdAt: string; whenLabel: string }
export interface FollowUpRow { id: string; subject: string; note: string | null; dueAt: string; dueLabel: string; overdue: boolean; assignee: { name: string } | null }
export interface RecommendationRow { reason: string; shades: { id: string; name: string; hex: string | null; fabricId: string; fabricName: string }[] }

export function ActivityFeed({ rows }: { rows: ActivityRow[] }) {
  if (rows.length === 0) {
    return <div style={emptyNote}>Your activity will appear here as you save shades, build collections and request quotations.</div>;
  }
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
      {rows.map((row) => (
        <li key={row.id} style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(28,25,23,.06)' }}>
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, flexShrink: 0, transform: 'translateY(-2px)' }} />
          <span style={{ fontSize: 13.5, color: INK }}>{row.title}</span>
          {row.detail && <span style={meta}>{row.detail}</span>}
          <span style={{ ...meta, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{row.whenLabel}</span>
        </li>
      ))}
    </ol>
  );
}

export function FollowUps({ rows }: { rows: FollowUpRow[] }) {
  if (rows.length === 0) {
    return <div style={emptyNote}>No scheduled touchpoints. Our team will add one when you have an open enquiry.</div>;
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rows.map((row) => {
        const { overdue } = row;
        return (
          <div key={row.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 14, color: INK }}>{row.subject}</div>
              <div style={meta}>
                {new Date(row.dueAt).toLocaleDateString()}
                {row.assignee && ` · ${row.assignee.name}`}
                {row.note && ` · ${row.note}`}
              </div>
            </div>
            <span style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', borderRadius: 999, padding: '4px 12px', color: overdue ? '#A33' : GOLD, background: overdue ? 'rgba(170,51,51,.08)' : 'rgba(138,109,69,.1)' }}>
              {row.dueLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function Recommendations({ groups }: { groups: RecommendationRow[] }) {
  if (groups.length === 0) return <div style={emptyNote}>Save a few shades and we&rsquo;ll suggest others to look at.</div>;
  return (
    <div style={{ display: 'grid', gap: 22 }}>
      {groups.map((group) => (
        <div key={group.reason}>
          <div style={{ fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: GOLD, marginBottom: 10 }}>{group.reason}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            {group.shades.map((shade) => (
              <a
                key={shade.id}
                href={`/?fabric=${encodeURIComponent(shade.fabricId)}&colour=${encodeURIComponent(shade.id)}`}
                style={{ width: 118, textDecoration: 'none' }}
              >
                <div className="pc-pink" style={{ height: 84, borderRadius: '4px 4px 0 0', background: shade.hex ?? '#E8DFD2', boxShadow: 'inset 0 0 0 1px rgba(28,25,23,.08)' }} />
                <div style={{ padding: '7px 2px 0' }}>
                  <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 14.5, fontWeight: 600, color: INK }}>{shade.name}</div>
                  <div style={{ fontSize: 10.5, color: 'rgba(28,25,23,.5)' }}>{shade.fabricName}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
