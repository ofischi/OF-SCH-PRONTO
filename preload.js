// PRONTO Sipariş Takibi — sayfaya yalnızca birkaç güvenli işlev açılır.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('prontoDesktop', {
  printPdf: (o) => ipcRenderer.invoke('pdf:print', o),                                  // gerçek (metin tabanlı) PDF
  saveFile: (bytes, name, opts) => ipcRenderer.invoke('file:save', bytes, name, opts),   // PDF'i diske yazar
  copyFile: (p) => ipcRenderer.invoke('file:copy', p),                                    // dosyayı panoya kopyalar (Ctrl+V)
  openWhatsApp: (phone) => ipcRenderer.invoke('wa:open', phone),
  openExternal: (u) => ipcRenderer.invoke('open:external', u),
  notify: (o) => ipcRenderer.invoke('app:notify', o)                                    // Windows bildirimi
});
