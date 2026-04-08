/**
 * Canvas-Editor MVP
 * Split-Screen: links Chat, rechts Canvas mit Live-Preview
 * Mobile-Swipe Navigation, Stop/Übernehmen Buttons, WebSocket Streaming
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

    // Mobile-Swipe State
    this.isMobile = window.innerWidth < 768;
    this.activePanel = 'left'; // 'left' = Chat, 'right' = Canvas
    this.swipeStart = 0;
    this.swipeActive = false;
    this.touchStartX = 0;
    this.touchStartY = 0;

    this.init();
    if (this.wsUrl) this.connectWs();
    window.addEventListener('resize', () => this.handleResize());
  }

  init() {
    this.container.innerHTML = '';
    this.container.style.cssText = 'display:flex;flex-direction:column;height:100%;width:100%;';

    // Toolbar mit Status und Buttons
    this.toolbar = this.createToolbar();

    // Split-Screen Container
    const editorRow = document.createElement('div');
    this.editorRow = editorRow;
    editorRow.style.cssText = 'display:flex;flex:1;overflow:hidden;gap:0;position:relative;';

    // Linke Panel: Chat
    this.panels.left = this.createPanel('canvas-chat-panel', 'Chat');
    this.panels.left.style.background = '#0f172a';

    // Rechte Panel: Canvas
    this.panels.right = this.createPanel('canvas-preview-panel', 'Preview');
    this.panels.right.style.background = '#fff';

    if (this.isMobile) {
      // Mobile: Panels nebeneinander mit Swipe-Navigation
      this.panelWrapper = document.createElement('div');
      this.panelWrapper.style.cssText = 'display:flex;flex:1;overflow:hidden;width:100%;height:100%;flex-direction:row;transition:transform 0.3s ease-out;';

      // Beide panels bekommen gleiche width
      this.panels.left.style.width = '100%';
      this.panels.left.style.minWidth = '100%';
      this.panels.right.style.width = '100%';
      this.panels.right.style.minWidth = '100%';

      this.panelWrapper.appendChild(this.panels.left);
      this.panelWrapper.appendChild(this.panels.right);
      editorRow.appendChild(this.panelWrapper);
      this.setupMobileSwipe();
      this.updateMobileLayout();
    } else {
      // Desktop: nebeneinander mit Divider
      const divider = this.createDivider();
      editorRow.append(this.panels.left, divider, this.panels.right);
      this.applyRatio();
    }

    this.container.append(this.toolbar, editorRow);
    this.setupLivePreview();
    this.setupChatInput();
  }

  createToolbar() {
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;background:#1e293b;border-bottom:1px solid #334155;flex-shrink:0;height:44px;flex-wrap:wrap;';

    // Mobile: Panel Switcher
    if (this.isMobile) {
      const switcher = document.createElement('div');
      switcher.style.cssText = 'display:flex;gap:4px;order:1;width:100%;';

      const chatBtn = document.createElement('button');
      chatBtn.textContent = '💬 Chat';
      chatBtn.dataset.panel = 'left';
      chatBtn.style.cssText = 'flex:1;padding:6px;background:#1e293b;color:#94a3b8;border:1px solid #334155;border-radius:4px;font-size:11px;cursor:pointer;transition:all 0.2s;';
      chatBtn.addEventListener('click', () => this.switchPanel('left'));

      const canvasBtn = document.createElement('button');
      canvasBtn.textContent = '🎨 Canvas';
      canvasBtn.dataset.panel = 'right';
      canvasBtn.style.cssText = 'flex:1;padding:6px;background:#1e293b;color:#94a3b8;border:1px solid #334155;border-radius:4px;font-size:11px;cursor:pointer;transition:all 0.2s;';
      canvasBtn.addEventListener('click', () => this.switchPanel('right'));

      this.panelSwitchers = { left: chatBtn, right: canvasBtn };
      switcher.append(chatBtn, canvasBtn);
      bar.appendChild(switcher);
    }

    // Status Dot
    this.statusDot = document.createElement('span');
    this.statusDot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#64748b;flex-shrink:0;order:2;';
    bar.appendChild(this.statusDot);

    // Status Text
    this.statusText = document.createElement('span');
    this.statusText.style.cssText = 'color:#94a3b8;font-size:12px;font-family:sans-serif;flex:1;order:3;';
    this.statusText.textContent = 'Bereit';
    bar.appendChild(this.statusText);

    // Stop Button
    this.stopBtn = document.createElement('button');
    this.stopBtn.textContent = '⏹ Stop';
    this.stopBtn.style.cssText = 'padding:6px 12px;background:#ef4444;color:#fff;border:none;border-radius:4px;font-size:12px;cursor:pointer;display:none;font-weight:600;order:4;';
    this.stopBtn.addEventListener('click', () => this.handleStop());
    bar.appendChild(this.stopBtn);

    // Accept Button
    this.acceptBtn = document.createElement('button');
    this.acceptBtn.textContent = '✓ Übernehmen';
    this.acceptBtn.style.cssText = 'padding:6px 12px;background:#22c55e;color:#fff;border:none;border-radius:4px;font-size:12px;cursor:pointer;display:none;font-weight:600;order:5;';
    this.acceptBtn.addEventListener('click', () => this.handleAccept());
    bar.appendChild(this.acceptBtn);

    // Discard Button
    this.discardBtn = document.createElement('button');
    this.discardBtn.textContent = '✕ Verwerfen';
    this.discardBtn.style.cssText = 'padding:6px 12px;background:#475569;color:#fff;border:none;border-radius:4px;font-size:12px;cursor:pointer;display:none;font-weight:600;order:6;';
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

  // Mobile Swipe & Responsive
  setupMobileSwipe() {
    const wrapper = this.panelWrapper;
    let startX = 0;
    let currentX = 0;
    let isDragging = false;

    wrapper.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      startX = touch.clientX;
      currentX = startX;
      isDragging = true;
      this.touchStartY = touch.clientY;
      this.touchStartX = touch.clientX;
      wrapper.style.transition = 'none';
    });

    wrapper.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      currentX = touch.clientX;
      const diffX = currentX - startX;
      const diffY = Math.abs(touch.clientY - this.touchStartY);

      // Nur horizontal swipen, nicht vertikal scrollbar triggern
      if (diffY < Math.abs(diffX)) {
        e.preventDefault();
        const offset = this.activePanel === 'left' ? diffX : -100 + (diffX / wrapper.offsetWidth * 100);
        wrapper.style.transform = `translateX(${offset}px)`;
      }
    });

    wrapper.addEventListener('touchend', (e) => {
      if (!isDragging) return;
      isDragging = false;
      wrapper.style.transition = 'transform 0.3s ease-out';

      const diffX = currentX - startX;
      const threshold = wrapper.offsetWidth * 0.2;

      if (Math.abs(diffX) > threshold) {
        if (diffX > 0 && this.activePanel === 'right') {
          this.switchPanel('left');
        } else if (diffX < 0 && this.activePanel === 'left') {
          this.switchPanel('right');
        } else {
          this.updateMobileLayout();
        }
      } else {
        this.updateMobileLayout();
      }
    });
  }

  switchPanel(panelName) {
    this.activePanel = panelName;
    this.updateMobileLayout();

    if (this.panelSwitchers) {
      Object.keys(this.panelSwitchers).forEach(key => {
        const btn = this.panelSwitchers[key];
        if (key === panelName) {
          btn.style.background = '#3b82f6';
          btn.style.color = '#fff';
          btn.style.borderColor = '#3b82f6';
        } else {
          btn.style.background = '#1e293b';
          btn.style.color = '#94a3b8';
          btn.style.borderColor = '#334155';
        }
      });
    }
  }

  updateMobileLayout() {
    if (!this.isMobile || !this.panelWrapper) return;

    const wrapper = this.panelWrapper;
    const offset = this.activePanel === 'left' ? 0 : -100;
    wrapper.style.transform = `translateX(${offset}%)`;
  }

  handleResize() {
    const wasMobile = this.isMobile;
    this.isMobile = window.innerWidth < 768;

    if (wasMobile !== this.isMobile) {
      // Responsive Umschaltung
      this.init();
    }
  }

  setupChatInput() {
    const chatContent = this.panels.left.querySelector('.panel-content');
    if (!chatContent) return;

    // Erstelle Input-Bereich am unteren Ende
    const inputArea = document.createElement('div');
    inputArea.className = 'chat-input-area';
    inputArea.style.cssText = `
      flex-shrink: 0;
      border-top: 1px solid #334155;
      padding: 10px;
      background: #0f172a;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 160px;
      overflow-y: auto;
    `;

    // Text-Input Container
    const inputContainer = document.createElement('div');
    inputContainer.style.cssText = `
      display: flex;
      gap: 6px;
      align-items: flex-start;
    `;

    // Text-Input
    const textInput = document.createElement('textarea');
    textInput.className = 'chat-text-input';
    textInput.placeholder = '📎 Drag files here, Ctrl+V paste, or type...';
    textInput.style.cssText = `
      flex: 1;
      padding: 8px 10px;
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid #334155;
      border-radius: 4px;
      font-family: inherit;
      font-size: 13px;
      resize: none;
      min-height: 60px;
      max-height: 100px;
      outline: none;
      box-sizing: border-box;
    `;
    textInput.addEventListener('focus', () => {
      textInput.style.borderColor = '#3b82f6';
    });
    textInput.addEventListener('blur', () => {
      textInput.style.borderColor = '#334155';
    });

    // Emoji-Picker Button
    const emojiBtn = document.createElement('button');
    emojiBtn.textContent = '😀';
    emojiBtn.title = 'Emoji-Picker';
    emojiBtn.style.cssText = `
      padding: 8px 10px;
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid #334155;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    `;
    emojiBtn.addEventListener('mouseenter', () => {
      emojiBtn.style.borderColor = '#3b82f6';
      emojiBtn.style.background = '#334155';
    });
    emojiBtn.addEventListener('mouseleave', () => {
      emojiBtn.style.borderColor = '#334155';
      emojiBtn.style.background = '#1e293b';
    });
    emojiBtn.addEventListener('click', (e) => {
      this.toggleEmojiPicker(e, textInput);
    });

    // Voice-Control Button
    const voiceBtn = document.createElement('button');
    voiceBtn.textContent = '🎤';
    voiceBtn.title = 'Voice-Control (click to start)';
    voiceBtn.style.cssText = `
      padding: 8px 10px;
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid #334155;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    `;
    voiceBtn.addEventListener('mouseenter', () => {
      voiceBtn.style.borderColor = '#3b82f6';
      voiceBtn.style.background = '#334155';
    });
    voiceBtn.addEventListener('mouseleave', () => {
      voiceBtn.style.borderColor = '#334155';
      voiceBtn.style.background = '#1e293b';
    });
    voiceBtn.addEventListener('click', () => {
      this.toggleVoiceControl(voiceBtn, textInput);
    });

    inputContainer.append(textInput, emojiBtn, voiceBtn);

    // File-Preview Area
    const filesArea = document.createElement('div');
    filesArea.className = 'chat-files-preview';
    filesArea.style.cssText = `
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      min-height: 0;
    `;

    // Drag-Drop Zone
    inputArea.style.border = '1px dashed #334155';
    inputArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      inputArea.style.borderColor = '#3b82f6';
      inputArea.style.background = 'rgba(59, 130, 246, 0.05)';
    });
    inputArea.addEventListener('dragleave', (e) => {
      if (e.target === inputArea) {
        inputArea.style.borderColor = '#334155';
        inputArea.style.background = '#0f172a';
      }
    });
    inputArea.addEventListener('drop', (e) => {
      e.preventDefault();
      inputArea.style.borderColor = '#334155';
      inputArea.style.background = '#0f172a';
      this.handleFilesDrop(e.dataTransfer.files, filesArea);
    });

    // Paste Handler (Ctrl+V)
    document.addEventListener('paste', (e) => {
      if (document.activeElement === textInput || this.panels.left.contains(document.activeElement)) {
        this.handlePasteEvent(e, filesArea);
      }
    });

    inputArea.append(inputContainer, filesArea);

    // Add input area to chat panel
    const chatPanel = this.panels.left;
    chatPanel.style.display = 'flex';
    chatPanel.style.flexDirection = 'column';
    chatPanel.querySelector('.panel-content').style.flex = '1';
    chatPanel.appendChild(inputArea);

    this.chatInput = { textInput, filesArea, inputArea, files: [] };
  }

  toggleEmojiPicker(e, textInput) {
    // Remove existing picker
    const existing = document.querySelector('.chat-emoji-picker-popup');
    if (existing) {
      existing.remove();
      return;
    }

    const picker = this.createEmojiPicker();
    const rect = e.target.getBoundingClientRect();
    picker.style.cssText = `
      position: fixed;
      bottom: ${window.innerHeight - rect.top}px;
      left: ${rect.left}px;
      z-index: 10000;
    `;

    picker.addEventListener('click', (evt) => {
      if (evt.target.classList.contains('emoji-item')) {
        const emoji = evt.target.textContent;
        textInput.value += emoji;
        textInput.focus();
        picker.remove();
      }
    });

    document.body.appendChild(picker);
    document.addEventListener('click', (evt) => {
      if (!picker.contains(evt.target) && evt.target !== e.target) {
        picker.remove();
      }
    }, { once: true });
  }

  toggleVoiceControl(voiceBtn, textInput) {
    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech Recognition nicht unterstützt in diesem Browser');
      return;
    }

    if (this.voiceActive) {
      this.stopVoiceControl(voiceBtn);
      return;
    }

    // Start recording
    this.voiceActive = true;
    voiceBtn.style.background = '#ef4444';
    voiceBtn.style.borderColor = '#ef4444';
    voiceBtn.title = 'Recording... click to stop';
    voiceBtn.textContent = '🔴';

    const recognition = new SpeechRecognition();
    recognition.lang = 'de-DE'; // German
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalTranscript = '';
    let transcript = '';

    recognition.addEventListener('start', () => {
      console.log('🎤 Voice recording started');
    });

    recognition.addEventListener('result', (e) => {
      transcript = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcriptSegment = e.results[i][0].transcript;
        transcript += transcriptSegment;
        if (e.results[i].isFinal) {
          finalTranscript += transcriptSegment + ' ';
        }
      }

      // Show interim result
      textInput.placeholder = transcript || '🎤 Listening...';
    });

    recognition.addEventListener('end', () => {
      this.voiceActive = false;
      voiceBtn.style.background = '#1e293b';
      voiceBtn.style.borderColor = '#334155';
      voiceBtn.title = 'Voice-Control (click to start)';
      voiceBtn.textContent = '🎤';

      if (finalTranscript) {
        textInput.value += finalTranscript;
        textInput.placeholder = '📎 Drag files here, Ctrl+V paste, or type...';
        textInput.focus();
        console.log('✅ Voice transcript added:', finalTranscript);
      }
    });

    recognition.addEventListener('error', (e) => {
      console.error('🎤 Error:', e.error);
      this.voiceActive = false;
      voiceBtn.style.background = '#1e293b';
      voiceBtn.style.borderColor = '#334155';
      voiceBtn.textContent = '🎤';
    });

    this.voiceRecognition = recognition;
    recognition.start();
  }

  stopVoiceControl(voiceBtn) {
    if (this.voiceRecognition) {
      this.voiceRecognition.stop();
    }
    this.voiceActive = false;
  }

  createEmojiPicker() {
    const picker = document.createElement('div');
    picker.className = 'chat-emoji-picker-popup';
    picker.style.cssText = `
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 4px;
      padding: 8px;
      display: grid;
      grid-template-columns: repeat(8, 32px);
      gap: 4px;
      width: fit-content;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    `;

    const emojis = [
      '😀', '😂', '😍', '😎', '🤔', '😠', '😢', '🎉',
      '👍', '❤️', '🔥', '💯', '⚡', '🚀', '💡', '🎯',
      '📝', '📚', '💻', '🔍', '⏰', '📊', '🎨', '🎭',
      '🌟', '✨', '💎', '🏆', '🎁', '🎪', '🎸', '🎵',
      '☕', '🍕', '🍔', '🍜', '🍱', '🍰', '🍷', '🍹'
    ];

    emojis.forEach(emoji => {
      const btn = document.createElement('button');
      btn.className = 'emoji-item';
      btn.textContent = emoji;
      btn.style.cssText = `
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 4px;
        width: 32px;
        height: 32px;
        padding: 0;
        cursor: pointer;
        font-size: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.1s;
      `;
      btn.addEventListener('mouseenter', () => {
        btn.style.background = '#334155';
        btn.style.transform = 'scale(1.1)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = '#0f172a';
        btn.style.transform = 'scale(1)';
      });
      picker.appendChild(btn);
    });

    return picker;
  }

  handleFilesDrop(files, filesArea) {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'text/plain'];
    const maxSize = 10 * 1024 * 1024; // 10MB

    Array.from(files).forEach(file => {
      if (!allowedTypes.includes(file.type)) {
        console.warn(`❌ ${file.name}: unsupported type`);
        return;
      }
      if (file.size > maxSize) {
        console.warn(`❌ ${file.name}: exceeds 10MB limit`);
        return;
      }

      this.addFilePreview(file, filesArea);
    });
  }

  handlePasteEvent(e, filesArea) {
    const items = e.clipboardData?.items;
    if (!items) return;

    Array.from(items).forEach(item => {
      if (item.kind === 'file' && (item.type.startsWith('image/') || item.type === 'application/pdf' || item.type === 'text/plain')) {
        const file = item.getAsFile();
        if (file && file.size <= 10 * 1024 * 1024) {
          this.addFilePreview(file, filesArea);
          e.preventDefault();
        }
      }
    });
  }

  addFilePreview(file, filesArea) {
    const preview = document.createElement('div');
    preview.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 8px;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 4px;
      font-size: 11px;
      color: #cbd5e1;
      position: relative;
    `;

    const icon = document.createElement('span');
    if (file.type.startsWith('image/')) icon.textContent = '🖼️';
    else if (file.type === 'application/pdf') icon.textContent = '📄';
    else icon.textContent = '📝';

    const name = document.createElement('span');
    name.textContent = file.name.substring(0, 20) + (file.name.length > 20 ? '...' : '');
    name.title = file.name;

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✕';
    removeBtn.style.cssText = `
      background: none;
      border: none;
      color: #64748b;
      cursor: pointer;
      padding: 0 2px;
      font-size: 10px;
    `;
    removeBtn.addEventListener('click', () => {
      preview.remove();
      this.chatInput.files = this.chatInput.files.filter(f => f !== file);
    });

    preview.append(icon, name, removeBtn);
    filesArea.appendChild(preview);

    this.chatInput.files.push(file);
  }

  destroy() {
    if (this.ws) this.ws.close();
    clearTimeout(this.previewDebounce);
    window.removeEventListener('resize', () => this.handleResize());
    this.container.innerHTML = '';
  }
}

if (typeof module !== 'undefined') module.exports = { CanvasEditor };
