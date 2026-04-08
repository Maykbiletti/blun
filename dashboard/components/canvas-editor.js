/**
 * Canvas-Editor MVP
 * Split-Screen: links Chat, rechts Canvas mit Live-Preview
 * Stop/Übernehmen Buttons, WebSocket Streaming
 */

class CanvasEditor {
  constructor(containerId, wsUrl) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    this.panels = { left: null, right: null };
    this.splitRatio = 0.5;
    this.ws = null;
    this.wsUrl = wsUrl || null;
    this.previewDebounce = null;
    this.isStreaming = false;
    this.streamBuffer = '';
    this.originalContent = '';
    this.onAccept = null;
    this.onStop = null;

    this.init();
    if (this.wsUrl) this.connectWs();
  }

  init() {
    this.container.innerHTML = '';
    this.container.style.cssText = 'display:flex;flex-direction:column;height:100%;width:100%;';

    // Toolbar mit Status und Buttons
    this.toolbar = this.createToolbar();

    // Split-Screen Container
    const editorRow = document.createElement('div');
    editorRow.style.cssText = 'display:flex;flex:1;overflow:hidden;gap:0;';

    // Linke Panel: Chat
    this.panels.left = this.createPanel('canvas-chat-panel', 'Chat');
    this.panels.left.style.background = '#0f172a';

    // Divider
    const divider = this.createDivider();

    // Rechte Panel: Canvas
    this.panels.right = this.createPanel('canvas-preview-panel', 'Preview');
    this.panels.right.style.background = '#fff';

    editorRow.append(this.panels.left, divider, this.panels.right);
    this.container.append(this.toolbar, editorRow);

    this.applyRatio();
    this.setupLivePreview();
  }

  createToolbar() {
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;background:#1e293b;border-bottom:1px solid #334155;flex-shrink:0;height:44px;';

    // Status Dot
    this.statusDot = document.createElement('span');
    this.statusDot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#64748b;flex-shrink:0;';
    bar.appendChild(this.statusDot);

    // Status Text
    this.statusText = document.createElement('span');
    this.statusText.style.cssText = 'color:#94a3b8;font-size:12px;font-family:sans-serif;flex:1;';
    this.statusText.textContent = 'Bereit';
    bar.appendChild(this.statusText);

    // Stop Button
    this.stopBtn = document.createElement('button');
    this.stopBtn.textContent = '⏹ Stop';
    this.stopBtn.style.cssText = 'padding:6px 12px;background:#ef4444;color:#fff;border:none;border-radius:4px;font-size:12px;cursor:pointer;display:none;font-weight:600;';
    this.stopBtn.addEventListener('click', () => this.handleStop());
    bar.appendChild(this.stopBtn);

    // Accept Button
    this.acceptBtn = document.createElement('button');
    this.acceptBtn.textContent = '✓ Übernehmen';
    this.acceptBtn.style.cssText = 'padding:6px 12px;background:#22c55e;color:#fff;border:none;border-radius:4px;font-size:12px;cursor:pointer;display:none;font-weight:600;';
    this.acceptBtn.addEventListener('click', () => this.handleAccept());
    bar.appendChild(this.acceptBtn);

    // Discard Button
    this.discardBtn = document.createElement('button');
    this.discardBtn.textContent = '✕ Verwerfen';
    this.discardBtn.style.cssText = 'padding:6px 12px;background:#475569;color:#fff;border:none;border-radius:4px;font-size:12px;cursor:pointer;display:none;font-weight:600;';
    this.discardBtn.addEventListener('click', () => this.handleDiscard());
    bar.appendChild(this.discardBtn);

    return bar;
  }

  createPanel(id, title) {
    const panel = document.createElement('div');
    panel.id = id;
    panel.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:auto;position:relative;border:1px solid #334155;';

    const header = document.createElement('div');
    header.style.cssText = 'padding:8px 12px;background:#1e293b;border-bottom:1px solid #334155;flex-shrink:0;font-size:12px;font-weight:600;color:#94a3b8;';
    header.textContent = title;
    panel.appendChild(header);

    const content = document.createElement('div');
    content.className = 'panel-content';
    content.style.cssText = 'flex:1;overflow:auto;padding:12px;';
    panel.appendChild(content);

    return panel;
  }

  createDivider() {
    const div = document.createElement('div');
    div.style.cssText = 'width:6px;cursor:col-resize;background:#2d2d2d;flex-shrink:0;transition:background 0.2s;user-select:none;';

    div.addEventListener('mouseenter', () => { div.style.background = '#3b82f6'; });
    div.addEventListener('mouseleave', () => { if (!this._dragging) div.style.background = '#2d2d2d'; });

    let startX, startRatio;
    const onMove = (e) => {
      const delta = (e.clientX - startX) / this.container.offsetWidth;
      this.splitRatio = Math.min(0.8, Math.max(0.2, startRatio + delta));
      this.applyRatio();
    };

    div.addEventListener('mousedown', (e) => {
      this._dragging = true;
      startX = e.clientX;
      startRatio = this.splitRatio;
      div.style.background = '#3b82f6';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', () => {
        this._dragging = false;
        div.style.background = '#2d2d2d';
        document.removeEventListener('mousemove', onMove);
        // Persist split ratio
        if (window.WorkspacePrefs) {
          window.WorkspacePrefs.setPref('splitRatio', this.splitRatio);
        }
      }, { once: true });
    });

    return div;
  }

  applyRatio() {
    this.panels.left.style.width = `${this.splitRatio * 100}%`;
    this.panels.right.style.width = `${(1 - this.splitRatio) * 100}%`;
  }

  setSplitRatio(ratio) {
    this.splitRatio = Math.min(0.8, Math.max(0.2, ratio));
    this.applyRatio();
  }

  setStreaming(active) {
    this.isStreaming = active;
    this.stopBtn.style.display = active ? 'inline-block' : 'none';
    this.acceptBtn.style.display = active ? 'none' : (this.streamBuffer ? 'inline-block' : 'none');
    this.discardBtn.style.display = active ? 'none' : (this.streamBuffer ? 'inline-block' : 'none');

    this.statusDot.style.background = active ? '#f59e0b' : (this.streamBuffer ? '#3b82f6' : '#64748b');
    this.statusText.textContent = active ? 'Agent generiert...' : (this.streamBuffer ? 'Vorschau bereit' : 'Bereit');
  }

  handleStop() {
    this.isStreaming = false;
    this.sendWs({ type: 'stream_stop' });
    this.setStreaming(false);
    if (this.onStop) this.onStop(this.streamBuffer);
  }

  handleAccept() {
    const content = this.streamBuffer;
    this.streamBuffer = '';
    this.originalContent = '';
    this.setStreaming(false);
    this.panels.right.querySelector('.panel-content').innerHTML = '';
    this.statusText.textContent = 'Übernommen';

    if (this.onAccept) this.onAccept(content);
    document.dispatchEvent(new CustomEvent('canvas-accept', { detail: { content } }));

    setTimeout(() => { this.statusText.textContent = 'Bereit'; }, 2000);
  }

  handleDiscard() {
    this.streamBuffer = '';
    this.originalContent = '';
    this.setStreaming(false);
    const content = this.panels.right.querySelector('.panel-content');
    content.innerHTML = '<div style="color:#888;padding:20px;text-align:center;font-size:12px;">Vorschau verworfen</div>';
    this.statusText.textContent = 'Verworfen';
    setTimeout(() => {
      this.statusText.textContent = 'Bereit';
      content.innerHTML = '';
    }, 1500);
  }

  setupLivePreview() {
    const leftContent = this.panels.left.querySelector('.panel-content');
    if (!leftContent) return;

    leftContent.addEventListener('input', (e) => {
      if (e.target.tagName === 'TEXTAREA' || e.target.contentEditable === 'true') {
        clearTimeout(this.previewDebounce);
        this.previewDebounce = setTimeout(() => this.renderPreview(), 300);
      }
    });
  }

  renderPreview() {
    const leftContent = this.panels.left.querySelector('.panel-content');
    const textarea = leftContent?.querySelector('textarea') || leftContent?.querySelector('[data-source]');
    if (!textarea) return;

    const raw = textarea.value || textarea.textContent || '';
    const rightContent = this.panels.right.querySelector('.panel-content');

    try {
      rightContent.innerHTML = `<pre style="color:#333;padding:12px;margin:0;white-space:pre-wrap;font-family:monospace;font-size:12px;line-height:1.5;">${this.escapeHtml(raw)}</pre>`;
    } catch (_) {
      rightContent.innerHTML = `<div style="color:#888;padding:12px;">[Preview Error]</div>`;
    }
  }

  connectWs() {
    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        this.statusDot.style.background = '#22c55e';
        this.statusText.textContent = 'Verbunden';
        setTimeout(() => {
          if (!this.isStreaming) this.statusText.textContent = 'Bereit';
        }, 1500);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'stream_start') {
            const textarea = this.panels.left.querySelector('textarea');
            this.originalContent = textarea ? textarea.value : '';
            this.streamBuffer = '';
            this.setStreaming(true);
          }

          if (msg.type === 'stream_chunk' && msg.content) {
            this.streamBuffer += msg.content;
            const rightContent = this.panels.right.querySelector('.panel-content');
            rightContent.innerHTML = `<pre style="color:#333;padding:12px;margin:0;white-space:pre-wrap;font-family:monospace;font-size:12px;line-height:1.5;"><span style="opacity:0.6;">${this.escapeHtml(this.streamBuffer)}</span><span style="opacity:0.8;">▊</span></pre>`;
          }

          if (msg.type === 'stream_end') {
            this.setStreaming(false);
          }

          if (msg.type === 'content_update' && msg.panel && msg.html) {
            const panelEl = this.panels[msg.panel];
            if (panelEl) {
              panelEl.querySelector('.panel-content').innerHTML = msg.html;
            }
          }
        } catch (_) {}
      };

      this.ws.onclose = () => {
        this.statusDot.style.background = '#ef4444';
        this.statusText.textContent = 'Getrennt...';
        setTimeout(() => this.connectWs(), 3000);
      };

      this.ws.onerror = () => {
        this.statusDot.style.background = '#ef4444';
      };
    } catch (_) {
      // WS nicht verfügbar
    }
  }

  sendWs(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  destroy() {
    if (this.ws) this.ws.close();
    clearTimeout(this.previewDebounce);
    this.container.innerHTML = '';
  }
}

if (typeof module !== 'undefined') module.exports = { CanvasEditor };
