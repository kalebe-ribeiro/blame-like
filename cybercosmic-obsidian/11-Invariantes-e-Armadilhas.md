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
- **Laje das camadas**: `barrierSolid(b, x, z)` é a única verdade sobre onde a laje existe — passagens e **escotilhas** (`hatchAt`) a furam. Quem gera algo no topo da camada consulta isso (e `hatchesNear` para manter distância).
- **Setores religados**: `Field.sectorAt(x,y,z)` devolve `state: 'restored'` para um setor apagado que o jogador religou (conta como energizado em todo lugar que pergunta `=== 'dark'`). O que precisa da lei pura do mundo (a partida da Peregrinação, a escolha das subestações) usa `sectorAt(x, y, z, true)`. A mesma regra no shader: `sectorPower` consulta `uRestoredId/uRestoredFront` (8 setores mais perto).
- **Shaders no Windows (ANGLE/HLSL)**: `return` depois de um laço gera o aviso X4000 ("variável possivelmente não inicializada"), e o check reprova. Use uma variável de resultado e um `return` só.
- **Nada flutua** ([[02-Direcao-de-Arte]]): todo gerador novo precisa dizer onde a coisa se apoia. Pilares: `segmentPresent` só aceita trechos presos (camada ou volume sólido, via `_segRaw`). Plataformas da rede: `nodeLinked` (o GRUPO precisa chegar a uma passarela pelas pontes — busca no grafo, com cache). Sacadas: só onde a placa de parede existe. Pontes da rede: a borda de uma plataforma é o polígono, não o raio (`edgeDist` em `gen/network.js`); cantos do piso em x = sin θ, z = cos θ (convenção do CylinderGeometry). Inscrições de galeria: `galleryWallAt` (a mesma regra das placas de `buildGallery`).
- **Léxico**: cada fonte (terminal, inscrição) conta cada palavra **uma vez só** (`profile.lexSeen`: fonte → palavras já contadas). Fragmentos do leitor portátil usam o id do próprio terminal. Antes, cada fragmento era uma fonte nova e ler o mesmo terminal morto várias vezes ensinava tudo (exploit achado pelo usuário).
- **Língua antiga**: texto da Cidade é sempre lista de tokens (nunca string pronta); traduzir é decidir, na hora de desenhar, quais palavras o léxico já entende. O que é conteúdo do mundo sai do Field (reabrir do arquivo refaz o texto pelo lugar).
- **Terminais**: onde há terminal é só `gen/sites.js` (cena, pistas, sensor e começo usam a mesma conta e os mesmos ids). As pistas são puras (`lang/leads.js`): o que um terminal cita é função da seed e do lugar; o que o jogador juntou fica em `slot.leads`.
- **REGRA ABSOLUTA — controle**: tudo que o teclado/mouse faz, o controle faz sozinho. Toda tecla nova vira ação em `controls/bindings.js` com botão; todo painel novo é navegável por `ui/padNav.js` (basta usar `<button>`, `<input>`, `<select>`, `[data-tab]`, `[data-id]` ou `[data-nav]`, e pôr a camada em `createPadNav({ layers })` em `app/ui.js`). Rodar `npm run check:pad`.
- **Navegação espelha a geração**: `gen/nav.js` refaz as contas de `gen/network.js` (bordas, hélice da espiral com o mesmo RNG, curva da ponte suspensa, conectores) e de `buildWalk` (vãos, zonas reservadas). **Mudou a rede ou as passarelas → mudar o nav junto** e rodar `npm run check:beings`.
- **Seres**: posições GLOBAIS; perto do jogador, só o `Walker` move um corpo (nada de teleportar um corpo visível); um corpo nunca anda onde o chão não carregou (fica parado). Um corpo de teste nunca entra no salvamento (`persist: false`).
- **Safeguards**: nada surge do nada — um Safeguard ou está na ronda (onde o relógio diz), ou saiu de uma placa de parede que se abriu, ou veio andando pelo grafo. Sem luz própria. Perto do jogador, só o `Walker` move um corpo. Os sentidos (`senses`) vêm nulos quando o jogador está desmaiado ou voando: tratar sempre o nulo.
- **Chão em todo o espaço ocupado**: o que tem área (um assentamento, entulho) confere o chão no centro e em volta, não em 2 pontos — os estratos são placas de 80 m que podem faltar.
- **Shaders no Windows, 2**: ler textura com derivada implícita (`texture2D`) dentro de um laço também dá X3595 — use `textureLod(…, 0.0)` (passes de tela inteira não têm mipmap).
- **Testes**: nunca `| head` na saída do Electron (fecha o canal e o processo principal mostra um erro na tela do usuário); gravar num arquivo e filtrar depois.
- **Colisão de coisas finas**: as alturas dos raios são em metros do mundo (× escala), não proporcionais aos olhos de quem anda. o corpo testa paredes por raios em alturas fixas; uma peça fina (corrimão) entre duas alturas é atravessada. Se surgir uma peça fina numa altura nova, conferir as alturas de `_slide`/`_pushOut` em `controls/walker.js`.
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
| Raio de mira logo depois de um `--pos`/transporte não acha o chão | a colisão só tem as malhas depois que o chão em volta carregou (o corpo "paira" até lá); o raio de mira usa as malhas que o walker já recolheu no quadro |
| `offsetParent` para saber se um painel está visível | é sempre `null` em `position: fixed` (todos os painéis): use `getClientRects().length` |
| Navegação espacial "qualquer coisa naquela direção" | ← → pulavam para o diário e o foco pulava a linha dos botões; agora: linha seguinte primeiro, ← → só na mesma linha |
| Variável local chamada `t` esconde a função de tradução `t()` (o painel de transporte quebrou assim) | nunca chamar variável de `t` num arquivo que importa `t` de `i18n` |
| Cadeias de pistas "para a única mais próxima" fazem ciclo entre duas únicas vizinhas | de única em única, seguir a correnteza (direção por seed); elos só entre terminais que citam alguém |
| Render por software (sem GPU) a ~1 fps | o check inteiro estoura 6 min; rodar em partes; timers de flags atrasam em relação à captura |
| Trocar de mundo com o salvamento automático ligado grava o mundo velho por cima do novo (`beforeunload`) | desligar `ctx.saving` antes de recarregar |
| Um raio exatamente sobre a junta de duas peças (pontos do grafo em múltiplos de 12 m) erra as duas — o corpo caía pelo chão | o Walker procura o chão em 5 pontos; o "pulo do vão" dos seres em 3 |
| Geometria gerada atravessando caminhos verticais (duto na escada de manutenção; patamar em cima de quem sobe) | ao gerar algo perto de escada/elevador, testar SUBINDO de verdade (`check:moves`) |
| Dois Electron escrevendo no mesmo log (no Windows não há `pkill`) | `taskkill //F //IM electron.exe` antes de outro teste em segundo plano |

