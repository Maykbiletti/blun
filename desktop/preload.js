const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Credentials management
  getStoredCredentials: () => ipcRenderer.invoke('get-stored-credentials'),
  storeCredentials: (credentials) => ipcRenderer.invoke('store-credentials', credentials),
  clearCredentials: () => ipcRenderer.invoke('clear-credentials'),

  // Window management
  minimizeToTray: () => ipcRenderer.invoke('minimize-to-tray'),
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', title, body),

  // Event listeners
  onNewChat: (callback) => ipcRenderer.on('new-chat', callback),
  onShowPreferences: (callback) => ipcRenderer.on('show-preferences', callback),

  // Remove event listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});