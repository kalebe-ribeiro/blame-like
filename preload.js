// Ponte mínima entre a página e o Electron (contextIsolation ligado).
// Só o que a página não consegue sozinha: a tela cheia sem gesto do usuário
// (um botão do controle não conta como gesto para a Fullscreen API) e a área
// de transferência (códigos de seed — app/share.js).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cybercosmic', {
  toggleFullscreen: () => ipcRenderer.send('fullscreen:toggle'),
  clipboardWrite: (text) => ipcRenderer.invoke('clipboard:write', String(text)),
  clipboardRead: () => ipcRenderer.invoke('clipboard:read'),
  // (dev: só responde no modo captura — main.js)
  devCapture: (name) => ipcRenderer.invoke('dev:capture', String(name)),
});
