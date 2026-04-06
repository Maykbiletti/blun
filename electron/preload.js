const { contextBridge, ipcRenderer, shell } = require("electron");

contextBridge.exposeInMainWorld("blunDesktop", {
  platform: process.platform,
  version: require("./package.json").version,
  isDesktop: true,
  openExternal: function (url) {
    shell.openExternal(url);
  }
});
