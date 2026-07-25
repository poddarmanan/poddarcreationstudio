'use client';

/**
 * Exporting a rendered frame (Phase 4 M30).
 *
 * The catch: the canvas is created with `preserveDrawingBuffer: false`, because keeping the
 * buffer costs memory on every frame for the sake of an operation that happens once in a
 * session. That means `toDataURL()` on a live canvas returns a blank image — the driver is
 * entitled to have thrown the pixels away the moment they were shown.
 *
 * So a capture is not a read; it is a **render followed immediately by a read**, in the same
 * synchronous turn, before the browser can present and clear. That is why this is a registry of
 * callbacks that live inside the canvas rather than a function anyone can call on the element.
 */

type Capture = () => string | null;

const captures = new Map<string, Capture>();

export function registerCapture(id: string, capture: Capture): () => void {
  captures.set(id, capture);
  return () => {
    // Only remove our own entry: a remount can register the new one before the old unmounts.
    if (captures.get(id) === capture) captures.delete(id);
  };
}

/** A PNG data URL of what the named stage is showing, or null if it is not rendering. */
export function captureStage(id: string): string | null {
  return captures.get(id)?.() ?? null;
}

export function canCapture(id: string): boolean {
  return captures.has(id);
}
