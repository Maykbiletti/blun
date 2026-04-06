(function() {
  var sessionId = "s-" + Math.random().toString(36).slice(2, 10) + Date.now();
  var isOpen = false;
  var messages = [];

  // Inject styles
  var style = document.createElement("style");
  style.textContent = [
    "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');",
    "#blun-support-bubble{position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;background:#3b82f6;cursor:pointer;z-index:10000;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(59,130,246,0.4);transition:transform 0.2s ease,box-shadow 0.2s ease;}",
    "#blun-support-bubble:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(59,130,246,0.5);}",
    "#blun-support-bubble svg{width:26px;height:26px;fill:#0a0a0a;}",
    "#blun-support-panel{position:fixed;bottom:92px;right:24px;width:380px;max-height:520px;background:#0a0a0a;border:1px solid #27272a;border-radius:16px;z-index:10001;display:flex;flex-direction:column;overflow:hidden;opacity:0;transform:translateY(16px) scale(0.95);pointer-events:none;transition:opacity 0.25s ease,transform 0.25s ease;font-family:Inter,sans-serif;box-shadow:0 8px 40px rgba(0,0,0,0.6);}",
    "#blun-support-panel.open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;}",
    "#blun-support-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:#111111;border-bottom:1px solid #27272a;}",
    "#blun-support-header h3{margin:0;font-size:15px;font-weight:600;color:#fafafa;letter-spacing:-0.01em;}",
    "#blun-support-header span{font-size:12px;color:#71717a;margin-left:8px;font-weight:400;}",
    "#blun-support-close{background:none;border:none;cursor:pointer;padding:4px;color:#71717a;transition:color 0.15s;}",
    "#blun-support-close:hover{color:#fafafa;}",
    "#blun-support-close svg{width:18px;height:18px;}",
    "#blun-support-messages{flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:12px;min-height:280px;max-height:360px;scrollbar-width:thin;scrollbar-color:#27272a transparent;}",
    "#blun-support-messages::-webkit-scrollbar{width:4px;}",
    "#blun-support-messages::-webkit-scrollbar-track{background:transparent;}",
    "#blun-support-messages::-webkit-scrollbar-thumb{background:#27272a;border-radius:2px;}",
    ".blun-msg{max-width:85%;padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.5;color:#e4e4e7;word-wrap:break-word;}",
    ".blun-msg.assistant{align-self:flex-start;background:#1a1a1a;border:1px solid #27272a;border-bottom-left-radius:4px;}",
    ".blun-msg.user{align-self:flex-end;background:#3b82f6;color:#0a0a0a;border-bottom-right-radius:4px;font-weight:500;}",
    ".blun-typing{align-self:flex-start;display:flex;gap:4px;padding:12px 16px;background:#1a1a1a;border:1px solid #27272a;border-radius:12px;border-bottom-left-radius:4px;}",
    ".blun-typing span{width:6px;height:6px;background:#52525b;border-radius:50%;animation:blun-dot 1.2s infinite;}",
    ".blun-typing span:nth-child(2){animation-delay:0.2s;}",
    ".blun-typing span:nth-child(3){animation-delay:0.4s;}",
    "@keyframes blun-dot{0%,60%,100%{opacity:0.3;transform:scale(0.8);}30%{opacity:1;transform:scale(1);}}",
    "#blun-support-input-wrap{display:flex;align-items:center;gap:8px;padding:12px 16px;background:#111111;border-top:1px solid #27272a;}",
    "#blun-support-input{flex:1;background:#1a1a1a;border:1px solid #27272a;border-radius:8px;padding:10px 14px;font-size:13px;color:#fafafa;font-family:Inter,sans-serif;outline:none;transition:border-color 0.15s;}",
    "#blun-support-input:focus{border-color:#3b82f6;}",
    "#blun-support-input::placeholder{color:#52525b;}",
    "#blun-support-send{background:#3b82f6;border:none;border-radius:8px;width:36px;height:36px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.15s;}",
    "#blun-support-send:hover{background:#2563eb;}",
    "#blun-support-send svg{width:16px;height:16px;fill:#0a0a0a;}",
    "#blun-support-footer{text-align:center;padding:8px;font-size:11px;color:#3f3f46;background:#0a0a0a;border-top:1px solid #18181b;}",
    "@media(max-width:440px){#blun-support-panel{right:8px;left:8px;width:auto;bottom:84px;max-height:70vh;}}"
  ].join("\n");
  document.head.appendChild(style);

  // Chat bubble
  var bubble = document.createElement("div");
  bubble.id = "blun-support-bubble";
  bubble.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/></svg>';
  bubble.setAttribute("aria-label", "Support Chat");
  document.body.appendChild(bubble);

  // Chat panel
  var panel = document.createElement("div");
  panel.id = "blun-support-panel";
  panel.innerHTML = [
    '<div id="blun-support-header">',
    '  <div><h3>BLUN Support<span>AI</span></h3></div>',
    '  <button id="blun-support-close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>',
    '</div>',
    '<div id="blun-support-messages"></div>',
    '<div id="blun-support-input-wrap">',
    '  <input id="blun-support-input" type="text" placeholder="Nachricht schreiben..." autocomplete="off" />',
    '  <button id="blun-support-send" aria-label="Send"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>',
    '</div>',
    '<div id="blun-support-footer">Powered by BLUN AI</div>'
  ].join("\n");
  document.body.appendChild(panel);

  var messagesEl = document.getElementById("blun-support-messages");
  var inputEl = document.getElementById("blun-support-input");
  var sendBtn = document.getElementById("blun-support-send");
  var closeBtn = document.getElementById("blun-support-close");

  function toggle() {
    isOpen = !isOpen;
    panel.classList.toggle("open", isOpen);
    if (isOpen && messages.length === 0) {
      addMessage("assistant", "Hi! Wie kann ich dir helfen?");
    }
    if (isOpen) inputEl.focus();
  }

  function addMessage(role, text) {
    messages.push({ role: role, text: text });
    var div = document.createElement("div");
    div.className = "blun-msg " + role;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showTyping() {
    var el = document.createElement("div");
    el.className = "blun-typing";
    el.id = "blun-typing-indicator";
    el.innerHTML = "<span></span><span></span><span></span>";
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function hideTyping() {
    var el = document.getElementById("blun-typing-indicator");
    if (el) el.remove();
  }

  function sendMessage() {
    var text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = "";
    addMessage("user", text);
    showTyping();

    var xhr = new XMLHttpRequest();
    xhr.open("POST", "/support/api/chat");
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onload = function() {
      hideTyping();
      try {
        var data = JSON.parse(xhr.responseText);
        sessionId = data.sessionId || sessionId;
        addMessage("assistant", data.reply || "...");
      } catch(e) {
        addMessage("assistant", "Connection error. Please try again.");
      }
    };
    xhr.onerror = function() {
      hideTyping();
      addMessage("assistant", "Connection error. Please try again.");
    };
    xhr.send(JSON.stringify({ message: text, sessionId: sessionId }));
  }

  bubble.addEventListener("click", toggle);
  closeBtn.addEventListener("click", toggle);
  sendBtn.addEventListener("click", sendMessage);
  inputEl.addEventListener("keydown", function(e) {
    if (e.key === "Enter") sendMessage();
  });
})();
