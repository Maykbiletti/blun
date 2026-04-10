// Desktop App JavaScript
let currentScreen = 'login';
let isLoggedIn = false;
let currentChatId = null;
let messages = [];

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const chatScreen = document.getElementById('chatScreen');
const loginForm = document.getElementById('loginForm');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messagesContainer = document.getElementById('messages');
const settingsModal = document.getElementById('settingsModal');

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    await loadStoredCredentials();
    setupEventListeners();
    setupIpcListeners();

    // Auto-login if credentials are stored
    const credentials = await window.electronAPI.getStoredCredentials();
    if (credentials.rememberLogin && credentials.apiKey) {
        await attemptLogin(credentials);
    }
});

// Load stored credentials into forms
async function loadStoredCredentials() {
    try {
        const credentials = await window.electronAPI.getStoredCredentials();

        // Login form
        document.getElementById('serverUrl').value = credentials.serverUrl || 'https://api.blun.ai';
        document.getElementById('apiKey').value = credentials.apiKey || '';
        document.getElementById('rememberLogin').checked = credentials.rememberLogin || false;

        // Settings form
        document.getElementById('settingsServerUrl').value = credentials.serverUrl || 'https://api.blun.ai';
        document.getElementById('settingsApiKey').value = credentials.apiKey || '';
    } catch (error) {
        console.error('Failed to load stored credentials:', error);
    }
}

// Setup event listeners
function setupEventListeners() {
    // Login form
    loginForm.addEventListener('submit', handleLogin);

    // Password toggle buttons
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.target.getAttribute('data-target');
            const input = document.getElementById(targetId);
            const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
            input.setAttribute('type', type);
            e.target.textContent = type === 'password' ? '👁' : '🙈';
        });
    });

    // Chat input
    messageInput.addEventListener('keydown', handleMessageInputKeydown);
    sendBtn.addEventListener('click', sendMessage);

    // Sidebar buttons
    document.querySelector('.new-chat-btn').addEventListener('click', createNewChat);
    document.querySelector('.settings-btn').addEventListener('click', showSettings);
    document.querySelector('.logout-btn').addEventListener('click', logout);
    document.querySelector('.minimize-btn').addEventListener('click', minimizeToTray);

    // Settings modal
    document.querySelector('.close-modal').addEventListener('click', hideSettings);
    document.getElementById('cancelSettings').addEventListener('click', hideSettings);
    document.getElementById('saveSettings').addEventListener('click', saveSettings);

    // Chat actions
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const title = e.target.getAttribute('title');
            if (title === 'Clear Chat') {
                clearCurrentChat();
            } else if (title === 'Export Chat') {
                exportCurrentChat();
            }
        });
    });

    // Auto-resize message input
    messageInput.addEventListener('input', autoResizeTextarea);
}

// Setup IPC event listeners
function setupIpcListeners() {
    if (window.electronAPI) {
        window.electronAPI.onNewChat(() => createNewChat());
        window.electronAPI.onShowPreferences(() => showSettings());
    }
}

// Handle login form submission
async function handleLogin(e) {
    e.preventDefault();

    const serverUrl = document.getElementById('serverUrl').value;
    const apiKey = document.getElementById('apiKey').value;
    const rememberLogin = document.getElementById('rememberLogin').checked;

    const credentials = { serverUrl, apiKey, rememberLogin };
    await attemptLogin(credentials);
}

// Attempt login with credentials
async function attemptLogin(credentials) {
    try {
        showLoadingState();

        // Simulate API connection test
        const isValid = await testConnection(credentials);

        if (isValid) {
            await window.electronAPI.storeCredentials(credentials);
            switchToScreen('chat');
            isLoggedIn = true;
            addWelcomeMessage();
        } else {
            showError('Invalid credentials or connection failed');
        }
    } catch (error) {
        showError('Connection failed: ' + error.message);
    } finally {
        hideLoadingState();
    }
}

// Test connection to BLUN API
async function testConnection(credentials) {
    try {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1500));

        // For demo purposes, accept any non-empty API key
        return credentials.apiKey && credentials.apiKey.length > 0;
    } catch (error) {
        console.error('Connection test failed:', error);
        return false;
    }
}

// Switch between screens
function switchToScreen(screenName) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });

    if (screenName === 'login') {
        loginScreen.classList.add('active');
        currentScreen = 'login';
    } else if (screenName === 'chat') {
        chatScreen.classList.add('active');
        currentScreen = 'chat';
        messageInput.focus();
    }
}

// Message input handling
function handleMessageInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function autoResizeTextarea() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
}

// Send message
async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    // Add user message
    addMessage('user', message);
    messageInput.value = '';
    autoResizeTextarea();

    // Show typing indicator
    showTypingIndicator();

    try {
        // Simulate API call to BLUN
        const response = await simulateAgentResponse(message);
        hideTypingIndicator();
        addMessage('assistant', response);
    } catch (error) {
        hideTypingIndicator();
        addMessage('error', 'Failed to send message: ' + error.message);
    }
}

