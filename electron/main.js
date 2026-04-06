const { app, BrowserWindow, Tray, Menu, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const { fork } = require("child_process");
const http = require("http");

const SERVER_PORT = 3200;
const SERVER_URL = "http://localhost:" + SERVER_PORT;
const IS_DEV = !app.isPackaged;

let mainWindow = null;
let tray = null;
let serverProcess = null;

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", function () {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function startServer() {
  return new Promise(function (resolve, reject) {
    var serverPath = path.join(__dirname, "..", "server.js");
    serverProcess = fork(serverPath, [], {
      env: Object.assign({}, process.env, {
        PORT: SERVER_PORT,
        NODE_ENV: "production",
        ELECTRON: "true"
      }),
      silent: true
    });

    serverProcess.on("error", function (err) {
      reject(err);
    });

    serverProcess.on("exit", function (code) {
      if (code !== 0 && code !== null) {
        console.error("Server exited with code " + code);
      }
    });

    // Poll until server responds
    var attempts = 0;
    var maxAttempts = 60;
    var interval = setInterval(function () {
      attempts++;
      http.get(SERVER_URL, function (res) {
        clearInterval(interval);
        resolve();
      }).on("error", function () {
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          reject(new Error("Server failed to start within 30 seconds"));
        }
      });
    }, 500);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#0a0a0a",
    title: "BLUN -- AI Organisator",
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: IS_DEV
    },
    show: false
  });

  // Show loading screen while server boots
  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.once("ready-to-show", function () {
    mainWindow.show();
  });

  mainWindow.on("closed", function () {
    mainWindow = null;
  });

  // Prevent title changes from web content
  mainWindow.on("page-title-updated", function (e) {
    e.preventDefault();
  });

  return mainWindow;
}

function createTray() {
  try {
    tray = new Tray(path.join(__dirname, "assets", "icon.png"));
    var contextMenu = Menu.buildFromTemplate([
      {
        label: "Show BLUN",
        click: function () {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      { type: "separator" },
      {
        label: "Quit",
        click: function () {
          app.quit();
        }
      }
    ]);
    tray.setToolTip("BLUN -- AI Organisator");
    tray.setContextMenu(contextMenu);
    tray.on("click", function () {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (err) {
    console.error("Tray creation failed:", err.message);
  }
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", function (info) {
    console.log("Update available:", info.version);
  });

  autoUpdater.on("update-downloaded", function (info) {
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Update Ready",
        message: "BLUN v" + info.version + " has been downloaded. It will be installed on restart.",
        buttons: ["Restart Now", "Later"]
      }).then(function (result) {
        if (result.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
    }
  });

  autoUpdater.on("error", function (err) {
    console.error("Auto-updater error:", err.message);
  });

  autoUpdater.checkForUpdates().catch(function (err) {
    console.error("Update check failed:", err.message);
  });
}

app.whenReady().then(function () {
  createWindow();
  createTray();

  startServer()
    .then(function () {
      console.log("Server started on port " + SERVER_PORT);
      if (mainWindow) {
        mainWindow.loadURL(SERVER_URL);
      }
    })
    .catch(function (err) {
      console.error("Failed to start server:", err.message);
      if (mainWindow) {
        dialog.showErrorBox(
          "Server Error",
          "Failed to start the BLUN server. Please check the logs.\n\n" + err.message
        );
      }
    });

  if (!IS_DEV) {
    setupAutoUpdater();
  }
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", function () {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on("before-quit", function () {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
