// PRONTO Sipariş Takibi — Windows masaüstü kabuğu.
// Program sayfayı GitHub Pages'ten açar: index.html güncellenince 91 MB'lık .exe
// indirmeye gerek kalmaz; bir sonraki açılışta (veya F5 ile) yeni sürüm gelir.
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

const APP_URL = 'https://ofischi.github.io/OF-SCH-PRONTO/';
const NO_CACHE = { extraHeaders: 'pragma: no-cache\ncache-control: no-cache\n' };
if (!app.requestSingleInstanceLock()) app.quit();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 700, show: false,
    backgroundColor: '#f6f7fb', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(APP_URL)) e.preventDefault(); });

  // İnternet yoksa boş ekran yerine açıklama
  mainWindow.webContents.on('did-fail-load', (_e, code, _d, url) => {
    if (code === -3 || !String(url).startsWith(APP_URL)) return;
    mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
      '<body style="font:16px Segoe UI,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#f6f7fb;color:#1c1c1e">' +
      '<div style="text-align:center"><h2>İnternet bağlantısı yok</h2><p>Bağlantı gelince yeniden deneyin.</p>' +
      '<button onclick="location.href=\'' + APP_URL + '\'" style="padding:10px 20px;border:0;border-radius:10px;background:#E6B22A;font-weight:700;cursor:pointer">Tekrar Dene</button></div></body>'));
  });

  // F5 / Ctrl+R: önbelleği atlayarak yenile
  mainWindow.webContents.on('before-input-event', (e, i) => {
    if (i.type === 'keyDown' && (i.key === 'F5' || (i.control && i.key.toLowerCase() === 'r'))) {
      e.preventDefault();
      if (mainWindow.webContents.getURL().startsWith(APP_URL)) mainWindow.webContents.reloadIgnoringCache();
      else mainWindow.loadURL(APP_URL, NO_CACHE);
    }
  });

  mainWindow.loadURL(APP_URL, NO_CACHE);
}

function setupAutoUpdate() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', () => {});
  autoUpdater.on('update-downloaded', async (info) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info', title: 'PRONTO Güncellemesi Hazır',
      message: `PRONTO ${info.version} güncellemesi indirildi.`,
      detail: 'Güncellemeyi şimdi kurmak için PRONTO yeniden başlatılacak.',
      buttons: ['Şimdi Güncelle', 'Daha Sonra'], defaultId: 0, cancelId: 1, noLink: true
    });
    if (result.response === 0) autoUpdater.quitAndInstall(false, true);
  });
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  setupAutoUpdate();
});
app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
app.on('window-all-closed', () => app.quit());
