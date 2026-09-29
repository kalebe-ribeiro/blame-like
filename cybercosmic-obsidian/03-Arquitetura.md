# 03 — Arquitetura

## Processos

- **`main.js`** (processo principal do Electron): registra o protocolo `app://bundle/`, cria a janela, traduz flags de linha de comando em query string (`?seed=…&check=1…`), salva fotos em Imagens/CYBERCOSMIC, e no modo `--check` monta o relatório do teste de fumaça.
- **Renderer** (`index.html` → `src/app.js`): o jogo inteiro.
- **Workers** (`src/world/chunkWorker.js`): geram a geometria dos chunks fora da thread principal.

## O mundo é uma função pura

`Field` (`src/gen/field.js`) é **a lei do mundo**: funções puras de `(seed, coordenadas)` que dizem o que existe em cada lugar — pilares, passarelas, galerias, camadas, trincheiras, relevo… Tudo é **determinístico** (`hash4`, `rngAt` em `gen/hash.js`) e **memoizado** (`_memo`, limpo a cada 20 000 entradas).

Consequências:
- qualquer chunk sabe o que atravessa a sua borda, sem conversar com os vizinhos;
- o transporte (`world/teleport.js`) acha lugares **sem carregar nada**, só consultando o Field;
- sistemas que se movem (trens, máquinas) têm **horário determinístico**: posição = função do tempo.

## Camadas de streaming (`world/world.js`, `world/chunks.js`)

| camada | tamanho | alcance | o que gera |
|---|---|---|---|
| chunk (LOD0) | 192 m | `LOAD_RADIUS` 560 m | tudo de perto (`gen/chunkgen.js`), com colisão |
| LOD1 / LOD2 | 384 / 768 m | só com distância > 700 m | versões simplificadas |
| macro | 1600 m | `MACRO_RADIUS` até ~4–5 km | megaestruturas (`gen/macrogen.js`), com colisão |

- Um `WorkerPool` gera; cada camada faz poucos envios por quadro (`uploadsPerFrame`) para não travar.
- **Importante**: detalhes de escala humana só existem na camada chunk (perto). O que precisa ser visto de longe **tem de ir para a macro** (foi o que causou o "plano liso" da camada — ver [[12-Historico]]).

## Origem flutuante

Coordenadas **globais** (as do Field) × coordenadas **de cena** (`global − world.origin`). Quando a câmera passa de 1536 m da origem da cena, `world.maybeRebase` desloca tudo (chunks, luzes, sistemas, TAA). Todo sistema que guarda posições de cena implementa `rebase(delta)`.

## Desenho em lotes (`world/batches.js`)

Os chunks não viram `Mesh` na cena: cada material tem páginas de `THREE.BatchedMesh` (multi-draw). Detalhes em [[06-Render-e-Desempenho]].

## Bootstrap e loop (`src/app.js` + `src/app/`)

As peças compartilham um objeto de contexto `ctx`:

| módulo | papel |
|---|---|
| `app/render.js` | renderizador, pós-processamento, reflexo, foto |
| `app/body.js` | o corpo: passos por superfície, água, queda, vagões, vibração |
| `app/sound.js` | sons e avisos dos acontecimentos do mundo |
| `app/travel.js` | salvamento, diário, mapa da travessia |
| `app/ui.js` | tela de entrada, painéis, teclas, teleporte, novo mundo |
| `app/dev.js` | flags de desenvolvimento, `--stats`, `--check` |
| `app/saves.js` | **perfil global** + **um mundo salvo por modo**; `WorldState` (o que mudou no mundo, por id estável) |
| `app/modes.js` | **modos de jogo** (Livre, Peregrinação) e suas regras — o resto pergunta a `ctx.rules` |
| `app/player.js` | **estado do corpo**: energia, ferramentas, o que carrega, acesso |
| `app/carried.js` | o aparelho na mão (Peregrinação): lanterna (luz 'carried' do LightRig), célula de energia, tomadas |
| `app/wake.js` | queda e despertar (Peregrinação): assume a câmera durante a sequência |
| `app/reading.js` | E diante de um terminal: leitura (ensina), leitor portátil (fragmento), pegar o sensor, reabrir do arquivo |
| `app/leads.js` | **pistas** do mundo (Peregrinação): abrir, juntar partes, alcançar; `slot.leads`; eventos `lead:new/narrow/reached` |

`src/gen/sites.js`: **onde há terminais**, pela lei do mundo (estação, passagem, console de única) — a única fonte dos ids estáveis dos terminais; `siteById` refaz um terminal pelo id. `src/lang/leads.js`: quem cita quem (pistas), a linha ROTA, a área de incerteza e o começo do mundo — tudo puro.

`src/lang/`: a língua antiga (`ancient.js`: conceitos, escrita de estêncil, `drawTokens`), o léxico global (`lexicon.js`, no perfil — `ctx.lexicon`, também em `world.lexicon`) e o que os terminais dizem (`records.js`). Texto da língua antiga é sempre uma lista de **tokens** (`{w}` palavra, `{n}` número, `{c}` código, `{p}` pontuação), desenhada misturando o que é entendido (no idioma do jogo) e o resto (estêncil).

Fora de `app/`:
- `core/events.js` — **barramento de eventos** (`world.bus`): tudo o que acontece no mundo e com o corpo passa por ele; som, HUD e diário escutam. Sobrevive a um mundo novo.
- `i18n/` — **todos os textos da tela**: `t('chave', {params})`, `en.js` (padrão) e `pt.js`.

Início (`app.js`): perfil → modo (do perfil; `--game` nas sessões de desenvolvimento; na primeira vez, nenhum: a tela de entrada pede a escolha) → mundo salvo daquele modo → `ctx.rules`, `ctx.slot`, `ctx.worldState`, `ctx.player`.

Ordem de um quadro: controles → corpo → travessia → origem flutuante → mundo (streaming + sistemas + luzes) → reflexo → sons → render (silhuetas → reflexo → cena com SSAO/TAA → bloom → filme) → HUD → áudio.

## Materiais

Criados em `World._createMaterials()` a partir de receitas (concreto, concreto escuro, aço, borracha…) via `createSurfaceMaterial` (`shaders/materials.js`). Cada peça gerada escolhe o material pelo **nome** (`B.add('barrier', geo)`). Lista de nomes e parâmetros: [[04-Mundo-e-Geracao]].
