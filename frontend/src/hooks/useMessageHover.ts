import { useState, useRef, useCallback } from 'react';

/**
 * Shared hover-with-delay behavior for message rows.
 * Provides a 150ms leave delay so menus/pickers stay visible.
 * On mobile (touch), tapping a message toggles the toolbar.
 */
export function useMessageHover() {
  const [isHovered, setIsHovered] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const isTouchRef = useRef(false);

  const onMouseEnter = useCallback(() => {
    if (isTouchRef.current) return; // skip mouse events after touch
    clearTimeout(leaveTimer.current);
    setIsHovered(true);
  }, []);

  const onMouseLeave = useCallback((onLeave?: () => void) => {
    if (isTouchRef.current) return;
    leaveTimer.current = setTimeout(() => {
      setIsHovered(false);
      onLeave?.();
    }, 150);
  }, []);

  const onTouchStart = useCallback(() => {
    isTouchRef.current = true;
    setIsHovered((prev) => !prev);
  }, []);

  return { isHovered, setIsHovered, onMouseEnter, onMouseLeave, onTouchStart };
}
