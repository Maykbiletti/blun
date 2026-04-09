const { app, BrowserWindow, Tray, Menu, dialog, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const { fork } = require("child_process");
const http = require("http");
const fs = require("fs");

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

/**
 * IPC Handler Registry
 */
function setupIpcHandlers() {
  // Handle invoke requests with responses
  ipcMain.on("ipc:invoke", async (event, data) => {
    const { id, channel, args } = data;
    let result = null;
    let error = null;
    let success = false;

    try {
      switch (channel) {
        // App Control
        case "app:minimize":
          if (mainWindow) mainWindow.minimize();
          success = true;
          break;
        case "app:maximize":
          if (mainWindow) mainWindow.maximize();
          success = true;
          break;
        case "app:restore":
          if (mainWindow) mainWindow.restore();
          success = true;
          break;
        case "app:close":
          if (mainWindow) mainWindow.close();
          success = true;
          break;
        case "app:checkUpdates":
          result = await autoUpdater.checkForUpdates();
          success = true;
          break;
        case "app:restart":
          app.relaunch();
          app.exit(0);
          break;

        // Window Control
        case "window:setTitle":
          if (mainWindow) mainWindow.setTitle(args.title || "BLUN");
          success = true;
          break;
        case "window:getInfo":
          if (mainWindow) {
            const bounds = mainWindow.getBounds();
            result = {
              bounds,
              isMaximized: mainWindow.isMaximized(),
              isMinimized: mainWindow.isMinimized(),
              isFocused: mainWindow.isFocused()
            };
          }
          success = true;
          break;
        case "window:focus":
          if (mainWindow) {
            mainWindow.focus();
            mainWindow.show();
          }
          success = true;
          break;

        // File System Operations
        case "fs:openFile":
          result = await dialog.showOpenDialog(mainWindow, {
            properties: ["openFile"],
            ...args
          });
          success = true;
          break;
        case "fs:saveFile":
          result = await dialog.showSaveDialog(mainWindow, args);
          success = true;
          break;
        case "fs:selectDirectory":
          result = await dialog.showOpenDialog(mainWindow, {
            properties: ["openDirectory"],
            ...args
          });
          success = true;
          break;
        case "fs:read":
          try {
            result = fs.readFileSync(args.path, "utf-8");
            success = true;
          } catch (err) {
            error = `Failed to read file: ${err.message}`;
          }
          break;
        case "fs:write":
          try {
            fs.writeFileSync(args.path, args.content, "utf-8");
            success = true;
          } catch (err) {
            error = `Failed to write file: ${err.message}`;
          }
          break;
        case "fs:delete":
          try {
            fs.unlinkSync(args.path);
            success = true;
          } catch (err) {
            error = `Failed to delete file: ${err.message}`;
          }
          break;

        // System Info
        case "system:getInfo":
          result = {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            appVersion: app.getVersion(),
            appPath: app.getAppPath()
          };
          success = true;
          break;

        // Notifications
        case "notification:show":
          await dialog.showMessageBox(mainWindow, {
            type: args.type || "info",
            title: args.title,
            message: args.message,
            detail: args.detail
          });
          success = true;
          break;
        case "dialog:messageBox":
          result = await dialog.showMessageBox(mainWindow, args);
          success = true;
          break;

        // Preferences (stored in app.getPath('userData'))
        case "prefs:get":
          try {
            const prefsPath = path.join(app.getPath("userData"), "prefs.json");
            if (fs.existsSync(prefsPath)) {
              const prefs = JSON.parse(fs.readFileSync(prefsPath, "utf-8"));
              result = prefs[args.key] !== undefined ? prefs[args.key] : args.defaultValue;
            } else {
              result = args.defaultValue;
            }
            success = true;
          } catch (err) {
            error = `Failed to get preference: ${err.message}`;
          }
          break;
        case "prefs:set":
          try {
            const prefsPath = path.join(app.getPath("userData"), "prefs.json");
            let prefs = {};
            if (fs.existsSync(prefsPath)) {
              prefs = JSON.parse(fs.readFileSync(prefsPath, "utf-8"));
            }
            prefs[args.key] = args.value;
            fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2), "utf-8");
            success = true;
          } catch (err) {
            error = `Failed to set preference: ${err.message}`;
          }
          break;
        case "prefs:getAll":
          try {
            const prefsPath = path.join(app.getPath("userData"), "prefs.json");
            if (fs.existsSync(prefsPath)) {
              result = JSON.parse(fs.readFileSync(prefsPath, "utf-8"));
            } else {
              result = {};
            }
            success = true;
          } catch (err) {
            error = `Failed to get preferences: ${err.message}`;
          }
          break;

        // Dev Tools
        case "dev:openTools":
          if (mainWindow && IS_DEV) {
            mainWindow.webContents.openDevTools();
          }
          success = true;
          break;
        case "dev:reload":
          if (mainWindow) {
            mainWindow.reload();
          }
          success = true;
          break;

        default:
          error = `Unknown IPC channel: ${channel}`;
      }
    } catch (err) {
      error = err.message;
    }

    // Send response back to renderer
    event.sender.send("ipc:response", {
      id,
      success: success && !error,
      result,
      error
    });
  });

  // Handle one-way messages
  ipcMain.on("ipc:message", (event, data) => {
    const { channel, args } = data;
    console.log(`[IPC] Message on ${channel}:`, args);
    // Process one-way messages here if needed
  });
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
  setupIpcHandlers();
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
