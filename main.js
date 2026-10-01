// ─────────────────────────────────────────────────────────────────────────────
//  Processo principal do Electron.
//  Serve os arquivos do projeto por um protocolo próprio (app://) — tudo local,
//  sem servidor. O protocolo dá à página uma origem "de verdade", o que permite
//  Web Workers em módulo (a geração do mundo infinito roda neles).
//
//  Atalhos globais da janela:
//    F11 → tela cheia      F12 → DevTools
//    (F2, no renderer, tira uma foto: salva em Imagens/CYBERCOSMIC sem perguntar)
//
//  Flags de linha de comando (úteis para desenvolvimento / screenshots):
//    electron . --capture=shot.png --view=spawn --delay=6 [--show]
//      captura um PNG da janela depois de N segundos e fecha o app.
//      --view aceita: spawn | abyss | up | far
//      --show mantém a janela visível (senão o Chromium desacelera o loop)
//      --gate mantém a tela de entrada aberta na captura
//    electron . --goto=colmeia  → começa transportado ao exemplar mais próximo do tipo
//    electron . --outage=4 → força um apagão de setor aos 4 s
//    electron . --collapse=4 → força um colapso distante aos 4 s
//    electron . --wake=4 → desmaio aos 4 s (a sequência de queda e despertar)
//    electron . --map=20 → abre o mapa da travessia aos 20 s
//    electron . --controls=3 → abre a aba CONTROLES aos 3 s
//    electron . --goto=subestacao --restore=8 → religa o setor da subestação em frente aos 8 s
//    electron . --sensor=terminal → com o sensor ligado (terminal | energy | motion), só na sessão
//    electron . --stats   → imprime FPS e estatísticas do streaming no terminal
//    electron . --novsync → sem limite de quadros (medir desempenho)
//    electron . --check   → teste de fumaça: visita todos os destinos (npm run check)
//    electron . --check=trelica,escadaria --pos=x,y,z → só esses, partindo daí
//    electron . --profile=tmp → perfil separado: não toca no seu salvamento/diário
//    electron . --autopilot=6  → começa em piloto automático (N = multiplicador de velocidade)
//    electron . --pos=x,y,z,yaw,pitch  → começa num ponto global qualquer
//    electron . --mode=fly               → começa voando (o padrão é andar)
//    electron . --game=pilgrimage        → modo de jogo desta sessão (free | pilgrimage)
//    electron . --fog=0.3 --dist=1500     → sobrescreve névoa/distância nesta sessão (não salva)
// ─────────────────────────────────────────────────────────────────────────────
const { app, BrowserWindow, Menu, protocol, session, ipcMain, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

const capturePath = argValue('capture');
const view = argValue('view');
const seed = argValue('seed');
const captureDelay = Number(argValue('delay') || 6);
const forceShow = process.argv.includes('--show');
const stats = process.argv.includes('--stats');
const autopilot = argValue('autopilot');
const startPos = argValue('pos');
const mode = argValue('mode');
const gotoKind = argValue('goto');
const fogArg = argValue('fog');
const distArg = argValue('dist');

// O áudio precisa começar sem gesto no modo captura (e não atrapalha no normal).
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Janela coberta por outra (oclusão no Windows): o Chromium cai para 1 quadro/s.
// Um mundo que continua vivo (e o teste de fumaça) não podem parar por isso.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
// --check: teste de fumaça (roteiro por todos os destinos) — ver src/dev/check.js
const checkMode = process.argv.includes('--check') || !!argValue('check');
// a saída do terminal pode ser fechada antes do fim (um `| head`): não é erro do jogo
for (const st of [process.stdout, process.stderr]) st?.on?.('error', () => {});
if (checkMode) app.setPath('userData', path.join(require('os').tmpdir(), 'cybercosmic-check'));

// --profile=pasta: perfil separado (salvamento, diário, configurações) — para testes
if (argValue('profile')) app.setPath('userData', path.resolve(argValue('profile')));

// --novsync: sem limite de quadros (para medir desempenho de verdade)
if (process.argv.includes('--novsync')) {
  app.commandLine.appendSwitch('disable-gpu-vsync');
  app.commandLine.appendSwitch('disable-frame-rate-limit');
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function serveProjectFiles() {
  const root = path.resolve(__dirname);
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    const file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root)) return new Response('forbidden', { status: 403 });
    try {
      const data = await fs.promises.readFile(file);
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      return new Response(data, { headers: { 'content-type': type } });
    } catch {
      return new Response('not found', { status: 404 });
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 800,
    minHeight: 450,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    title: 'CYBERCOSMIC',
    show: !capturePath || forceShow, // em modo captura a janela fica oculta
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // tela cheia pelo controle (preload.js)
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  const query = new URLSearchParams();
  // --gate: captura com a tela de entrada aberta (para conferir textos)
  if (capturePath && !process.argv.includes('--gate')) query.set('autostart', '1');
  if (view) query.set('view', view);
  if (seed) query.set('seed', seed);
  if (stats) query.set('stats', '1');
  if (autopilot) query.set('autopilot', autopilot);
  if (startPos) query.set('pos', startPos);
  if (mode) query.set('mode', mode);
  if (gotoKind) query.set('goto', gotoKind);
  if (argValue('game')) query.set('game', argValue('game')); // modo de jogo: free | pilgrimage
  if (argValue('outage')) query.set('outage', argValue('outage'));
  if (argValue('wake')) query.set('wake', argValue('wake'));
  if (argValue('read')) query.set('read', argValue('read'));
  if (argValue('lexicon')) query.set('lexicon', argValue('lexicon'));
  if (argValue('archive')) query.set('archive', argValue('archive'));
  if (process.argv.includes('--lantern')) query.set('lantern', '1');
  if (argValue('lantern')) query.set('lantern', argValue('lantern')); // --lantern=8: liga aos 8 s
  if (argValue('sensor')) query.set('sensor', argValue('sensor'));
  if (argValue('map')) query.set('map', argValue('map'));
  if (argValue('controls')) query.set('controls', argValue('controls'));
  if (argValue('restore')) query.set('restore', argValue('restore'));
  if (argValue('ride')) query.set('ride', argValue('ride'));
  if (argValue('mark')) query.set('mark', argValue('mark'));
  if (argValue('wakeas')) query.set('wakeas', argValue('wakeas')); // --wakeas=safeguard|npc: o sorteio do despertar forçado
  if (process.argv.includes('--climbup')) query.set('climbup', '1');
  if (process.argv.includes('--shaderprobe')) query.set('shaderprobe', '1');
  if (process.argv.includes('--nonpcs')) query.set('nonpcs', '1');
  if (process.argv.includes('--wreveal')) query.set('wreveal', '1');
  if (process.argv.includes('--sgwatch')) query.set('sgwatch', '1');
  for (const k of ['sgnear', 'sgdist', 'sgemerge', 'sgcam', 'talk', 'talkpick', 'wcam', 'hang', 'ledgestats', 'ambient', 'climbonly', 'shimmy', 'inventory', 'equip']) if (argValue(k)) query.set(k, argValue(k));
  if (argValue('gounique')) query.set('gounique', argValue('gounique'));
  if (argValue('body')) query.set('body', argValue('body')); // --body=6: um corpo de teste aos 6 s (fase 5)
  if (argValue('bodydist')) query.set('bodydist', argValue('bodydist'));
  if (argValue('bodyseed')) query.set('bodyseed', argValue('bodyseed'));
  if (process.argv.includes('--follow')) query.set('follow', '1');
  if (process.argv.includes('--followside')) query.set('followside', '1');
  if (argValue('collapse')) query.set('collapse', argValue('collapse'));
  if (checkMode) {
    query.set('check', argValue('check') || '1'); // --check=trelica,escadaria: só esses
    query.set('seed', 'abc');
    // o teste do controle começa na tela de entrada, como o jogador
    if (argValue('check') !== 'pad') query.set('autostart', '1');
  }
  if (fogArg) query.set('fog', fogArg);
  if (distArg) query.set('dist', distArg);
  const qs = query.toString();
  win.loadURL(`app://bundle/index.html${qs ? `?${qs}` : ''}`);

  // tela cheia pedida pela página (atalho 'fullscreen', teclado ou controle)
  ipcMain.removeAllListeners('fullscreen:toggle');
  ipcMain.on('fullscreen:toggle', () => win.setFullScreen(!win.isFullScreen()));
  // a área de transferência (códigos de seed compartilháveis — src/app/share.js)
  ipcMain.removeHandler('clipboard:write');
  ipcMain.removeHandler('clipboard:read');
  ipcMain.handle('clipboard:write', (_e, text) => clipboard.writeText(String(text).slice(0, 200000)));
  ipcMain.handle('clipboard:read', () => clipboard.readText().slice(0, 200000));

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    // F11 (tela cheia) é um atalho trocável: a página trata (controls/bindings.js → preload.js)
    if (input.key === 'F12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Encaminha avisos/erros do renderer para o terminal — ajuda muito ao expandir shaders.
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (checkMode) return onCheckMessage(level, message, sourceId, line);
    if (level >= 2) console.log(`[renderer] ${message} (${sourceId}:${line})`);
  });
  if (checkMode) {
    win.webContents.on('render-process-gone', (_e, d) => finishCheck(`processo do renderer caiu: ${d.reason}`));
    // o teste dos corpos anda de verdade (a pé, a ~2,3 m/s): tem mais tempo
    const limit = ['beings', 'safeguards', 'npcs'].includes(argValue('check')) ? 12 : 6;
    setTimeout(() => finishCheck(`tempo esgotado (${limit} min)`), limit * 60 * 1000);
  }

  if (capturePath) {
    setTimeout(async () => {
      const image = await win.webContents.capturePage();
      fs.writeFileSync(path.resolve(capturePath), image.toPNG());
      console.log(`captura salva em ${capturePath}`);
      app.quit();
    }, captureDelay * 1000);
  }
}

