import { useEffect, useRef } from 'react';

/**
 * Focuses the returned ref's element one frame after mount, instead of via
 * the native `autofocus` attribute.
 *
 * Why: `autofocus` applies synchronously, inside whatever event turn caused
 * the element to mount. If that turn is itself a keydown handler for
 * Enter/Space, the browser's own "Enter activates the currently-focused
 * element" default action can then fire *again* for that same keypress —
 * now against the element that just autofocused. Deferring the focus by a
 * frame keeps the same "land on the primary action" UX for keyboard/TV
 * remote users (so the remote's OK button works immediately) without racing
 * the keypress that caused it.
 *
 * Ported from the sibling Eggcatcher-/useAutoFocus hook.
 */
export function useAutoFocus() {
  const ref = useRef(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => ref.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  return ref;
}
