const { app, BrowserWindow, Tray, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store();
let mainWindow;
let tray;

// Security: Disable node integration in renderer
const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: getIconPath(),
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default'
  });

  mainWindow.loadFile('renderer/index.html');

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();

    if (store.get('firstRun', true)) {
      mainWindow.center();
      store.set('firstRun', false);
    } else {
      const bounds = store.get('windowBounds');
      if (bounds) {
        mainWindow.setBounds(bounds);
      }
    }
  });

  // Save window bounds on close
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      return false;
    }

    if (!mainWindow.isDestroyed()) {
      store.set('windowBounds', mainWindow.getBounds());
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
};

const getIconPath = () => {
  if (process.platform === 'win32') {
    return path.join(__dirname, 'assets/icon.ico');
  } else if (process.platform === 'darwin') {
    return path.join(__dirname, 'assets/icon.icns');
  } else {
    return path.join(__dirname, 'assets/icon.png');
  }
};

const createTray = () => {
  const iconPath = process.platform === 'darwin'
    ? path.join(__dirname, 'assets/tray-icon-template.png')
    : path.join(__dirname, 'assets/tray-icon.png');

  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show BLUN',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      }
    },
    {
      label: 'New Chat',
      accelerator: 'CmdOrCtrl+N',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('new-chat');
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Preferences',
      accelerator: 'CmdOrCtrl+,',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('show-preferences');
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit BLUN',
      accelerator: 'CmdOrCtrl+Q',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip('BLUN - AI Assistant');

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    } else {
      createWindow();
    }
  });

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
};

// App event handlers
app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  // Keep app running on macOS when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

// IPC handlers
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-stored-credentials', () => {
  return {
    apiKey: store.get('apiKey', ''),
    serverUrl: store.get('serverUrl', 'https://api.blun.ai'),
    rememberLogin: store.get('rememberLogin', false)
  };
});

ipcMain.handle('store-credentials', (event, credentials) => {
  store.set('apiKey', credentials.apiKey);
  store.set('serverUrl', credentials.serverUrl);
  store.set('rememberLogin', credentials.rememberLogin);
  return true;
});

ipcMain.handle('clear-credentials', () => {
  store.delete('apiKey');
  store.delete('serverUrl');
  store.set('rememberLogin', false);
  return true;
});

ipcMain.handle('minimize-to-tray', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
  return true;
});

ipcMain.handle('show-notification', (event, title, body) => {
  if (tray) {
    tray.displayBalloon({
      title: title,
      content: body
    });
  }
  return true;
});

// Auto-updater setup would go here in production
// require('update-electron-app')();