// ─── teste de fumaça ────────────────────────────────────────────────────────
const checkRows = [];
const checkErrors = [];
function onCheckMessage(level, message, sourceId, line) {
  if (message === 'CHECK:DONE') return finishCheck();
  if (message.startsWith('BEING ')) return console.log('    ' + message); // o rastro do teste dos corpos
  if (message.startsWith('CHECK:')) {
    const r = JSON.parse(message.slice(6));
    checkRows.push(r);
    const cols = [r.kind.padEnd(14), r.ok ? 'ok   ' : 'FALHA', r.fps !== undefined ? `${String(r.fps).padStart(4)} fps  pior ${String(r.worst).padStart(4)} ms` : '', r.why ?? '', r.at ? `@ ${r.at.join(',')}` : ''];
    console.log('  ' + cols.join('  '));
    return;
  }
  // avisos do Chromium sobre a GPU no fechamento não contam
  // erros de script/shader, e avisos de WebGL (erros de GL chegam como aviso)
  if ((level >= 3 || /^WebGL:|GL_INVALID|THREE\.WebGLProgram/.test(message)) && !/GPU state invalid/.test(message)) {
    checkErrors.push(`${message} (${sourceId}:${line})`);
    console.log(`  ERRO: ${message}`);
  }
}
let checkFinished = false;
function finishCheck(fatal) {
  if (checkFinished) return;
  checkFinished = true;
  const failed = checkRows.filter((r) => !r.ok);
  const fps = checkRows.filter((r) => r.fps).map((r) => r.fps);
  console.log('');
  console.log(`  destinos: ${checkRows.length} · falhas: ${failed.length} · erros: ${checkErrors.length}${fps.length ? ` · fps médio ${Math.round(fps.reduce((a, b) => a + b, 0) / fps.length)} (mín ${Math.min(...fps)})` : ''}`);
  if (fatal) console.log(`  FATAL: ${fatal}`);
  const pass = !fatal && !failed.length && !checkErrors.length && checkRows.length > 0;
  console.log(pass ? '  PASSOU' : '  REPROVOU');
  app.exit(pass ? 0 : 1);
}

app.whenReady().then(() => {
  // Sem menu: os aceleradores padrão (Ctrl+W fecha, Ctrl+R recarrega) colidem
  // com CTRL = descer + W = avançar.
  Menu.setApplicationMenu(null);
  serveProjectFiles();
  // fotos (F2): o renderer "baixa" o PNG; aqui ele vai direto para Imagens/CYBERCOSMIC
  session.defaultSession.on('will-download', (_e, item) => {
    const dir = path.join(app.getPath('pictures'), 'CYBERCOSMIC');
    fs.mkdirSync(dir, { recursive: true });
    item.setSavePath(path.join(dir, item.getFilename()));
  });
  createWindow();
});
app.on('window-all-closed', () => app.quit());
