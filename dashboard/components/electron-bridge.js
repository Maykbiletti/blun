/**
 * Electron IPC Bridge — Desktop App Integration
 * Managed communication between Renderer Process and Electron Main Process
 *
 * Usage:
 *   ElectronBridge.invoke('app:minimize')
 *   ElectronBridge.on('app:update', (data) => {...})
 *   ElectronBridge.send('app:command', { action: 'save' })
 */

class ElectronBridge {
  constructor() {
    this.isDesktop = window.blunDesktop?.isDesktop || false;
    this.listeners = new Map();
    this.requestHandlers = new Map();
    this.pendingRequests = new Map();
    this.requestId = 0;

    if (this.isDesktop && window.ipcRenderer) {
      this._setupIpcListeners();
    }
  }

  /**
   * Setup IPC event listeners from Main Process
   */
  _setupIpcListeners() {
    // Listen for async responses from Main Process
    window.ipcRenderer.on('ipc:response', (event, data) => {
      const { id, success, result, error } = data;
      const request = this.pendingRequests.get(id);

      if (request) {
        this.pendingRequests.delete(id);
        if (success) {
          request.resolve(result);
        } else {
          request.reject(new Error(error));
        }
      }
    });

    // Listen for broadcast events from Main Process
    window.ipcRenderer.on('ipc:event', (event, data) => {
      const { channel, payload } = data;
      this._dispatchEvent(channel, payload);
    });
  }

  /**
   * Invoke a command on Main Process (async with response)
   */
  async invoke(channel, args = {}) {
    if (!this.isDesktop || !window.ipcRenderer) {
      console.warn(`[ElectronBridge] Desktop mode not available, skipping: ${channel}`);
      return null;
    }

    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`IPC request timeout: ${channel}`));
      }, 30000); // 30s timeout

      this.pendingRequests.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      window.ipcRenderer.send('ipc:invoke', {
        id,
        channel,
        args
      });
    });
  }

  /**
   * Send a one-way message to Main Process
   */
  send(channel, args = {}) {
    if (!this.isDesktop || !window.ipcRenderer) {
      console.warn(`[ElectronBridge] Desktop mode not available, skipping: ${channel}`);
      return;
    }

    window.ipcRenderer.send('ipc:message', {
      channel,
      args
    });
  }

  /**
   * Listen for events from Main Process
   */
  on(channel, callback) {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, []);
    }
    this.listeners.get(channel).push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(channel);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    };
  }

  /**
   * Listen once for an event
   */
  once(channel, callback) {
    const unsubscribe = this.on(channel, (data) => {
      unsubscribe();
      callback(data);
    });
    return unsubscribe;
  }

  /**
   * Dispatch events to local listeners
   */
  _dispatchEvent(channel, payload) {
    const callbacks = this.listeners.get(channel) || [];
    callbacks.forEach(cb => {
      try {
        cb(payload);
      } catch (err) {
        console.error(`[ElectronBridge] Error in listener for ${channel}:`, err);
      }
    });
  }

  /**
   * App Control Commands
   */
  minimize() {
    return this.invoke('app:minimize');
  }

  maximize() {
    return this.invoke('app:maximize');
  }

  restore() {
    return this.invoke('app:restore');
  }

  close() {
    return this.invoke('app:close');
  }

  /**
   * Window Control
   */
  setWindowTitle(title) {
    return this.invoke('window:setTitle', { title });
  }

  getWindowInfo() {
    return this.invoke('window:getInfo');
  }

  focusWindow() {
    return this.invoke('window:focus');
  }

  /**
   * File System Operations
   */
  openFile(options = {}) {
    return this.invoke('fs:openFile', options);
  }

  saveFile(options = {}) {
    return this.invoke('fs:saveFile', options);
  }

  selectDirectory(options = {}) {
    return this.invoke('fs:selectDirectory', options);
  }

  readFile(filePath) {
    return this.invoke('fs:read', { path: filePath });
  }

  writeFile(filePath, content) {
    return this.invoke('fs:write', { path: filePath, content });
  }

  deleteFile(filePath) {
    return this.invoke('fs:delete', { path: filePath });
  }

  /**
   * System Integration
   */
  openExternal(url) {
    if (window.blunDesktop?.openExternal) {
      window.blunDesktop.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  }

  getSystemInfo() {
    return this.invoke('system:getInfo');
  }

  /**
   * Notifications & Dialogs
   */
  showNotification(options = {}) {
    return this.invoke('notification:show', options);
  }

  showMessageBox(options = {}) {
    return this.invoke('dialog:messageBox', options);
  }

  /**
   * Storage & Preferences
   */
  getPreference(key, defaultValue = null) {
    return this.invoke('prefs:get', { key, defaultValue });
  }

  setPreference(key, value) {
    return this.invoke('prefs:set', { key, value });
  }

  getAllPreferences() {
    return this.invoke('prefs:getAll');
  }

  /**
   * App Lifecycle
   */
  checkForUpdates() {
    return this.invoke('app:checkUpdates');
  }

  restartApp() {
    return this.invoke('app:restart');
  }

  getAppVersion() {
    return window.blunDesktop?.version || 'unknown';
  }

  getPlatform() {
    return window.blunDesktop?.platform || 'web';
  }

  /**
   * Dev Tools (Development Only)
   */
  openDevTools() {
    return this.invoke('dev:openTools');
  }

  reloadApp() {
    return this.invoke('dev:reload');
  }

  /**
   * Agent Communication (if Main Process hosts agents)
   */
  invokeAgent(agentId, method, args = {}) {
    return this.invoke('agent:invoke', {
      agentId,
      method,
      args
    });
  }

  subscribeAgentEvents(agentId) {
    return this.on(`agent:event:${agentId}`, (data) => {
      return data;
    });
  }

  /**
   * Cleanup
   */
  destroy() {
    this.listeners.clear();
    this.pendingRequests.clear();
    this.requestHandlers.clear();
  }
}

// Export singleton instance
const electronBridge = new ElectronBridge();

// Make globally available
window.electronBridge = electronBridge;

export default electronBridge;
