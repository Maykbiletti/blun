const { contextBridge, ipcRenderer, shell } = require("electron");

// Expose safe IPC interface for Renderer Process
contextBridge.exposeInMainWorld("blunDesktop", {
  platform: process.platform,
  version: require("./package.json").version,
  isDesktop: true,
  openExternal: function (url) {
    shell.openExternal(url);
  }
});

// Expose safe IPC renderer (for ElectronBridge communication)
contextBridge.exposeInMainWorld("ipcRenderer", {
  send: function (channel, data) {
    // Whitelist allowed channels
    const allowedChannels = [
      'ipc:invoke',
      'ipc:message'
    ];
    if (allowedChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  on: function (channel, callback) {
    // Whitelist allowed response channels
    const allowedChannels = [
      'ipc:response',
      'ipc:event'
    ];
    if (allowedChannels.includes(channel)) {
      ipcRenderer.on(channel, callback);
    }
  }
});
