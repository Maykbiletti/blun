import React from 'react';

const styleId = 'blun-loading-spinner-styles';

function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes blunSpinnerRotate {
      to { transform: rotate(360deg); }
    }

    @keyframes blunSpinnerPulse {
      0%, 100% { opacity: 0.45; }
      50% { opacity: 1; }
    }

    .blun-spinner {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }

    .blun-spinner__ring {
      box-sizing: border-box;
      border-style: solid;
      border-color: rgba(255, 255, 255, 0.25);
      border-top-color: currentColor;
      border-radius: 999px;
      animation: blunSpinnerRotate 0.9s linear infinite;
      will-change: transform;
    }

    .blun-spinner__core {
      position: absolute;
      border-radius: 999px;
      background: currentColor;
      animation: blunSpinnerPulse 1.2s ease-in-out infinite;
      will-change: opacity;
    }
  `;

  document.head.appendChild(style);
}

export default function LoadingSpinner({
  size = 40,
  thickness = 4,
  color = '#ffffff',
  speed = 0.9,
  pulse = true,
  className = '',
  style = {},
  label = 'Loading'
}) {
  ensureStyles();

  const ringStyle = {
    width: size,
    height: size,
    borderWidth: thickness,
    animationDuration: `${speed}s`
  };

  const coreSize = Math.max(2, Math.round(size * 0.24));
  const coreStyle = {
    width: coreSize,
    height: coreSize,
    animationDuration: `${Math.max(0.4, speed * 1.3)}s`
  };

  return (
    <span
      role="status"
      aria-label={label}
      className={`blun-spinner ${className}`.trim()}
      style={{ color, width: size, height: size, ...style }}
    >
      <span className="blun-spinner__ring" style={ringStyle} />
      {pulse ? <span className="blun-spinner__core" style={coreStyle} /> : null}
    </span>
  );
}
