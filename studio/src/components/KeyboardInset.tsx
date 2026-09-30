'use client';

import { useEffect } from 'react';

/**
 * Keeps whatever is being typed into above the on-screen keyboard.
 *
 * Safari on an iPhone does not shrink the page when its keyboard opens: the keyboard is laid over
 * it, so a sheet pinned to the bottom of the screen (sign in, a new address) and the bars and docks
 * that follow the page along its foot end up under the keys, with the field being typed into. The
 * visual viewport does shrink, so the height the keyboard takes is read from it and published as
 * `--pc-kb` on the page: the sheets stand on it, and while it is up (`html.pc-kb-open`) the bottom
 * bar and the docks step out of the way. A field taking the focus is then brought into view, in its
 * sheet or on the page, once the keyboard has risen.
 */
export function KeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    let raf = 0;
    const measure = () => {
      raf = 0;
      if (!vv) return;
      const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      // Under ~80px it is the browser's own bars moving, not a keyboard.
      const open = kb > 80;
      root.style.setProperty('--pc-kb', `${open ? kb : 0}px`);
      root.classList.toggle('pc-kb-open', open);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    const typing = (el: EventTarget | null): el is HTMLElement =>
      el instanceof HTMLElement && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(range|checkbox|radio|button|submit)$/i.test((el as HTMLInputElement).type)) || el.isContentEditable);
    let tm = 0;
    const onFocus = (e: FocusEvent) => {
      if (!typing(e.target)) return;
      const el = e.target;
      window.clearTimeout(tm);
      // After the keyboard has risen (and the sheets with it), bring the field to the middle of
      // what is still showing.
      tm = window.setTimeout(() => {
        measure();
        if (document.activeElement !== el) return;
        const r = el.getBoundingClientRect();
        const bottom = vv ? vv.height + vv.offsetTop : window.innerHeight;
        const top = vv ? vv.offsetTop : 0;
        if (r.bottom > bottom - 12 || r.top < top + 60) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 350);
    };
    vv?.addEventListener('resize', schedule);
    vv?.addEventListener('scroll', schedule);
    window.addEventListener('focusin', onFocus);
    window.addEventListener('focusout', schedule);
    measure();
    return () => {
      vv?.removeEventListener('resize', schedule);
      vv?.removeEventListener('scroll', schedule);
      window.removeEventListener('focusin', onFocus);
      window.removeEventListener('focusout', schedule);
      window.clearTimeout(tm);
      cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
