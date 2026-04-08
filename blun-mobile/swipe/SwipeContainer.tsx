/**
 * BLUN Mobile Swipe Container
 * Links = Chat, Rechts = Canvas
 * 60fps Touch Swipe mit Snap
 */

import React from 'react';
import { useSwipePanel } from './useSwipePanel';

interface SwipeContainerProps {
  chatPanel: React.ReactNode;
  canvasPanel: React.ReactNode;
  className?: string;
}

export function SwipeContainer({ chatPanel, canvasPanel, className = '' }: SwipeContainerProps) {
  const { containerRef, state, goToChat, goToCanvas } = useSwipePanel({
    threshold: 50,
    velocityThreshold: 0.5,
  });

  return (
    <div className={`swipe-viewport ${className}`}>
      {/* Swipe Track — wird per transform verschoben */}
      <div
        ref={containerRef}
        className="swipe-track"
        style={{
          transform: `translate3d(${-state.position * 100}%, 0, 0)`,
        }}
      >
        {/* Panel 1: Chat */}
        <div className="swipe-panel">
          {chatPanel}
        </div>

        {/* Panel 2: Canvas */}
        <div className="swipe-panel">
          {canvasPanel}
        </div>
      </div>

      {/* Dot Indicator */}
      <div className="swipe-dots" role="tablist" aria-label="Panel Navigation">
        <button
          className={`swipe-dot ${state.position === 0 ? 'active' : ''}`}
          onClick={goToChat}
          role="tab"
          aria-selected={state.position === 0}
          aria-label="Chat anzeigen"
        />
        <button
          className={`swipe-dot ${state.position === 1 ? 'active' : ''}`}
          onClick={goToCanvas}
          role="tab"
          aria-selected={state.position === 1}
          aria-label="Canvas anzeigen"
        />
      </div>
    </div>
  );
}
