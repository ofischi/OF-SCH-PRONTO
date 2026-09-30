// PRONTO Sipariş Takibi — Windows masaüstü kabuğu.
// Program sayfayı GitHub Pages'ten açar: index.html güncellenince 91 MB'lık .exe
// indirmeye gerek kalmaz; bir sonraki açılışta (veya F5 ile) yeni sürüm gelir.
const { app, BrowserWindow, Menu, shell, dialog, ipcMain, Notification } = require('electron');
const path = require('path'), fs = require('fs'), { execFile } = require('child_process');
const { autoUpdater } = require('electron-updater');

// Test için adres değiştirilebilir; kurulu programda her zaman GitHub adresi kullanılır
const APP_URL = (!app.isPackaged && process.env.PRONTO_URL) || 'https://ofischi.github.io/OF-SCH-PRONTO/';
const NO_CACHE = { extraHeaders: 'pragma: no-cache\ncache-control: no-cache\n' };
if (!app.requestSingleInstanceLock()) app.quit();
// Sadece PRONTO'nun kendi adresi (aynı köken + yol öneki) güvenilir sayılır
const sameApp = (u) => { try { const a = new URL(u), b = new URL(APP_URL); return a.origin === b.origin && a.pathname.startsWith(b.pathname); } catch { return false; } };

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 700, show: false,
    backgroundColor: '#f6f7fb', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: !app.isPackaged, webviewTag: false }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https:|mailto:|whatsapp:)/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => { if (!sameApp(url)) e.preventDefault(); });
  mainWindow.webContents.on('will-redirect', (e, url) => { if (!sameApp(url)) e.preventDefault(); });
  mainWindow.webContents.on('will-attach-webview', (e) => e.preventDefault());

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

