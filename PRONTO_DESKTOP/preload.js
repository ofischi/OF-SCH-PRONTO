const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('prontoDesktop', {
  onUpdateAvailable: (callback) => ipcRenderer.on('pronto-update-available', (_event, data) => callback(data))
});
