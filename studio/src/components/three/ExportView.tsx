'use client';

import { useCallback, useState } from 'react';
import { captureStage } from './capture';

/**
 * Export the rendered view (Phase 4 M30).
 *
 * A buyer's next step after deciding is nearly always to show someone else — a partner, a
 * tailor, a WhatsApp group. Until now the only thing they could send was a screenshot of a
 * browser window, which arrives with the studio's chrome around it and at whatever size their
 * screen happened to be.
 *
 * This hands them the frame itself: the cloth as it was lit and posed at that moment, named
 * after the fabric and the shade so it is still identifiable a week later in a folder of
 * forty images.
 *
 * It degrades honestly. When the stage is not rendering — no WebGL, a lost context, the flat
 * fallback showing — there is nothing to export and the control says so rather than handing
 * over a blank PNG.
 */

export function ExportView({ captureId, filename, label }: { captureId: string; filename: string; label: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'unavailable'>('idle');

  const download = useCallback(() => {
    const dataUrl = captureStage(captureId);
    if (!dataUrl || dataUrl.length < 1024) {
      // A data URL this short is a blank canvas, which is what a lost context returns.
      setState('unavailable');
      return;
    }
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${filename}.png`;
    link.click();
    setState('done');
    window.setTimeout(() => setState('idle'), 2400);
  }, [captureId, filename]);

  return (
    <button
      type="button"
      onClick={download}
      className="pc-hv-border-ink"
      data-export-view
      aria-label={label}
      style={{
        border: '1px solid rgba(28,25,23,.15)',
        borderRadius: 999,
        padding: '6px 14px',
        fontSize: 12,
        background: 'none',
        cursor: 'pointer',
        color: state === 'unavailable' ? 'rgba(28,25,23,.45)' : '#1C1917',
      }}
    >
      {state === 'done' ? '✓ Saved' : state === 'unavailable' ? 'View not available' : '↓ This view'}
    </button>
  );
}