| Nome de script Python igual a um módulo da biblioteca (`types.py`): o Python importou o script no lugar do módulo e ele rodou duas vezes (inserções em dobro) | nomes de script que não colidem (`fix_types.py`) |
| Medir desempenho uma vez só: a mesma cena deu 22 ms e 14 ms em rodadas seguidas | comparar antes × depois alternando, na mesma sessão |
| Trabalho pesado de uma vez na linha principal (circuitos de ronda, montar todas as obras/terminais novos juntos) — travadas de 50–150 ms ao chegar | cálculo puro → worker (`world.circuitAsync`); montagem → uma por quadro; subida de chunks com teto de tempo (`UPLOAD_MS`) |

## Checklist antes de commitar

1. `npm run check` passou (0 falhas, 0 erros).
2. Captura com névoa 0 e 0,3 se mudou algo visual.
3. Respeita [[02-Direcao-de-Arte]].
4. README atualizado se mudou controle, flag, destino ou estrutura.
5. Este cofre atualizado se mudou algo daqui.
6. **Commit (e push) ao fim de cada etapa e de cada fase** — pedido do usuário.
7. **Só os checks pertinentes** (tabela em [[10-Comandos-e-Verificacao]]): `check:pad` se mexeu em interface, teclas ou painéis — regra absoluta: o controle faz tudo sem teclado.
