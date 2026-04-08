/**
 * BLUN Mobile Canvas Swipe Hook
 * Touch Events + CSS Transform + rAF
 * Snap: 0% (Chat) / 100% (Canvas)
 * Threshold: 50px
 * Target: 60fps smooth
 */

import { useRef, useCallback, useEffect, useState } from 'react';

interface SwipeState {
  /** 0 = Chat sichtbar, 1 = Canvas sichtbar */
  position: number;
  isSwiping: boolean;
  direction: 'left' | 'right' | null;
}

interface SwipeConfig {
  threshold?: number;       // px zum Ausloesen (default 50)
  maxDuration?: number;     // ms — schneller Swipe braucht weniger Distance
  velocityThreshold?: number; // px/ms fuer Velocity-basiertes Snap
}

export function useSwipePanel(config: SwipeConfig = {}) {
  const {
    threshold = 50,
    maxDuration = 300,
    velocityThreshold = 0.5,
  } = config;

  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<SwipeState>({
    position: 0,
    isSwiping: false,
    direction: null,
  });

  // Refs fuer Touch-Tracking (keine Re-Renders)
  const touchStart = useRef({ x: 0, y: 0, time: 0 });
  const currentX = useRef(0);
  const rafId = useRef<number>(0);
  const panelWidth = useRef(0);
  const currentPosition = useRef(0); // 0 oder 1
  const isVerticalScroll = useRef(false);

  // --- Transform anwenden via rAF ---
  const applyTransform = useCallback((translateX: number) => {
    const el = containerRef.current;
    if (!el) return;
    // will-change ist im CSS, hier nur transform setzen
    el.style.transform = `translate3d(${translateX}px, 0, 0)`;
  }, []);

  // --- Snap-Animation mit CSS Transition ---
  const snapTo = useCallback((targetPosition: number) => {
    const el = containerRef.current;
    if (!el) return;

    currentPosition.current = targetPosition;
    const targetX = -targetPosition * panelWidth.current;

    // CSS Transition fuer smooth snap
    el.style.transition = 'transform 280ms cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    el.style.transform = `translate3d(${targetX}px, 0, 0)`;

    setState({
      position: targetPosition,
      isSwiping: false,
      direction: null,
    });

    // Transition cleanup
    const onEnd = () => {
      el.style.transition = '';
      el.removeEventListener('transitionend', onEnd);
    };
    el.addEventListener('transitionend', onEnd);
  }, []);

  // --- Touch Handlers ---
  const onTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    touchStart.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
    currentX.current = 0;
    isVerticalScroll.current = false;

    const el = containerRef.current;
    if (el) {
      el.style.transition = '';
      panelWidth.current = el.parentElement?.offsetWidth || window.innerWidth;
    }

    setState(s => ({ ...s, isSwiping: true }));
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStart.current.x;
    const deltaY = touch.clientY - touchStart.current.y;

    // Erste 10px: Richtung erkennen
    if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) return;

    // Vertikales Scrollen? → ignorieren
    if (!isVerticalScroll.current && Math.abs(deltaY) > Math.abs(deltaX) * 1.2) {
      isVerticalScroll.current = true;
    }
    if (isVerticalScroll.current) return;

    // Horizontales Swipen → preventDefault (kein Browser-Scroll)
    e.preventDefault();

    currentX.current = deltaX;

    // rAF fuer 60fps
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      const baseX = -currentPosition.current * panelWidth.current;
      let newX = baseX + deltaX;

      // Rubber-Band an den Raendern (30% Daempfung)
      if (newX > 0) {
        newX = newX * 0.3;
      } else if (newX < -panelWidth.current) {
        newX = -panelWidth.current + (newX + panelWidth.current) * 0.3;
      }

      applyTransform(newX);
    });

    setState(s => ({
      ...s,
      direction: deltaX < 0 ? 'left' : 'right',
    }));
  }, [applyTransform]);

  const onTouchEnd = useCallback(() => {
    cancelAnimationFrame(rafId.current);

    if (isVerticalScroll.current) {
      setState(s => ({ ...s, isSwiping: false }));
      return;
    }

    const deltaX = currentX.current;
    const elapsed = Date.now() - touchStart.current.time;
    const velocity = Math.abs(deltaX) / elapsed; // px/ms

    let target = currentPosition.current;

    // Schneller Swipe ODER ueber Threshold
    if (velocity > velocityThreshold && elapsed < maxDuration) {
      // Velocity-basiert
      target = deltaX < 0 ? 1 : 0;
    } else if (Math.abs(deltaX) > threshold) {
      // Distance-basiert
      target = deltaX < 0 ? 1 : 0;
    }

    // Clamp
    target = Math.max(0, Math.min(1, target));

    snapTo(target);
  }, [threshold, maxDuration, velocityThreshold, snapTo]);

  // --- Event Listeners mit passive: false fuer preventDefault ---
  useEffect(() => {
    const el = containerRef.current?.parentElement;
    if (!el) return;

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      cancelAnimationFrame(rafId.current);
    };
  }, [onTouchStart, onTouchMove, onTouchEnd]);

  // --- Programmatisch navigieren ---
  const goToChat = useCallback(() => snapTo(0), [snapTo]);
  const goToCanvas = useCallback(() => snapTo(1), [snapTo]);
  const toggle = useCallback(() => {
    snapTo(currentPosition.current === 0 ? 1 : 0);
  }, [snapTo]);

  return {
    containerRef,
    state,
    goToChat,
    goToCanvas,
    toggle,
  };
}