// Simulate agent response
async function simulateAgentResponse(userMessage) {
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

    const responses = [
        "I understand your request. Let me help you with that.",
        "That's an interesting question! Here's what I think...",
        "I can assist you with that. Let me break it down for you.",
        "Great question! Based on what you've asked, here's my response...",
        "I'm here to help! Let me provide some information on that topic.",
    ];

    return responses[Math.floor(Math.random() * responses.length)] +
           `\n\nYour message: "${userMessage}"`;
}

// Add message to chat
function addMessage(sender, content) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${sender}`;

    const timestamp = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });

    messageElement.innerHTML = `
        <div class="message-content">
            <div class="message-text">${escapeHtml(content)}</div>
            <div class="message-timestamp">${timestamp}</div>
        </div>
    `;

    messagesContainer.appendChild(messageElement);
    scrollToBottom();

    messages.push({ sender, content, timestamp: new Date() });
}

// Add welcome message
function addWelcomeMessage() {
    addMessage('assistant', 'Welcome to BLUN Desktop! How can I help you today?');
}

// Show typing indicator
function showTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'message assistant typing-indicator';
    indicator.id = 'typing-indicator';
    indicator.innerHTML = `
        <div class="message-content">
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    messagesContainer.appendChild(indicator);
    scrollToBottom();
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.remove();
    }
}

// Scroll to bottom of messages
function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Chat management
function createNewChat() {
    messages = [];
    messagesContainer.innerHTML = '';
    currentChatId = 'chat_' + Date.now();
    addWelcomeMessage();
}

function clearCurrentChat() {
    if (confirm('Are you sure you want to clear this chat?')) {
        messages = [];
        messagesContainer.innerHTML = '';
        addWelcomeMessage();
    }
}

function exportCurrentChat() {
    if (messages.length === 0) {
        alert('No messages to export');
        return;
    }

    const chatData = {
        chatId: currentChatId,
        timestamp: new Date().toISOString(),
        messages: messages
    };

    const blob = new Blob([JSON.stringify(chatData, null, 2)], {
        type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blun-chat-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// Settings modal
function showSettings() {
    settingsModal.style.display = 'flex';
    loadStoredCredentials();
}

function hideSettings() {
    settingsModal.style.display = 'none';
}

async function saveSettings() {
    try {
        const serverUrl = document.getElementById('settingsServerUrl').value;
        const apiKey = document.getElementById('settingsApiKey').value;

        await window.electronAPI.storeCredentials({
            serverUrl,
            apiKey,
            rememberLogin: true
        });

        hideSettings();
        showSuccess('Settings saved successfully');
    } catch (error) {
        showError('Failed to save settings: ' + error.message);
    }
}

// Window controls
async function minimizeToTray() {
    try {
        await window.electronAPI.minimizeToTray();
    } catch (error) {
        console.error('Failed to minimize to tray:', error);
    }
}

async function logout() {
    if (confirm('Are you sure you want to logout?')) {
        try {
            await window.electronAPI.clearCredentials();
            isLoggedIn = false;
            messages = [];
            messagesContainer.innerHTML = '';
            switchToScreen('login');
        } catch (error) {
            console.error('Failed to logout:', error);
        }
    }
}

// UI State Management
function showLoadingState() {
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Connecting...';
}

function hideLoadingState() {
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Connect to BLUN';
}

function showError(message) {
    // Create toast notification
    const toast = createToast('error', message);
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 5000);
}

function showSuccess(message) {
    const toast = createToast('success', message);
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function createToast(type, message) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    Object.assign(toast.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '12px 20px',
        borderRadius: '8px',
        color: 'white',
        fontWeight: '500',
        zIndex: '10000',
        animation: 'slideIn 0.3s ease-out',
        backgroundColor: type === 'error' ? '#ef4444' : '#22c55e'
    });

    return toast;
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function openExternal(url) {
    // This will be handled by the main process
    console.log('Opening external URL:', url);
}

// Add CSS for toast animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    .typing-dots {
        display: flex;
        gap: 4px;
        padding: 8px 0;
    }

    .typing-dots span {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #94a3b8;
        animation: typing 1.4s infinite;
    }

    .typing-dots span:nth-child(2) {
        animation-delay: 0.2s;
    }

    .typing-dots span:nth-child(3) {
        animation-delay: 0.4s;
    }

    @keyframes typing {
        0%, 60%, 100% {
            transform: translateY(0);
            opacity: 0.5;
        }
        30% {
            transform: translateY(-10px);
            opacity: 1;
        }
    }

    .message {
        margin-bottom: 16px;
        display: flex;
        align-items: flex-end;
    }

    .message.user {
        justify-content: flex-end;
    }

    .message.assistant {
        justify-content: flex-start;
    }

    .message-content {
        max-width: 70%;
        background: white;
        padding: 12px 16px;
        border-radius: 16px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .message.user .message-content {
        background: #6366f1;
        color: white;
    }

    .message-text {
        margin-bottom: 4px;
        line-height: 1.4;
        white-space: pre-wrap;
    }

    .message-timestamp {
        font-size: 0.75rem;
        opacity: 0.6;
    }
`;
document.head.appendChild(style);