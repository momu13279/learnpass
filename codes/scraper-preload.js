const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openLogin: () => ipcRenderer.invoke('open-login'),
  getStatus: () => ipcRenderer.invoke('get-status'),
  sync: () => ipcRenderer.invoke('sync'),
  getData: () => ipcRenderer.invoke('get-data'),
  logout: () => ipcRenderer.invoke('logout'),
  onLoginSuccess: (cb) => ipcRenderer.on('login-success', (e, data) => cb(data))
});