import { useCallback, useRef, useState } from 'react';

interface UseLongPressOptions {
  shouldPreventDefault?: boolean;
  delay?: number;
}

export const useLongPress = (
  onLongPress: (e: any) => void,
  onClick: (e: any) => void,
  { shouldPreventDefault = true, delay = 500 }: UseLongPressOptions = {}
) => {
  const [longPressTriggered, setLongPressTriggered] = useState(false);
  const timeout = useRef<any>(null);
  const target = useRef<any>(null);
  const isMoved = useRef(false);
  const touchCoords = useRef<{ clientX: number; clientY: number }>({ clientX: 0, clientY: 0 });

  const start = useCallback(
    (event: any) => {
      isMoved.current = false;
      const touch = event.touches && event.touches.length > 0 ? event.touches[0] : event;
      touchCoords.current = {
        clientX: touch?.clientX ?? event.clientX ?? (typeof window !== 'undefined' ? window.innerWidth / 2 : 0),
        clientY: touch?.clientY ?? event.clientY ?? (typeof window !== 'undefined' ? window.innerHeight / 2 : 0)
      };

      if (shouldPreventDefault && event.target) {
        event.target.addEventListener('touchend', preventDefault, {
          passive: false
        });
        target.current = event.target;
      }
      timeout.current = setTimeout(() => {
        onLongPress({
          ...event,
          clientX: touchCoords.current.clientX,
          clientY: touchCoords.current.clientY,
          touches: event.touches,
          target: event.target,
          currentTarget: event.currentTarget,
          preventDefault: () => event.preventDefault?.(),
          stopPropagation: () => event.stopPropagation?.()
        });
        setLongPressTriggered(true);
      }, delay);
    },
    [onLongPress, delay, shouldPreventDefault]
  );

  const clear = useCallback(
    (event: any, shouldTriggerClick = true) => {
      if (timeout.current) {
        clearTimeout(timeout.current);
      }
      if (shouldTriggerClick && !longPressTriggered && !isMoved.current) {
        onClick(event);
      }
      setLongPressTriggered(false);
      if (shouldPreventDefault && target.current) {
        target.current.removeEventListener('touchend', preventDefault);
      }
    },
    [shouldPreventDefault, onClick, longPressTriggered]
  );

  return {
    onTouchStart: (e: any) => start(e),
    onTouchMove: () => {
      isMoved.current = true;
      if (timeout.current) clearTimeout(timeout.current);
    },
    onTouchEnd: (e: any) => clear(e),
    onTouchCancel: (e: any) => clear(e, false),
    onClick: (e: any) => {
      if (!isMoved.current && !longPressTriggered) {
        onClick(e);
      }
    },
    onContextMenu: (e: any) => {
      e.preventDefault();
      onLongPress(e);
    }
  };
};

const isTouchEvent = (event: Event) => {
  return 'touches' in event;
};

const preventDefault = (event: Event) => {
  if (!isTouchEvent(event)) return;
  if ((event as TouchEvent).touches.length < 2 && event.preventDefault) {
    event.preventDefault();
  }
};