// ---- PDF kaydet / paylaş (yalnızca PRONTO sayfasından gelen istekler kabul edilir)
const fromApp = (e) => e.senderFrame && String(e.senderFrame.url).startsWith(APP_URL);
const cleanName = (s) => (String(s || '').replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'PRONTO').replace(/(\.pdf)?$/i, '.pdf');
const madeFiles = new Set();   // yalnızca programın yazdığı dosyalar panoya kopyalanabilir
ipcMain.handle('file:save', async (e, bytes, name, o = {}) => {
  if (!fromApp(e)) return { ok: false, error: 'izin yok' };
  if (!(bytes instanceof Uint8Array) || bytes.length < 5 || bytes.length > 60 * 1024 * 1024) return { ok: false, error: 'geçersiz dosya' };
  if (Buffer.from(bytes.subarray(0, 5)).toString() !== '%PDF-') return { ok: false, error: 'yalnızca PDF kaydedilebilir' };
  try {
    let file;
    if (o && o.ask) {
      const r = await dialog.showSaveDialog(mainWindow, { title: 'PDF olarak kaydet', defaultPath: path.join(app.getPath('downloads'), cleanName(name)), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
      if (r.canceled || !r.filePath) return { ok: false, canceled: true };
      file = r.filePath.toLowerCase().endsWith('.pdf') ? r.filePath : r.filePath + '.pdf';
    } else {
      const dir = path.join(app.getPath('downloads'), 'PRONTO Siparişler');
      fs.mkdirSync(dir, { recursive: true });
      file = path.join(dir, cleanName(name));
    }
    fs.writeFileSync(file, Buffer.from(bytes));
    madeFiles.add(file);
    if (o && o.reveal) shell.showItemInFolder(file);
    return { ok: true, path: file };
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});
// Gerçek PDF: sayfanın yazdırma görünümü Chrome motoruyla PDF'e çevrilir (yazılar seçilebilir, dosya küçük)
let pdfBusy = false;
ipcMain.handle('pdf:print', async (e, o = {}) => {
  if (!fromApp(e)) return { ok: false, error: 'izin yok' };
  if (pdfBusy) return { ok: false, error: 'meşgul' };
  pdfBusy = true;
  const bw = BrowserWindow.fromWebContents(e.sender);
  try {
    let file;
    if (o.ask) {
      const r = await dialog.showSaveDialog(bw || mainWindow, { title: 'PDF olarak kaydet', defaultPath: path.join(app.getPath('downloads'), cleanName(o.fileName)), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
      if (r.canceled || !r.filePath) return { ok: false, canceled: true };
      file = r.filePath.toLowerCase().endsWith('.pdf') ? r.filePath : r.filePath + '.pdf';
    } else {
      const dir = path.join(app.getPath('downloads'), 'PRONTO Siparişler');
      fs.mkdirSync(dir, { recursive: true });
      file = path.join(dir, cleanName(o.fileName));
    }
    if (bw) bw.setBackgroundColor('#FFFFFF');   // pencere zemini PDF kenarlarına basılmasın
    const data = await e.sender.printToPDF({ pageSize: o.pageSize === 'A3' ? 'A3' : 'A4', landscape: !!o.landscape, printBackground: true, preferCSSPageSize: true });
    fs.writeFileSync(file, data);
    madeFiles.add(file);
    if (o.reveal) shell.showItemInFolder(file);
    return { ok: true, path: file };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  } finally { if (bw) bw.setBackgroundColor('#f6f7fb'); pdfBusy = false; }
});
ipcMain.handle('file:copy', (e, file) => new Promise((ok) => {
  file = String(file || '');
  if (!fromApp(e) || !madeFiles.has(file) || !fs.existsSync(file)) return ok(false);
  const reveal = () => { shell.showItemInFolder(file); ok(false); };   // kopyalanamazsa klasörde göster
  if (process.platform !== 'win32') return reveal();
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', 'Set-Clipboard -LiteralPath $env:PRONTO_FILE'],
    { env: { ...process.env, PRONTO_FILE: file }, windowsHide: true, timeout: 15000 }, (err) => (err ? reveal() : ok(true)));
}));
// WhatsApp: masaüstü uygulaması kuruluysa onu, değilse varsayılan tarayıcıda WhatsApp Web'i açar
ipcMain.handle('wa:open', async (e, phone) => {
  if (!fromApp(e)) return false;
  const num = /^\d{10,15}$/.test(String(phone || '')) ? String(phone) : '';
  const hasApp = !!app.getApplicationNameForProtocol('whatsapp://');
  const url = hasApp ? (num ? `whatsapp://send?phone=${num}` : 'whatsapp://') : (num ? `https://web.whatsapp.com/send?phone=${num}` : 'https://web.whatsapp.com/');
  try { await shell.openExternal(url); return hasApp ? 'app' : 'web'; } catch { return false; }
});
const OUT_OK = /^(https:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\/|whatsapp:|mailto:)/i;
ipcMain.handle('open:external', (e, url) => {
  url = String(url || '');
  if (!fromApp(e) || url.length > 8000 || !OUT_OK.test(url)) return false;
  return shell.openExternal(url).then(() => true, () => false);
});

// ---- Windows bildirimi: Teklif'ten onay bekleyen sipariş gelince (en fazla 2 sn'de bir)
let lastNotify = 0;
ipcMain.handle('app:notify', (e, o = {}) => {
  if (!fromApp(e) || !Notification.isSupported() || Date.now() - lastNotify < 2000) return false;
  lastNotify = Date.now();
  const n = new Notification({ title: String(o.title || 'PRONTO').slice(0, 80), body: String(o.body || '').slice(0, 200) });
  n.on('click', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
  n.show();
  if (mainWindow && !mainWindow.isFocused()) mainWindow.flashFrame(true);
  return true;
});

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

if (process.platform === 'win32') app.setAppUserModelId('com.ofischi.pronto');
app.whenReady().then(() => {
  const { session } = require('electron');
  const IZIN = new Set(['clipboard-sanitized-write', 'fullscreen']);
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(IZIN.has(perm) && sameApp(wc.getURL())));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => IZIN.has(perm));
  Menu.setApplicationMenu(null);
  createWindow();
  setupAutoUpdate();
});
app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
app.on('window-all-closed', () => app.quit());
