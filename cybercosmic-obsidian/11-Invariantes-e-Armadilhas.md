# 11 — Invariantes e armadilhas

## Invariantes (quebrar = bug)

- **Determinismo**: tudo que existe no mundo é função de `(seed, coordenadas)` — `hash4` / `rngAt` com um **sal único** por uso. Nunca `Math.random()` na geração. (Som e HUD podem.)
- **O Field decide, a geometria obedece**: se o transporte, a colisão ou outro gerador precisa saber que algo existe, a regra fica no Field e a geometria usa **as mesmas condições**. Exemplo real: o transporte mandava para vigas de treliça que a geração não criava (faltava checar o nó de origem e a célula macro) → `Field.frameCell` compartilhado.
- **Exclusões nos dois sentidos**: relevo das camadas evita passagens, canteiros, escadarias, poços, paredes de galeria e passarelas; e assentamentos, canteiros e pontos de chegada evitam o relevo (`reliefAt`). Ao criar algo, fazer o mesmo.
- **Posse**: cada peça é gerada por **um** chunk/célula (pelo centro), para não duplicar nas bordas.
- **Longe = macro**: o que precisa ser visto a quilômetros vai para `macrogen.js`; a camada chunk só existe perto.
- **Coordenadas**: Field usa **globais**; a cena usa `global − world.origin`. Sistemas guardam global e convertem ao posicionar.
- **Salvamento**: só `ctx.saving` (npm start sem flags, com um mundo escolhido) grava. O que muda no mundo vai para `ctx.worldState` **por id estável** (derivado do Field), nunca por contador de sessão.
- **Textos**: nada de texto de tela escrito no código — sempre `t('chave')`, com a chave nos **dois** arquivos de `src/i18n/`.
- **Eventos**: o que acontece no mundo ou com o corpo é emitido em `world.bus` (`core/events.js`); quem reage escuta. Nada de callbacks soltos entre sistemas.
- **Luzes**: nos geradores, use `B.lamp(x, y, z, cor, int, modo, { to, size, far })` — carcaça + lente + suporte até `to`. `B.light()` puro só quando a luz já nasce de algo que existe (tela, braseiro, carcaça). Luzes de sistemas que se movem ficam **em** uma peça do objeto (farol na viga, lâmpada na cabine).
- **Língua antiga**: texto da Cidade é sempre lista de tokens (nunca string pronta); traduzir é decidir, na hora de desenhar, quais palavras o léxico já entende. O que é conteúdo do mundo sai do Field (reabrir do arquivo refaz o texto pelo lugar).
- **Terminais**: onde há terminal é só `gen/sites.js` (cena, pistas, sensor e começo usam a mesma conta e os mesmos ids). As pistas são puras (`lang/leads.js`): o que um terminal cita é função da seed e do lugar; o que o jogador juntou fica em `slot.leads`.
- **REGRA ABSOLUTA — controle**: tudo que o teclado/mouse faz, o controle faz sozinho. Toda tecla nova vira ação em `controls/bindings.js` com botão; todo painel novo é navegável por `ui/padNav.js` (basta usar `<button>`, `<input>`, `<select>`, `[data-tab]`, `[data-id]` ou `[data-nav]`, e pôr a camada em `createPadNav({ layers })` em `app/ui.js`). Rodar `npm run check:pad`.
- **Modos**: o que um modo permite é perguntado a `ctx.rules` (`app/modes.js`); nada de `if (mode === ...)` espalhado. O modo Livre nunca pode quebrar.

## Armadilhas já pagas

| armadilha | o que fazer |
|---|---|
| Clipping planes do renderer recompilam **todos** os shaders na 1ª vez (1,5 s travado) | usar plano near oblíquo |
| A água lendo a própria textura de reflexo → "WebGL: too many errors" | desligar `uReflOn`/`uReflTex` durante o passe de reflexo |
| `BatchedMesh.optimize()` do r170 não marca `needsUpdate` | marcar atributos e índice depois |
| Duas câmeras dividindo a mesma lista/textura de índices por página → reenvio de tudo 2× por quadro | lista e textura por câmera (`fastLists`) |
| Frustum da projeção oblíqua tem o plano far distorcido | recortar com a projeção normal (`camera.userData.cull`) |
| Página reserva vazia não tem índice | checar `geometry.index` antes de usar |
| Envio grande de buffer trava o ANGLE (~250 ms) | páginas ≤ 2¹⁷ vértices, criadas em quadro calmo |
| `material.clone()` desliga os uniforms compartilhados | religar `S[k]` depois de clonar (ver LOD) |
| Trincheira de 56 m esconde o que está dentro para quem vê de longe | máquinas descem 14 m abaixo da laje |
| Transporte para o "mais próximo" pode cair dentro da colmeia/maciço | filtrar pontos em bioma aberto e longe de paredes |
| fps variando 3× entre execuções iguais | plano de energia do notebook — não é regressão ([[06-Render-e-Desempenho]]) |
| Heredoc/aspas no Bash do Windows | escrever scripts de patch em arquivo no scratchpad |
| Painel aberto durante a montagem da interface acessa outro painel ainda não criado (TDZ) | abrir painéis automáticos só no fim de `createUI` |
| Janela coberta por outra: o Chromium derruba o jogo a 1 quadro/s (o teste de fumaça "afundava" no meio) | `main.js` desliga a oclusão (`CalculateNativeWinOcclusion`, backgrounding) |
| Lanterna perto do corpo: intensidade de lâmpada estoura a tela (espalha na poeira) | intensidade baixa (2,4) — perto do corpo pouco já ilumina |
| Setor: CPU e GPU precisam do MESMO hash | `hash4` só usa inteiros (`Math.imul`, `>>>`): em GLSL é `uint` com as mesmas constantes |
| Inscrição com letras grandes demais: 80 m de largura, some atrás dos contrafortes | letras de ~1,4 m, ancoradas junto da abertura e seguindo ao longo da parede; o texto encolhe se não couber (traduzido é mais largo) |
| `offsetParent` para saber se um painel está visível | é sempre `null` em `position: fixed` (todos os painéis): use `getClientRects().length` |
| Navegação espacial "qualquer coisa naquela direção" | ← → pulavam para o diário e o foco pulava a linha dos botões; agora: linha seguinte primeiro, ← → só na mesma linha |
| Variável local chamada `t` esconde a função de tradução `t()` (o painel de transporte quebrou assim) | nunca chamar variável de `t` num arquivo que importa `t` de `i18n` |
| Cadeias de pistas "para a única mais próxima" fazem ciclo entre duas únicas vizinhas | de única em única, seguir a correnteza (direção por seed); elos só entre terminais que citam alguém |
| Render por software (sem GPU) a ~1 fps | o check inteiro estoura 6 min; rodar em partes; timers de flags atrasam em relação à captura |
| Trocar de mundo com o salvamento automático ligado grava o mundo velho por cima do novo (`beforeunload`) | desligar `ctx.saving` antes de recarregar |

## Checklist antes de commitar

1. `npm run check` passou (0 falhas, 0 erros).
2. Captura com névoa 0 e 0,3 se mudou algo visual.
3. Respeita [[02-Direcao-de-Arte]].
4. README atualizado se mudou controle, flag, destino ou estrutura.
5. Este cofre atualizado se mudou algo daqui.
6. **Commit (e push) ao fim de cada etapa e de cada fase** — pedido do usuário.
7. **`npm run check:pad` passa** se mexeu em interface, teclas ou painéis — regra absoluta: o controle faz tudo sem teclado.
