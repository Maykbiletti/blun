/**
 * BLUN Mobile Canvas Swipe Engine
 * Pure Vanilla — Touch Events + CSS Transform + rAF
 * 60fps, kein Framework, Snap 0%/100%, 50px Threshold
 *
 * Layout: [Chat-Panel | Canvas-Panel]
 * Swipe links → Canvas sichtbar, Swipe rechts → Chat sichtbar
 */

interface SwipeConfig {
  /** Container-Element mit beiden Panels */
  container: HTMLElement;
  /** Snap-Threshold in px (default 50) */
  threshold?: number;
  /** Snap-Animation Dauer in ms (default 280) */
  snapDuration?: number;
  /** Callback bei Panel-Wechsel */
  onSnap?: (panel: 'chat' | 'canvas') => void;
}

interface SwipeState {
  startX: number;
  startY: number;
  currentX: number;
  isDragging: boolean;
  isScrolling: boolean | null; // null = unentschieden
  startTime: number;
  rafId: number;
  offset: number;       // aktuelle Translation in px
  snapOffset: number;   // Ziel nach Snap: 0 oder -viewportWidth
}

export function initSwipe(config: SwipeConfig): () => void {
  const { container, threshold = 50, snapDuration = 280, onSnap } = config;
  const track = container.querySelector<HTMLElement>('[data-swipe-track]');
  if (!track) throw new Error('Element [data-swipe-track] nicht gefunden');

  let vw = container.offsetWidth;

  const state: SwipeState = {
    startX: 0,
    startY: 0,
    currentX: 0,
    isDragging: false,
    isScrolling: null,
    startTime: 0,
    rafId: 0,
    offset: 0,
    snapOffset: 0,
  };

  // --- GPU-Layer vorbereiten ---
  track.style.willChange = 'transform';
  track.style.transform = 'translate3d(0,0,0)';

  // --- Resize Handler ---
  function onResize() {
    vw = container.offsetWidth;
    // Snap-Position nach Resize korrigieren
    if (state.snapOffset !== 0) {
      state.snapOffset = -vw;
      state.offset = -vw;
      applyTransform(state.offset);
    }
  }

  // --- Transform anwenden (rAF-sicher) ---
  function applyTransform(px: number) {
    track.style.transform = `translate3d(${px}px,0,0)`;
  }

  // --- rAF Loop waehrend Drag ---
  function renderLoop() {
    if (!state.isDragging) return;
    const delta = state.currentX - state.startX;
    let newOffset = state.snapOffset + delta;

    // Clamp: nicht ueber 0 (links) oder -vw (rechts)
    newOffset = Math.max(-vw, Math.min(0, newOffset));

    // Rubber-Band an den Raendern (optional, leichter Widerstand)
    state.offset = newOffset;
    applyTransform(newOffset);

    state.rafId = requestAnimationFrame(renderLoop);
  }

  // --- Snap-Animation mit rAF ---
  function snapTo(target: number) {
    const start = state.offset;
    const distance = target - start;
    if (Math.abs(distance) < 1) {
      state.offset = target;
      state.snapOffset = target;
      applyTransform(target);
      return;
    }

    const startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / snapDuration, 1);
      // ease-out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = start + distance * ease;

      applyTransform(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        state.offset = target;
        state.snapOffset = target;
        applyTransform(target);
      }
    }

    requestAnimationFrame(animate);
  }

  // --- Touch Handlers ---
  function onTouchStart(e: TouchEvent) {
    const touch = e.touches[0];
    state.startX = touch.clientX;
    state.startY = touch.clientY;
    state.currentX = touch.clientX;
    state.isDragging = true;
    state.isScrolling = null;
    state.startTime = performance.now();

    // Laufende Animation stoppen
    cancelAnimationFrame(state.rafId);
    state.rafId = requestAnimationFrame(renderLoop);
  }

  function onTouchMove(e: TouchEvent) {
    if (!state.isDragging) return;

    const touch = e.touches[0];
    const dx = touch.clientX - state.startX;
    const dy = touch.clientY - state.startY;

    // Richtung bestimmen (einmalig)
    if (state.isScrolling === null && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      state.isScrolling = Math.abs(dy) > Math.abs(dx);
    }

    // Vertikales Scrollen → nicht eingreifen
    if (state.isScrolling) {
      state.isDragging = false;
      cancelAnimationFrame(state.rafId);
      return;
    }

    // Horizontaler Swipe → Default verhindern
    e.preventDefault();
    state.currentX = touch.clientX;
  }

  function onTouchEnd() {
    if (!state.isDragging) return;
    state.isDragging = false;
    cancelAnimationFrame(state.rafId);

    const delta = state.currentX - state.startX;
    const elapsed = performance.now() - state.startTime;
    const velocity = Math.abs(delta) / elapsed; // px/ms

    // Schneller Flick (>0.5 px/ms) oder ueber Threshold
    const shouldSnap = Math.abs(delta) > threshold || velocity > 0.5;

    let target: number;
    if (shouldSnap) {
      // Swipe nach links (delta negativ) → Canvas zeigen
      // Swipe nach rechts (delta positiv) → Chat zeigen
      target = delta < 0 ? -vw : 0;
    } else {
      // Zurueck zur aktuellen Snap-Position
      target = state.snapOffset;
    }

    snapTo(target);

    const panel = target === 0 ? 'chat' : 'canvas';
    if (target !== state.snapOffset && onSnap) {
      onSnap(panel);
    }
  }

  // --- Event Listener ---
  container.addEventListener('touchstart', onTouchStart, { passive: true });
  container.addEventListener('touchmove', onTouchMove, { passive: false });
  container.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });

  // --- Cleanup ---
  return () => {
    container.removeEventListener('touchstart', onTouchStart);
    container.removeEventListener('touchmove', onTouchMove);
    container.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('resize', onResize);
    cancelAnimationFrame(state.rafId);
  };
}
