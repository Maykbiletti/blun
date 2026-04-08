/**
 * Beispiel: Integration in BLUN App
 */

import React from 'react';
import { SwipeContainer } from './SwipeContainer';
import './swipe.css';

// Beispiel-Panels
function ChatPanel() {
  return (
    <div style={{ padding: '16px' }}>
      <h2>Chat</h2>
      <p>Agent-Nachrichten hier...</p>
    </div>
  );
}

function CanvasPanel() {
  return (
    <div style={{ padding: '16px' }}>
      <h2>Canvas</h2>
      <p>Agent-Workspace hier...</p>
    </div>
  );
}

export default function MobileApp() {
  return (
    <SwipeContainer
      chatPanel={<ChatPanel />}
      canvasPanel={<CanvasPanel />}
    />
  );
}
