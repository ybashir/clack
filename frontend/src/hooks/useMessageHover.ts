import { useState, useRef, useCallback } from 'react';

/**
 * Shared hover-with-delay behavior for message rows.
 * Provides a 150ms leave delay so menus/pickers stay visible.
 */
export function useMessageHover() {
  const [isHovered, setIsHovered] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>();

  const onMouseEnter = useCallback(() => {
    clearTimeout(leaveTimer.current);
    setIsHovered(true);
  }, []);

  const onMouseLeave = useCallback((onLeave?: () => void) => {
    leaveTimer.current = setTimeout(() => {
      setIsHovered(false);
      onLeave?.();
    }, 150);
  }, []);

  return { isHovered, onMouseEnter, onMouseLeave };
}
