import { app, BrowserWindow, dialog, shell, ipcMain, Notification } from 'electron';
import path from 'path';
import http from 'http';
import handler from 'serve-handler';
import { setupCache } from './cache';

const FRONTEND_PORT = 31311;
let mainWindow: BrowserWindow | null = null;
let server: http.Server | null = null;

function getFrontendPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app', 'frontend-dist');
  }
  return path.join(__dirname, '..', 'frontend-dist');
}

function startStaticServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    const frontendPath = getFrontendPath();
    server = http.createServer((req, res) => {
      return handler(req, res, {
        public: frontendPath,
        rewrites: [{ source: '**', destination: '/index.html' }],
      });
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        // Try next port
        server!.listen(FRONTEND_PORT + 1, '127.0.0.1', () => {
          resolve(FRONTEND_PORT + 1);
        });
      } else {
        reject(err);
      }
    });

    server.listen(FRONTEND_PORT, '127.0.0.1', () => {
      resolve(FRONTEND_PORT);
    });
  });
}

function createWindow(port: number) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://localhost:${port}`);

  // Open external links in default browser, allow Google OAuth popups
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://accounts.google.com')) {
      return { action: 'allow' };
    }
    if (url.startsWith('http') && !url.includes(`localhost:${port}`)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    setupCache();
    const port = await startStaticServer();
    createWindow(port);

    // Badge count for dock icon
    ipcMain.handle('app:set-badge-count', (_event, count: number) => {
      app.setBadgeCount(count);
    });

    // Focus/show window (e.g. when notification is clicked)
    ipcMain.handle('app:focus-window', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });

    // Native notification via Electron's Notification module
    ipcMain.handle('app:show-notification', (_event, title: string, body: string, route?: string) => {
      if (!Notification.isSupported()) return;
      const notif = new Notification({ title, body, silent: false });
      notif.on('click', () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
          if (route) {
            mainWindow.webContents.executeJavaScript(
              `window.history.pushState(null, '', '${route}'); window.dispatchEvent(new PopStateEvent('popstate'));`
            );
          }
        }
      });
      notif.show();
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(port);
      }
    });
  } catch (err: any) {
    dialog.showErrorBox('Clack failed to start', err?.message || String(err));
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  server?.close();
});
