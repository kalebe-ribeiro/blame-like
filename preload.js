// Ponte mínima entre a página e o Electron (contextIsolation ligado).
// Só o que a página não consegue sozinha: a tela cheia sem gesto do usuário
// (um botão do controle não conta como gesto para a Fullscreen API).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cybercosmic', {
  toggleFullscreen: () => ipcRenderer.send('fullscreen:toggle'),
});
